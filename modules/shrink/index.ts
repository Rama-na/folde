import { effortPoint } from "./effort";
import { inspectPdf, losslessShrinkPdf } from "./lossless";
import { openDownsampleSession } from "./pdf-images";
import { searchForTarget, type Probe } from "./search";
import { formatBytes } from "@/lib/bytes";
import {
  type Attempt,
  type ImageCodec,
  type ShrinkResult,
  throwIfAborted,
} from "./types";

export * from "./types";
export { effortPoint } from "./effort";
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
) => Promise<Uint8Array>;

export interface ShrinkOptions {
  codec: ImageCodec;
  /** Omit to stop the ladder at rung 2 and refuse rather than lose text. */
  rasterizer?: Rasterizer;
  maxProbes?: number;
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
      { maxProbes: options.maxProbes },
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
