/**
 * The effort scalar.
 *
 * Compression quality is really two knobs — resolution and JPEG quality — and
 * searching a 2D space to hit a byte target is both slow and ambiguous (many
 * (dpi, quality) pairs produce the same size at very different legibility).
 *
 * So the product commits to one curve through that space, parameterised by a single
 * `effort` in [0, 1], and searches along it. The curve is chosen so that legibility
 * degrades as gracefully as possible: resolution is given up before quality, because
 * a slightly soft 150 DPI scan reads better than a blocky 300 DPI one at quality 0.3.
 */

export interface EffortPoint {
  /** Target resolution for embedded images. */
  dpi: number;
  /** JPEG quality, 0..1. */
  quality: number;
}

/** Resolution ceiling. Above this, rescanning detail nobody will look at. */
export const MAX_DPI = 300;
/** Below this, text inside a scanned image stops being reliably readable. */
export const MIN_DPI = 50;

export const MAX_QUALITY = 0.92;
export const MIN_QUALITY = 0.3;

/**
 * Map effort to a (dpi, quality) pair.
 *
 * Resolution falls across the whole range; quality is held high for the first half
 * and only then allowed to drop. That ordering is the legibility choice above.
 */
export function effortPoint(effort: number): EffortPoint {
  const t = clamp01(effort);
  const dpi = Math.round(MAX_DPI - t * (MAX_DPI - MIN_DPI));

  // Quality stays at its ceiling until effort passes 0.5, then falls to the floor.
  const qt = Math.max(0, (t - 0.5) / 0.5);
  const quality = MAX_QUALITY - qt * (MAX_QUALITY - MIN_QUALITY);

  return { dpi, quality: round2(quality) };
}

/**
 * The scale factor to apply to an image that is currently at `sourceDpi`, to bring
 * it to the effort point's target DPI. Never upscales — an image that is already
 * below the target resolution is left at its own size.
 */
export function scaleForDpi(sourceDpi: number, targetDpi: number): number {
  if (!Number.isFinite(sourceDpi) || sourceDpi <= 0) return 1;
  return Math.min(1, targetDpi / sourceDpi);
}

/**
 * Effective DPI of an image drawn into a box of a given size on the page.
 *
 * A PDF places an image into a rectangle measured in points (1/72 inch). An image
 * of 2480 pixels drawn into a 595pt-wide box is being displayed at 300 DPI, however
 * large the pixel buffer happens to be.
 */
export function effectiveDpi(pixels: number, points: number): number {
  if (points <= 0) return MAX_DPI;
  return (pixels / points) * 72;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
