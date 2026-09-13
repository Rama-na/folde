"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FileOutcome,
  WorkerRequest,
  WorkerResponse,
} from "@/workers/protocol";

/**
 * Drives the document worker from React.
 *
 * The worker is created lazily on first use and kept for the session — spinning one
 * up costs a module graph load, and a user who shrinks one batch usually shrinks
 * another. It is torn down on unmount so a closed tab does not leave work running.
 */

export interface ShrinkProgress {
  done: number;
  total: number;
  current: string;
}

export interface ShrinkJobState {
  running: boolean;
  progress: ShrinkProgress | null;
  outcomes: FileOutcome[];
  error: string | null;
}

const IDLE: ShrinkJobState = {
  running: false,
  progress: null,
  outcomes: [],
  error: null,
};

export function useShrinkJob() {
  const [state, setState] = useState<ShrinkJobState>(IDLE);
  const workerRef = useRef<Worker | null>(null);
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  /**
   * Warn before a refresh throws away a running job.
   *
   * Nothing is persisted, on purpose — browser storage on a shared or family device
   * is the wrong place for someone's Aadhaar. The cost of that choice is that a
   * mistimed reload during a forty-file run loses all of it, so the browser's own
   * confirmation is the mitigation. It is only armed while work is actually in
   * flight; a standing "are you sure" on an idle page trains people to click through.
   */
  useEffect(() => {
    if (!state.running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.running]);

  const ensureWorker = useCallback((): Worker => {
    workerRef.current ??= new Worker(
      new URL("../workers/document.worker.ts", import.meta.url),
      { type: "module" },
    );
    return workerRef.current;
  }, []);

  const run = useCallback(
    (
      files: Array<{ id: string; name: string; bytes: ArrayBuffer }>,
      targets: Array<[string, number | null]>,
      /** Largest a single attachment may be, for a mail job. Null for a portal. */
      splitBelow: number | null = null,
    ) => {
      const worker = ensureWorker();
      const jobId = crypto.randomUUID();
      jobRef.current = jobId;

      setState({
        running: true,
        progress: { done: 0, total: files.length, current: "" },
        outcomes: [],
        error: null,
      });

      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        // A late message from a cancelled or superseded job must not overwrite the
        // state of the current one.
        if (message.jobId !== jobRef.current) return;

        switch (message.type) {
          case "progress":
            setState((s) => ({ ...s, progress: { ...message } }));
            break;
          case "file":
            setState((s) => ({
              ...s,
              outcomes: [...s.outcomes, message.outcome],
            }));
            break;
          case "done":
            setState((s) => ({ ...s, running: false }));
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
        { type: "shrink", jobId, files, targets, splitBelow } satisfies WorkerRequest,
        files.map((f) => f.bytes),
      );
    },
    [ensureWorker],
  );

  const cancel = useCallback(() => {
    const jobId = jobRef.current;
    if (!jobId || !workerRef.current) return;
    workerRef.current.postMessage({
      type: "cancel",
      jobId,
    } satisfies WorkerRequest);
    jobRef.current = null;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const reset = useCallback(() => {
    jobRef.current = null;
    setState(IDLE);
  }, []);

  return { ...state, run, cancel, reset };
}
