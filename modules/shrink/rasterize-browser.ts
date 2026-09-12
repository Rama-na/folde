import { PDFDocument } from "pdf-lib";
import { throwIfAborted } from "./types";

/**
 * Rung 3 — render every page to an image and rebuild the document around them.
 *
 * This always reaches any sane target, and it permanently costs the user selectable,
 * searchable, copyable text. So it is the last rung, it never runs silently, and the
 * result is flagged `textPreserved: false` so the interface can say what was given
 * up before the user sends the file anywhere.
 *
 * It exists for the cases rung 2 cannot touch: a PDF whose images are Flate-encoded
 * rather than JPEG, a vector-heavy document with no images at all, or a target so
 * far below the content that nothing else gets there.
 *
 * Browser only — it needs a PDF renderer and a canvas. The ladder takes it as an
 * injected capability, so under the test runner it is simply absent and the ladder
 * refuses honestly instead.
 */
export async function rasterizePdf(
  source: Uint8Array,
  dpi: number,
  quality: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const pdfjs = await loadPdfJs();

  // pdf.js transfers ownership of the buffer it is given, which would leave the
  // caller holding a detached array between probes. It gets its own copy.
  const task = pdfjs.getDocument({ data: source.slice() });
  const doc = await task.promise;
  try {
    const out = await PDFDocument.create();
    const scale = dpi / 72;

    for (let n = 1; n <= doc.numPages; n++) {
      throwIfAborted(signal);

      const page = await doc.getPage(n);
      // The page keeps its original dimensions in points; only the pixel density
      // of the image drawn onto it changes. Otherwise a scanned A4 page would come
      // back as some other paper size.
      const pagePt = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale });

      const canvas = new OffscreenCanvas(
        Math.max(1, Math.floor(viewport.width)),
        Math.max(1, Math.floor(viewport.height)),
      );
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas unavailable in this worker");

      // Pages render with a transparent background; JPEG has no alpha, so without
      // this every page would come out black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        // pdf.js wants a DOM canvas; passing null and handing it the context
        // directly is the documented route for rendering onto an OffscreenCanvas.
        canvas: null,
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      page.cleanup();

      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      const image = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));

      const rebuilt = out.addPage([pagePt.width, pagePt.height]);
      rebuilt.drawImage(image, {
        x: 0,
        y: 0,
        width: pagePt.width,
        height: pagePt.height,
      });
    }

    return out.save({ useObjectStreams: true });
  } finally {
    await task.destroy();
  }
}

type PdfJs = typeof import("pdfjs-dist");
let cached: Promise<PdfJs> | null = null;

/**
 * Load pdf.js lazily and once.
 *
 * It is the single largest dependency in the product and most files never reach
 * rung 3, so making everyone download it up front would be a tax paid by the many
 * for the few. Loading it on demand keeps the first interaction fast on a phone.
 */
function loadPdfJs(): Promise<PdfJs> {
  cached ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  });
  return cached;
}
