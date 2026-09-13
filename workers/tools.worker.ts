/// <reference lib="webworker" />
import { Cancelled } from "@/modules/shrink/types";
import { renderPdfPages } from "@/modules/shrink/rasterize-browser";
import {
  extractPages,
  imagesToPdf,
  mergePdfs,
  pdfToImages,
  protectPdf,
  rebuildPdf,
  unlockPdf,
} from "@/modules/tools";
import type {
  ToolFile,
  ToolOp,
  ToolRequest,
  ToolResponse,
} from "./tools-protocol";

/**
 * The tools, off the main thread.
 *
 * Merging forty scanned documents, or rendering a hundred page thumbnails, is
 * seconds of solid work. On the main thread that is a frozen page and a cancel
 * button that cannot be pressed.
 *
 * Every operation here ends in exactly one `done` or one `error`, and anything it
 * could not use is named in the `done` rather than quietly missing.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;
const running = new Map<string, AbortController>();

scope.addEventListener("message", (event: MessageEvent<ToolRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    running.get(request.jobId)?.abort();
    running.delete(request.jobId);
    return;
  }
  void run(request.jobId, request.op);
});

async function run(jobId: string, op: ToolOp): Promise<void> {
  const controller = new AbortController();
  running.set(jobId, controller);

  try {
    switch (op.kind) {
      case "merge": {
        post({
          type: "progress",
          jobId,
          done: 0,
          total: op.files.length,
          current: "Reading the documents",
        });
        const result = await mergePdfs(op.files.map(toInput));
        if (!result.ok) return fail(jobId, result.reason);
        emit(jobId, "Merged.pdf", result.bytes);
        return finish(jobId, result.skipped);
      }

      case "rebuild": {
        const result = await rebuildPdf(bytes(op.file), op.plan);
        if (!result.ok) return fail(jobId, result.reason);
        emit(jobId, suffixed(op.file.name, "rearranged"), result.bytes);
        return finish(jobId);
      }

      case "extract": {
        const result = await extractPages(bytes(op.file), op.ranges);
        if (!result.ok) return fail(jobId, result.reason);
        emit(jobId, suffixed(op.file.name, `pages ${op.ranges}`), result.bytes);
        return finish(jobId);
      }

      case "images-to-pdf": {
        const result = await imagesToPdf(op.files.map(toInput), op.fit);
        if (!result.ok) return fail(jobId, result.reason);
        emit(jobId, "Photos.pdf", result.bytes);
        return finish(jobId, result.skipped);
      }

      case "pdf-to-images": {
        const result = await pdfToImages(
          bytes(op.file),
          renderPdfPages,
          {
            baseName: op.file.name,
            onStart: (page, of) =>
              post({
                type: "progress",
                jobId,
                done: page - 1,
                total: of,
                current: `Drawing page ${page} of ${of}`,
              }),
            onImage: (image) => emit(jobId, image.name, image.bytes),
          },
          controller.signal,
        );
        if (!result.ok) return fail(jobId, result.reason);
        return finish(jobId);
      }

      case "protect": {
        const skipped: { name: string; reason: string }[] = [];
        let made = 0;
        for (const [index, file] of op.files.entries()) {
          throwIfCancelled(controller.signal);
          post({
            type: "progress",
            jobId,
            done: index,
            total: op.files.length,
            current: file.name,
          });
          const result = await protectPdf(bytes(file), op.password);
          if (!result.ok) {
            skipped.push({ name: file.name, reason: result.reason });
            continue;
          }
          emit(jobId, suffixed(file.name, "locked"), result.bytes);
          made += 1;
        }
        if (made === 0) {
          return fail(
            jobId,
            skipped[0]?.reason ?? "None of these could be locked.",
          );
        }
        return finish(jobId, skipped);
      }

      case "unlock": {
        const result = await unlockPdf(bytes(op.file), op.password);
        if (!result.ok) return fail(jobId, result.reason);
        emit(jobId, suffixed(op.file.name, "unlocked"), result.bytes);
        return finish(jobId);
      }

      case "thumbnails": {
        // Deliberately tiny. These exist so somebody can tell page 7 from page 8
        // while dragging them around, and a legible thumbnail at 36 DPI is a
        // hundredth of the memory of a legible page.
        await renderPdfPages(
          bytes(op.file),
          { dpi: 36, quality: 0.6 },
          (rendered) => {
            post(
              {
                type: "thumbnail",
                jobId,
                page: rendered.page,
                of: rendered.of,
                bytes: transferable(rendered.bytes),
              },
              true,
            );
          },
          controller.signal,
        );
        return finish(jobId);
      }
    }
  } catch (err) {
    if (err instanceof Cancelled) return;
    fail(
      jobId,
      err instanceof Error && err.message
        ? err.message
        : "Something went wrong running this.",
    );
  } finally {
    running.delete(jobId);
  }
}

function toInput(file: ToolFile) {
  return { name: file.name, bytes: bytes(file) };
}

function bytes(file: ToolFile): Uint8Array {
  return new Uint8Array(file.bytes);
}

/**
 * "Statement.pdf" becomes "Statement (locked).pdf".
 *
 * The original name is kept whole so the file is still findable by the name the
 * person knows it by, and what happened to it is added rather than substituted.
 */
function suffixed(name: string, what: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem} (${what}).pdf`;
}

function emit(jobId: string, name: string, output: Uint8Array): void {
  const buffer = transferable(output);
  post(
    { type: "output", jobId, output: { name, bytes: buffer, size: buffer.byteLength } },
    true,
  );
}

function finish(
  jobId: string,
  skipped?: { name: string; reason: string }[],
): void {
  post({
    type: "done",
    jobId,
    ...(skipped && skipped.length > 0 ? { skipped } : {}),
  });
}

function fail(jobId: string, message: string): void {
  post({ type: "error", jobId, message });
}

function post(message: ToolResponse, transfer = false): void {
  if (!transfer) {
    scope.postMessage(message);
    return;
  }
  const buffer =
    message.type === "output"
      ? message.output.bytes
      : message.type === "thumbnail"
        ? message.bytes
        : null;
  // Transferred rather than copied. A structured clone of every page of a long
  // document would double peak memory at exactly the wrong moment.
  scope.postMessage(message, buffer ? [buffer] : []);
}

function transferable(source: Uint8Array): ArrayBuffer {
  // A view may cover only part of a larger buffer; transferring the underlying one
  // would hand over the wrong bytes.
  if (
    source.byteOffset === 0 &&
    source.byteLength === source.buffer.byteLength &&
    source.buffer instanceof ArrayBuffer
  ) {
    return source.buffer;
  }
  const copy = new ArrayBuffer(source.byteLength);
  new Uint8Array(copy).set(source);
  return copy;
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Cancelled();
}
