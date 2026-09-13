"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ToolOp,
  ToolOutput,
  ToolRequest,
  ToolResponse,
} from "@/workers/tools-protocol";

/**
 * Drives the tools worker from React.
 *
 * Every state a tool run can be in is represented here, because a tool that only
 * models success is a tool that shows a spinner forever the first time something
 * goes wrong. Idle, running with real progress, finished with measured outputs, or
 * failed with a sentence — and the sentence is always present on failure.
 */

export interface ToolProgress {
  done: number;
  total: number;
  current: string;
}

export interface ToolJobState {
  running: boolean;
  progress: ToolProgress | null;
  outputs: ToolOutput[];
  /** Files the operation could not use, named rather than dropped. */
  skipped: { name: string; reason: string }[];
  error: string | null;
  /** Thumbnails arrive one at a time, keyed by page number. */
  thumbnails: Map<number, string>;
  thumbnailsOf: number;
}

const IDLE: ToolJobState = {
  running: false,
  progress: null,
  outputs: [],
  skipped: [],
  error: null,
  thumbnails: new Map(),
  thumbnailsOf: 0,
};

export function useToolJob() {
  const [state, setState] = useState<ToolJobState>(IDLE);
  const workerRef = useRef<Worker | null>(null);
  const jobRef = useRef<string | null>(null);
  // Object URLs outlive React state, so they are tracked separately and revoked on
  // the way out. A hundred un-revoked page thumbnails is a hundred leaked bitmaps.
  const urlsRef = useRef<string[]>([]);

  const releaseUrls = useCallback(() => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      releaseUrls();
    };
  }, [releaseUrls]);

  useEffect(() => {
    if (!state.running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.running]);

  const ensureWorker = useCallback((): Worker => {
    workerRef.current ??= new Worker(
      new URL("../workers/tools.worker.ts", import.meta.url),
      { type: "module" },
    );
    return workerRef.current;
  }, []);

  const run = useCallback(
    (op: ToolOp, transfer: ArrayBuffer[] = []) => {
      const worker = ensureWorker();
      const jobId = crypto.randomUUID();
      jobRef.current = jobId;
      releaseUrls();
      setState({ ...IDLE, running: true, thumbnails: new Map() });

      const onMessage = (event: MessageEvent<ToolResponse>) => {
        const message = event.data;
        // A late message from a superseded job must not overwrite the current one.
        if (message.jobId !== jobRef.current) return;

        switch (message.type) {
          case "progress":
            setState((s) => ({ ...s, progress: { ...message } }));
            break;
          case "output":
            setState((s) => ({ ...s, outputs: [...s.outputs, message.output] }));
            break;
          case "thumbnail": {
            const url = URL.createObjectURL(
              new Blob([message.bytes], { type: "image/jpeg" }),
            );
            urlsRef.current.push(url);
            setState((s) => {
              const next = new Map(s.thumbnails);
              next.set(message.page, url);
              return { ...s, thumbnails: next, thumbnailsOf: message.of };
            });
            break;
          }
          case "done":
            setState((s) => ({
              ...s,
              running: false,
              skipped: message.skipped ?? [],
            }));
            worker.removeEventListener("message", onMessage);
            break;
          case "error":
            setState((s) => ({ ...s, running: false, error: message.message }));
            worker.removeEventListener("message", onMessage);
            break;
        }
      };

      worker.addEventListener("message", onMessage);
      worker.postMessage(
        { type: "run", jobId, op } satisfies ToolRequest,
        transfer,
      );
    },
    [ensureWorker, releaseUrls],
  );

  const cancel = useCallback(() => {
    const jobId = jobRef.current;
    if (!jobId || !workerRef.current) return;
    workerRef.current.postMessage({
      type: "cancel",
      jobId,
    } satisfies ToolRequest);
    jobRef.current = null;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const reset = useCallback(() => {
    jobRef.current = null;
    releaseUrls();
    setState({ ...IDLE, thumbnails: new Map() });
  }, [releaseUrls]);

  return { ...state, run, cancel, reset };
}
