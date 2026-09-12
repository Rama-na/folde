/**
 * The rungs of the compression ladder, in the order they are attempted.
 *
 * Climb no further than the target requires. Each rung costs the user something the
 * previous one did not, and `rasterize` costs them text selection permanently.
 */
export type Rung =
  /** Already under target. Original bytes, untouched. */
  | "passthrough"
  /** Structural only — nothing visible changes. */
  | "lossless"
  /** Embedded images downsampled and re-encoded. Text and vectors untouched. */
  | "downsample"
  /** Pages rendered to images. Hits any target; loses text selection. */
  | "rasterize";

export const RUNG_ORDER: readonly Rung[] = [
  "passthrough",
  "lossless",
  "downsample",
  "rasterize",
];

export interface TranscodeRequest {
  width: number;
  height: number;
  /** JPEG quality, 0..1. */
  quality: number;
  /**
   * Media type of the input.
   *
   * The browser decodes from a Blob and a Blob needs its type: labelling a PNG as
   * JPEG leaves the decode to content sniffing, which mostly works and fails
   * exactly where it matters least predictably.
   */
  sourceType: string;
}

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * One operation: JPEG in, smaller JPEG out.
 *
 * Deliberately not a decode/encode pair. Both engines can decode straight to a
 * reduced size — libjpeg's shrink-on-load under `sharp`, `createImageBitmap`'s
 * resize options in the browser — which is several times faster than decoding at
 * full resolution and resampling afterwards, and never materialises the pixel
 * buffer. That matters: one A4 page at 300 DPI is roughly 35 MB of RGBA, so a
 * decode-then-resize design puts a mid-range phone into an out-of-memory kill
 * partway through someone's paperwork.
 *
 * Abstracted because the browser and the test runner have different engines
 * underneath. The ladder and the target search above this interface are shared, so
 * the logic that actually carries bugs is exercised by the same tests either way.
 */
export interface ImageCodec {
  transcodeJpeg(
    source: Uint8Array,
    request: TranscodeRequest,
  ): Promise<Uint8Array>;
  /**
   * Natural pixel dimensions of an image.
   *
   * Needed before any scale can be computed. Called once per file and cached by
   * the caller, so a slightly expensive implementation is acceptable — but never
   * inside the probe loop.
   */
  probeSize(source: Uint8Array, sourceType: string): Promise<ImageSize>;
}

/** One probe of the ladder at a given effort. */
export interface Attempt {
  bytes: Uint8Array;
  /** Measured length of `bytes`. Never an estimate. */
  size: number;
  rung: Rung;
  /** False once pages have been rasterized — the user must be told. */
  textPreserved: boolean;
}

export interface ShrinkResult extends Attempt {
  /** Did we actually meet the target? */
  ok: boolean;
  target: number;
  /** Size of the input, for reporting the saving. */
  originalSize: number;
  /**
   * Set when `ok` is false: the reason we could not get there, in language fit to
   * show a user. Never left empty on failure — silent failure is the one thing that
   * destroys trust in this product.
   */
  shortfall?: string;
}

export class Cancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "Cancelled";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Cancelled();
}
