import type { ImageCodec, ImageSize, TranscodeRequest } from "./types";

/**
 * The browser image codec, built on OffscreenCanvas so it runs inside a Web Worker
 * and never touches the main thread.
 *
 * Deliberately no WASM. A mozjpeg or libwebp build would encode slightly smaller,
 * but it costs a multi-megabyte download — and asking someone on patchy mobile data
 * to fetch 18 MB of WebAssembly so they can shrink a file to 200 KB is a bad trade.
 * The browser's own JPEG encoder is built in, already optimised, and free.
 */
export const browserCodec: ImageCodec = {
  async probeSize(source: Uint8Array, sourceType: string): Promise<ImageSize> {
    const bitmap = await createImageBitmap(
      new Blob([toArrayBuffer(source)], { type: sourceType }),
    );
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  },

  async transcodeJpeg(
    source: Uint8Array,
    { width, height, quality, sourceType }: TranscodeRequest,
  ): Promise<Uint8Array> {
    const blob = new Blob([toArrayBuffer(source)], { type: sourceType });

    // Decoding straight to the target size lets the browser skip most of the
    // full-resolution work, and avoids ever holding a full-size pixel buffer.
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "high",
    });

    try {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas unavailable in this worker");

      // JPEG has no alpha. Compositing onto white first means a transparent region
      // becomes white rather than the black it would otherwise default to.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      const encoded = await canvas.convertToBlob({
        type: "image/jpeg",
        quality,
      });
      return new Uint8Array(await encoded.arrayBuffer());
    } finally {
      bitmap.close();
    }
  },
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
