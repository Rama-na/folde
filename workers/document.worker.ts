/// <reference lib="webworker" />
import { shrinkFile } from "@/modules/shrink";
import { browserCodec } from "@/modules/shrink/codec-browser";
import { rasterizePdf } from "@/modules/shrink/rasterize-browser";
import { Cancelled } from "@/modules/shrink/types";
import { outputName } from "@/lib/file-type";
import type { FileOutcome, WorkerRequest, WorkerResponse } from "./protocol";

/**
 * All the heavy lifting, off the main thread.
 *
 * Shrinking a stack of scans is seconds of solid CPU per file. On the main thread
 * that is a frozen page — no scrolling, no cancelling, and on a phone an eventual
 * "this tab is not responding". Here the interface stays live throughout, which is
 * also what makes the cancel button real rather than decorative.
 *
 * Files are processed one at a time on purpose. Running them in parallel would
 * finish a small batch marginally sooner and put a mid-range phone into an
 * out-of-memory kill on a large one, losing work the user has already waited for.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Live jobs, so a cancel message can actually stop one mid-file. */
const running = new Map<string, AbortController>();

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "cancel") {
    running.get(request.jobId)?.abort();
    running.delete(request.jobId);
    return;
  }

  if (request.type === "shrink") {
    void runJob(request);
  }
});

async function runJob(
  request: Extract<WorkerRequest, { type: "shrink" }>,
): Promise<void> {
  const { jobId, files } = request;
  const targets = new Map(request.targets);
  const controller = new AbortController();
  running.set(jobId, controller);

  try {
    for (const [index, file] of files.entries()) {
      if (controller.signal.aborted) break;

      post({
        type: "progress",
        jobId,
        done: index,
        total: files.length,
        current: file.name,
      });

      const source = new Uint8Array(file.bytes);
      const target = targets.get(file.id) ?? null;

      // No target means this file is already small enough to carry as it is.
      // Handing it straight back is not an optimisation, it is the rule: a file
      // that already fits must never be re-encoded.
      if (target === null) {
        emit(jobId, {
          id: file.id,
          name: file.name,
          originalSize: source.byteLength,
          size: source.byteLength,
          bytes: file.bytes,
          rung: "passthrough",
          ok: true,
          textPreserved: true,
        });
        continue;
      }

      // One unreadable file must not cost the other forty-one. The whole job used
      // to stop on the first throw, which is how a crash in the rasterizer silently
      // truncated a run halfway and still looked like a success for the files that
      // had already finished.
      try {
        const result = await shrinkFile(
          source,
          target,
          { codec: browserCodec, rasterizer: rasterizePdf },
          controller.signal,
        );

        emit(jobId, {
          id: file.id,
          // "passthrough" is exactly the rung that returns the source bytes
          // unmodified, so it is exactly the rung that must keep the source name.
          name: outputName(
            file.name,
            result.kind,
            result.rung === "passthrough",
          ),
          originalSize: result.originalSize,
          size: result.size,
          bytes: toTransferable(result.bytes),
          rung: result.rung,
          ok: result.ok,
          textPreserved: result.textPreserved,
          shortfall: result.shortfall,
        });
      } catch (err) {
        if (err instanceof Cancelled) throw err;
        emit(jobId, {
          id: file.id,
          name: file.name,
          originalSize: source.byteLength,
          size: source.byteLength,
          bytes: toTransferable(source),
          rung: "passthrough",
          ok: false,
          textPreserved: true,
          shortfall:
            err instanceof Error && err.message
              ? `This file could not be processed: ${err.message}`
              : "This file could not be processed.",
        });
      }
    }

    if (!controller.signal.aborted) {
      post({
        type: "progress",
        jobId,
        done: files.length,
        total: files.length,
        current: "",
      });
      post({ type: "done", jobId });
    }
  } catch (err) {
    if (err instanceof Cancelled) return;
    post({
      type: "error",
      jobId,
      message:
        err instanceof Error ? err.message : "Something went wrong while compressing.",
    });
  } finally {
    running.delete(jobId);
  }
}

function emit(jobId: string, outcome: FileOutcome): void {
  // The bytes are transferred rather than copied — a structured clone of every
  // output would double peak memory at exactly the worst moment.
  scope.postMessage({ type: "file", jobId, outcome } satisfies WorkerResponse, [
    outcome.bytes,
  ]);
}

function post(message: WorkerResponse): void {
  scope.postMessage(message);
}

function toTransferable(bytes: Uint8Array): ArrayBuffer {
  // A Uint8Array view may cover only part of a larger buffer; transferring the
  // underlying buffer in that case would hand over the wrong bytes.
  if (
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength &&
    bytes.buffer instanceof ArrayBuffer
  ) {
    return bytes.buffer;
  }
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
