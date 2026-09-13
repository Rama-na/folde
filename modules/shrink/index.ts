import { detectType, isImage, type FileKind } from "@/lib/file-type";
import { effortPoint } from "./effort";
import { openImageSession } from "./image";
import { inspectPdf, losslessShrinkPdf } from "./lossless";
import { openDownsampleSession } from "./pdf-images";
import { searchForTarget, type Probe } from "./search";
import { formatBytes } from "@/lib/bytes";
import {
  type Attempt,
  type ImageCodec,
  type PageProgress,
  type ShrinkResult,
  throwIfAborted,
} from "./types";

export * from "./types";
export { effortPoint, imageEffortPoint, scaledSize, MIN_LONG_EDGE_PX } from "./effort";
export { openImageSession } from "./image";
export { searchForTarget } from "./search";
export { inspectPdf } from "./lossless";

/**
 * Rasterizing needs a PDF renderer and a canvas, which exist in the browser and not
 * under the test runner. The ladder takes it as an injected capability so rungs 0–2
 * stay testable in Node, and so a caller that would rather refuse than rasterize can
 * simply not supply one.
 */
export type Rasterizer = (
  source: Uint8Array,
  dpi: number,
  quality: number,
  signal?: AbortSignal,
  onPage?: PageProgress,
) => Promise<Uint8Array>;

export interface ShrinkOptions {
  codec: ImageCodec;
  /** Omit to stop the ladder at rung 2 and refuse rather than lose text. */
  rasterizer?: Rasterizer;
  maxProbes?: number;
  /** Reported from inside rung 3 only, which is the only rung slow enough to need it. */
  onPage?: PageProgress;
}

/**
 * How many page renders rung 3 is allowed to spend looking for a target.
 *
 * The cost of a probe here is pages × one render each, and the ladder used to spend
 * a flat four probes regardless — so a three-page scan cost twelve renders and a
 * 120-page statement cost four hundred and eighty. On a mid-range phone that is
 * minutes of a frozen-looking progress line, and the document that needs it most is
 * exactly the document least likely to be reachable at all, so most of that time was
 * being spent to arrive at a refusal.
 *
 * Budgeting renders rather than probes spends the same effort on every document:
 * short ones still get the full search and the precision that comes with it, long
 * ones get one careful pass instead of four wasted ones.
 */
const MAX_PAGE_RENDERS = 220;

function rasterProbeBudget(pages: number): number {
  if (pages <= 0) return 4;
  return Math.max(1, Math.min(4, Math.floor(MAX_PAGE_RENDERS / pages)));
}

/**
 * Shrink a PDF to fit `target` bytes, climbing the ladder no further than needed.
 *
 * The returned size is always measured from the returned bytes. If the target could
 * not be reached, `ok` is false and `shortfall` explains why in words fit to show
 * someone — this function never returns a number it has not verified, and never
 * pretends to have succeeded.
 */
export async function shrinkPdf(
  source: Uint8Array,
  target: number,
  options: ShrinkOptions,
  signal?: AbortSignal,
): Promise<ShrinkResult> {
  const originalSize = source.length;
  const base = { target, originalSize };

  const inspected = await inspectPdf(source);
  if (!inspected.ok) {
    return {
      ...base,
      ok: false,
      bytes: source,
      size: originalSize,
      rung: "passthrough",
      textPreserved: true,
      shortfall: inspected.reason,
    };
  }

  // Rung 0. Already fits — hand back the original bytes untouched. Re-encoding a
  // file that already meets the target destroys quality for no reason at all.
  if (originalSize <= target) {
    return {
      ...base,
      ok: true,
      bytes: source,
      size: originalSize,
      rung: "passthrough",
      textPreserved: true,
    };
  }

  throwIfAborted(signal);

  // Rung 1. Always run it: later rungs then start from a tidy document.
  let lossless: Uint8Array;
  try {
    lossless = await losslessShrinkPdf(source);
  } catch {
    lossless = source;
  }
  // Structural rewriting can very occasionally grow a file that was already
  // optimally packed. Keep whichever is smaller.
  if (lossless.length > originalSize) lossless = source;

  if (lossless.length <= target) {
    return {
      ...base,
      ok: true,
      bytes: lossless,
      size: lossless.length,
      rung: "lossless",
      textPreserved: true,
    };
  }

  let closest: Attempt = {
    bytes: lossless,
    size: lossless.length,
    rung: "lossless",
    textPreserved: true,
  };

  // Rung 2. Downsample embedded images, leaving text and vectors alone.
  //
  // The session parses the document and decodes its images once; each probe below
  // then only re-encodes, which is what makes a multi-pass search affordable on a
  // phone. A null session means this rung has nothing eligible to work on.
  const session = await openDownsampleSession(lossless, options.codec);
  if (session) {
    const downsampleProbe: Probe = async (effort, sig) => {
      const bytes = await session.probe(effortPoint(effort), sig);
      // Nothing usefully replaceable at this setting: report the input so the
      // search sees a real, measured size rather than a special case.
      const out = bytes ?? lossless;
      return {
        bytes: out,
        size: out.length,
        rung: "downsample",
        textPreserved: true,
      };
    };

    const downsampled = await searchForTarget(
      downsampleProbe,
      target,
      { maxProbes: options.maxProbes },
      signal,
    );
    if (downsampled.best) {
      return { ...base, ...downsampled.best, ok: true };
    }
    if (downsampled.closest.size < closest.size) closest = downsampled.closest;
  }

  // Rung 3. Render pages to images. This always reaches any sane target, and costs
  // the user text selection and searchability permanently — so it is last, and the
  // result carries textPreserved: false for the UI to warn about.
  if (options.rasterizer) {
    const rasterProbe: Probe = async (effort, sig) => {
      const point = effortPoint(effort);
      const bytes = await options.rasterizer!(
        lossless,
        point.dpi,
        point.quality,
        sig,
        options.onPage,
      );
      return {
        bytes,
        size: bytes.length,
        rung: "rasterize",
        textPreserved: false,
      };
    };

    const rasterized = await searchForTarget(
      rasterProbe,
      target,
      // Fewer probes than rung 2 allows, and fewer still the longer the document.
      // Every probe here re-renders every page, which is orders of magnitude dearer
      // than re-encoding an image, so the last few percent of precision is not worth
      // the wait on a phone — and on a long document it is not worth the minutes.
      { maxProbes: options.maxProbes ?? rasterProbeBudget(inspected.pages) },
      signal,
    );
    if (rasterized.best) {
      return { ...base, ...rasterized.best, ok: true };
    }
    if (rasterized.closest.size < closest.size) closest = rasterized.closest;
  }

  return {
    ...base,
    ...closest,
    ok: false,
    shortfall: explainShortfall(closest.size, target, !options.rasterizer),
  };
}

function explainShortfall(
  achieved: number,
  target: number,
  rasterizeUnavailable: boolean,
): string {
  const gap = `The smallest this file goes is ${formatBytes(
    achieved,
  )}, still over the ${formatBytes(target)} limit.`;

  if (rasterizeUnavailable) {
    return `${gap} Converting the pages to images would get there, but that would remove selectable text.`;
  }
  return `${gap} Splitting it into separate pages and uploading them one at a time is usually the way through.`;
}

/**
 * Shrink a photograph to fit `target` bytes.
 *
 * Two rungs. A file already under the target comes back untouched — the same rule as
 * everywhere else, and the one that matters most here, since a 40 KB signature asked
 * to reach 50 KB should never be re-encoded at all. Otherwise the same target search
 * used for PDFs runs along the image effort curve.
 *
 * Output is always JPEG. `textPreserved` is always true: there was never text to
 * lose, so a photograph never triggers the warning a rasterized PDF does.
 */
export async function shrinkImage(
  source: Uint8Array,
  target: number,
  sourceType: string,
  options: ShrinkOptions,
  signal?: AbortSignal,
): Promise<ShrinkResult> {
  const originalSize = source.length;
  const base = { target, originalSize };

  if (originalSize <= target) {
    return {
      ...base,
      ok: true,
      bytes: source,
      size: originalSize,
      rung: "passthrough",
      textPreserved: true,
    };
  }

  throwIfAborted(signal);

  let session;
  try {
    session = await openImageSession(source, sourceType, options.codec);
  } catch {
    return {
      ...base,
      ok: false,
      bytes: source,
      size: originalSize,
      rung: "passthrough",
      textPreserved: true,
      shortfall: describeUndecodable(sourceType),
    };
  }

  const probe: Probe = async (effort) => {
    const bytes = await session.probe(effort);
    return {
      bytes,
      size: bytes.length,
      rung: "downsample",
      textPreserved: true,
    };
  };

  const found = await searchForTarget(
    probe,
    target,
    { maxProbes: options.maxProbes },
    signal,
  );
  if (found.best) return { ...base, ...found.best, ok: true };

  const floor = session.sizeAt(1);
  return {
    ...base,
    ...found.closest,
    ok: false,
    shortfall:
      `The smallest this image goes is ${formatBytes(found.closest.size)}, still over ` +
      `the ${formatBytes(target)} limit. It is already down to ${floor.width}x${floor.height} ` +
      `pixels, and going smaller would make it too small for most forms to accept.`,
  };
}

/**
 * Why a photograph could not be read.
 *
 * HEIC gets its own sentence because it is common and fixable. Safari decodes it, so
 * it works on an iPhone; Chrome does not, and someone who took the photo on an iPhone
 * and is uploading from a laptop hits exactly this. Naming the setting is more use
 * than a multi-megabyte decoder would be.
 */
function describeUndecodable(sourceType: string): string {
  if (sourceType === "image/heic") {
    return (
      "This is an iPhone HEIC photo, which this browser cannot read. On the iPhone, " +
      "Settings > Camera > Formats > Most Compatible makes new photos JPEG, or open " +
      "it in Photos and share it as a JPEG."
    );
  }
  return "This image could not be read — it may be damaged or in an unsupported format.";
}

/**
 * Shrink whatever this is, chosen by its bytes rather than its name.
 *
 * The single entry point the worker calls. Dispatching on content matters: phones and
 * scanner apps routinely write a file whose extension does not match it, and sending
 * a photograph to the PDF parser tells its owner their file is damaged when it is
 * perfectly fine.
 */
export async function shrinkFile(
  source: Uint8Array,
  target: number,
  options: ShrinkOptions,
  signal?: AbortSignal,
): Promise<ShrinkResult & { kind: FileKind }> {
  const { kind, mime } = detectType(source);

  if (kind === "pdf") {
    return { ...(await shrinkPdf(source, target, options, signal)), kind };
  }

  if (isImage(kind) && mime) {
    return { ...(await shrinkImage(source, target, mime, options, signal)), kind };
  }

  return {
    target,
    originalSize: source.length,
    ok: false,
    bytes: source,
    size: source.length,
    rung: "passthrough",
    textPreserved: true,
    kind,
    shortfall:
      "This is not a PDF or a photo. Only PDFs, JPEGs and PNGs can be resized.",
  };
}
