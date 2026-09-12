import { imageEffortPoint, scaledSize } from "./effort";
import { type ImageCodec, type ImageSize } from "./types";

/**
 * Shrinking a standalone photograph.
 *
 * Far simpler than the PDF ladder, and deliberately so: a photograph has no
 * structure to tidy, no text to preserve, and nothing to rasterize. There are two
 * rungs — leave it alone, or re-encode it smaller — and the second one is the same
 * codec call the PDF rung already uses.
 *
 * This is the half of the product that was advertised and missing. `lib/presets.ts`
 * has offered a 100 KB preset noted "SSC photographs" since the beginning while the
 * app accepted PDFs only, so a passport photo — required by nearly every portal that
 * also wants a 200 KB PDF — had no route through.
 *
 * Organised as a session for the same reason the PDF rung is: measuring the natural
 * dimensions does not depend on the effort being tried, so it happens once and each
 * probe then only re-encodes.
 */

export interface ImageSession {
  readonly natural: ImageSize;
  /** Re-encode at this effort. Returns real bytes, always JPEG. */
  probe(effort: number): Promise<Uint8Array>;
  /** The dimensions the last probe at this effort would produce. */
  sizeAt(effort: number): ImageSize;
}

export async function openImageSession(
  source: Uint8Array,
  sourceType: string,
  codec: ImageCodec,
): Promise<ImageSession> {
  const natural = await codec.probeSize(source, sourceType);

  const sizeAt = (effort: number): ImageSize => {
    const { scale } = imageEffortPoint(effort);
    return scaledSize(natural.width, natural.height, scale);
  };

  return {
    natural,
    sizeAt,
    async probe(effort) {
      const { quality } = imageEffortPoint(effort);
      const { width, height } = sizeAt(effort);
      return codec.transcodeJpeg(source, {
        width,
        height,
        quality,
        sourceType,
      });
    },
  };
}
