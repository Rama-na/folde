import { PDFDocument } from "@cantoo/pdf-lib";
import { throwIfAborted } from "./types";
import type { PageProgress } from "./index";

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
  onPage?: PageProgress,
): Promise<Uint8Array> {
  const pdfjs = await loadPdfJs();
  const worker = getPdfWorker(pdfjs);

  // pdf.js transfers ownership of the buffer it is given, which would leave the
  // caller holding a detached array between probes. It gets its own copy.
  const task = pdfjs.getDocument({
    data: source.slice(),
    ...(worker ? { worker } : {}),
    CanvasFactory: OffscreenCanvasFactory,
  });
  const doc = await task.promise;
  try {
    const out = await PDFDocument.create();
    const scale = dpi / 72;

    for (let n = 1; n <= doc.numPages; n++) {
      throwIfAborted(signal);
      // Said before the page is rendered rather than after, so the number on screen
      // is the page being worked on rather than the last one finished. On a long
      // document this is the difference between a wait and a hang.
      onPage?.(n, doc.numPages);

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
 *
 * The *legacy* build, deliberately. The modern one calls
 * `Map.prototype.getOrInsertComputed`, a proposal recent enough that shipping
 * browsers do not have it, and it fails at render time with an error no user could
 * act on. The legacy build carries the polyfill. It is slightly larger; it also
 * works, which matters more on the phones this product is aimed at.
 */
function loadPdfJs(): Promise<PdfJs> {
  cached ??= (
    import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJs>
  ).then((pdfjs) => {
    // Served from public/, copied there at build time by scripts/copy-pdfjs-worker.
    // A bare specifier in `new URL(...)` is not resolved by the bundler, so the
    // fetch would 404.
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
    return pdfjs;
  });
  return cached;
}

/**
 * Canvases for pdf.js, made with OffscreenCanvas instead of the DOM.
 *
 * pdf.js needs scratch canvases of its own while rendering — for soft masks,
 * transparency groups, and scaling images down. Its default factory reaches for
 * `document.createElement("canvas")`, and there is no document in a Web Worker.
 *
 * The failure is worse than an exception: rendering a page at full size works,
 * because no intermediate canvas is needed, while the same page at a reduced size
 * hangs forever with nothing logged. So the first probe of a search succeeds and the
 * second never returns.
 *
 * pdf.js only duck-types this, and does not export its base class, so the shape is
 * reproduced here: construct with `{ enableHWA }`, and provide create/reset/destroy.
 */
class OffscreenCanvasFactory {
  #willReadFrequently: boolean;

  constructor({ enableHWA = false }: { enableHWA?: boolean } = {}) {
    this.#willReadFrequently = !enableHWA;
  }

  create(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", {
      willReadFrequently: this.#willReadFrequently,
    });
    return { canvas, context };
  }

  reset(
    canvasAndContext: { canvas: OffscreenCanvas | null },
    width: number,
    height: number,
  ) {
    if (!canvasAndContext.canvas) {
      throw new Error("Canvas is not specified");
    }
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: {
    canvas: OffscreenCanvas | null;
    context: unknown;
  }) {
    if (!canvasAndContext.canvas) return;
    // Zeroing the dimensions releases the backing store immediately rather than
    // waiting on the collector, which matters when a long document leaves dozens
    // of scratch canvases behind.
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

const WORKER_URL = "/pdf.worker.min.mjs";
let worker: InstanceType<PdfJs["PDFWorker"]> | null = null;
let workerFailed = false;

/**
 * Spawn pdf.js's worker ourselves and hand it over as a port.
 *
 * Left to itself, pdf.js will not start a worker from in here. Its own setup path
 * asks `_isSameOrigin(window.location, workerSrc)`, and inside a Web Worker there
 * is no `window` — the ReferenceError is swallowed by its surrounding try/catch and
 * it drops to "fake worker" mode, running the entire renderer inline on this
 * thread. Nothing fails; rendering a single page just goes from seconds to minutes,
 * which reads as a hang.
 *
 * Constructing the nested worker here and passing it as a port skips that check
 * entirely. One instance, reused: pdf.js refuses more than one PDFWorker per port,
 * and a fresh renderer per probe would be wasteful anyway.
 */
function getPdfWorker(pdfjs: PdfJs): InstanceType<PdfJs["PDFWorker"]> | null {
  if (worker || workerFailed) return worker;
  try {
    worker = new pdfjs.PDFWorker({
      // pdf.js types `port` as null-only, but the constructor reads it as a
      // MessagePort-like and this is the documented way to supply your own worker.
      port: new Worker(WORKER_URL, { type: "module" }) as unknown as null,
    });
  } catch {
    // Nested workers are unavailable on some older browsers. Falling back to
    // pdf.js's inline mode is slow but still correct, which beats refusing.
    workerFailed = true;
    worker = null;
  }
  return worker;
}
