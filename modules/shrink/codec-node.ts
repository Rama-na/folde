import "server-only";
import sharp from "sharp";
import type { ImageCodec, TranscodeRequest } from "./types";

/**
 * The Node-side image codec, used by the test runner and by any future server path.
 *
 * The browser uses `codec-browser` instead. Both sit behind the same interface so
 * the ladder, the effort curve and the target search — the parts that actually carry
 * bugs — are the same code in both environments.
 *
 * No mozjpeg. It encodes perhaps a tenth smaller and several times slower, and the
 * browser path has no equivalent, so enabling it here would make the test corpus
 * measure something users never get.
 */
export const nodeCodec: ImageCodec = {
  async transcodeJpeg(
    source: Uint8Array,
    { width, height, quality }: TranscodeRequest,
  ): Promise<Uint8Array> {
    const out = await sharp(Buffer.from(source))
      // sharp reaches for libjpeg's shrink-on-load here, so the image is never
      // fully decoded when it is being scaled down.
      .resize(width, height, { fit: "fill" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: Math.round(quality * 100) })
      .toBuffer();

    return new Uint8Array(out);
  },
};
