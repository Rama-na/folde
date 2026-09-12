import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
} from "pdf-lib";
import { effectiveDpi, scaleForDpi, type EffortPoint } from "./effort";
import { type ImageCodec, throwIfAborted } from "./types";

/**
 * Rung 2 — downsample the images inside a PDF, leave everything else alone.
 *
 * This is the rung that handles the overwhelming majority of real documents. A
 * scanned Aadhaar card or a photographed salary slip is almost entirely image bytes;
 * text and vector content is nearly free by comparison. Re-encoding only the images
 * gets the size down while leaving real text crisp, selectable and searchable —
 * which is the whole reason not to jump straight to rasterizing.
 *
 * Scope, deliberately narrow: only DCTDecode (JPEG) images are touched. Those are
 * what scanners and phone cameras produce, so they are the bytes that matter. Images
 * in other filters are left exactly as they are rather than risked — see the skip
 * rules in `shouldProcess` for why each one is excluded.
 *
 * The work is organised as a *session* because hitting a byte target takes several
 * encode passes. Parsing the PDF is the expensive step that does not depend on the
 * effort being tried, so a session parses once and holds the document across probes,
 * swapping streams in and out rather than reloading.
 */

/** Below this, an image is not worth a re-encode and may well grow. */
const MIN_IMAGE_BYTES = 4 * 1024;

interface Slot {
  ref: PDFRef;
  key: string;
  dict: PDFDict;
  /** The stream as it was loaded, restored after every probe. */
  original: PDFRawStream;
  contents: Uint8Array;
  widthPx: number;
  heightPx: number;
  /** Width in points of the page this image appears on, for the DPI estimate. */
  pageWidthPt: number;
}

export interface DownsampleSession {
  /** How many images this rung is willing to touch. Zero means it cannot help. */
  readonly candidates: number;
  /**
   * Re-encode at the given effort and return the resulting document, or null if
   * nothing could usefully be replaced at this setting.
   */
  probe(point: EffortPoint, signal?: AbortSignal): Promise<Uint8Array | null>;
}

/**
 * Open a downsampling session over a PDF, or return null when the rung has nothing
 * to work with — no eligible images, or the file will not parse.
 */
export async function openDownsampleSession(
  source: Uint8Array,
  codec: ImageCodec,
): Promise<DownsampleSession | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(source, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch {
    return null;
  }

  const slots = collectSlots(doc);
  if (slots.length === 0) return null;

  return {
    candidates: slots.length,

    async probe(point, signal) {
      const replacements: Array<{ slot: Slot; stream: PDFRawStream }> = [];

      for (const slot of slots) {
        throwIfAborted(signal);

        // How small does this image need to be to hit the target DPI on its page?
        const sourceDpi = effectiveDpi(slot.widthPx, slot.pageWidthPt);
        const scale = scaleForDpi(sourceDpi, point.dpi);

        // Nothing to gain from a re-encode at full size and near-full quality.
        if (scale >= 1 && point.quality >= 0.9) continue;

        const width = Math.max(1, Math.round(slot.widthPx * scale));
        const height = Math.max(1, Math.round(slot.heightPx * scale));

        let encoded: Uint8Array;
        try {
          encoded = await codec.transcodeJpeg(slot.contents, {
            width,
            height,
            quality: point.quality,
            sourceType: "image/jpeg",
          });
        } catch {
          // A single undecodable image must not fail the whole document. Leaving
          // it costs bytes; dropping it would corrupt someone's paperwork.
          continue;
        }

        // Never accept a re-encode that made things worse. Recompressing an
        // already-heavily-compressed JPEG routinely does exactly that.
        if (encoded.length >= slot.contents.length) continue;

        replacements.push({
          slot,
          stream: buildImageStream(doc, slot, encoded, width, height),
        });
      }

      if (replacements.length === 0) return null;

      // Swap in the re-encoded images, serialise, then put the originals back so
      // the next probe starts from the untouched document rather than from this
      // probe's output. Without the restore, successive probes would compound.
      for (const { slot, stream } of replacements) {
        doc.context.assign(slot.ref, stream);
      }
      try {
        return await doc.save({ useObjectStreams: true });
      } finally {
        for (const { slot } of replacements) {
          doc.context.assign(slot.ref, slot.original);
        }
      }
    },
  };
}

function buildImageStream(
  doc: PDFDocument,
  slot: Slot,
  encoded: Uint8Array,
  width: number,
  height: number,
): PDFRawStream {
  const dict = slot.dict.clone(doc.context);
  dict.set(PDFName.of("Width"), doc.context.obj(width));
  dict.set(PDFName.of("Height"), doc.context.obj(height));
  dict.set(PDFName.of("Length"), doc.context.obj(encoded.length));
  dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
  dict.set(PDFName.of("BitsPerComponent"), doc.context.obj(8));
  // Both codecs emit baseline RGB JPEG, so the colour space is known regardless of
  // what the original declared.
  dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
  dict.delete(PDFName.of("DecodeParms"));

  return PDFRawStream.of(dict, encoded);
}

/**
 * Find every image the ladder is willing to touch, with the width of the page it
 * sits on.
 *
 * The page width is a proxy for how large the image is actually drawn. Working out
 * the true placement means walking content streams and tracking the transformation
 * matrix; for the dominant case — one full-page scan per page — the page width is
 * the same answer for far less machinery. Where an image is drawn smaller than the
 * page this over-estimates its DPI and so downsamples slightly harder than strictly
 * necessary, which is the safe direction to be wrong in.
 */
function collectSlots(doc: PDFDocument): Slot[] {
  const slots: Slot[] = [];
  const seen = new Set<string>();

  for (const page of doc.getPages()) {
    const pageWidthPt = page.getWidth();
    const resources = page.node.Resources();
    if (!resources) continue;

    const xObjects = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xObjects) continue;

    for (const [, value] of xObjects.entries()) {
      if (!(value instanceof PDFRef)) continue;
      const key = value.toString();
      if (seen.has(key)) continue;

      const stream = doc.context.lookup(value);
      if (!(stream instanceof PDFRawStream)) continue;
      if (!shouldProcess(stream.dict)) continue;

      const widthPx = numberEntry(stream.dict, "Width");
      const heightPx = numberEntry(stream.dict, "Height");
      if (!widthPx || !heightPx) continue;

      const contents = stream.getContents();
      if (contents.length < MIN_IMAGE_BYTES) continue;

      seen.add(key);
      slots.push({
        ref: value,
        key,
        dict: stream.dict,
        original: stream,
        contents,
        widthPx,
        heightPx,
        pageWidthPt,
      });
    }
  }

  return slots;
}

function shouldProcess(dict: PDFDict): boolean {
  if (nameEntry(dict, "Subtype") !== "Image") return false;

  // Only raw JPEG streams. Anything else would have to be inflated and interpreted
  // against its colour space first, which is a different and much larger job.
  if (nameEntry(dict, "Filter") !== "DCTDecode") return false;

  // A /Decode array remaps sample values — most often to invert a CMYK scan. Our
  // re-encode emits DeviceRGB and would drop that remapping, turning the image into
  // a photographic negative. A slightly larger file beats an inverted Aadhaar scan.
  if (dict.has(PDFName.of("Decode"))) return false;

  // CMYK JPEGs from print workflows carry an Adobe APP14 marker whose inversion
  // convention the browser and sharp disagree about. Left alone on purpose.
  if (nameEntry(dict, "ColorSpace") === "DeviceCMYK") return false;

  // A stencil mask is 1-bit and not meaningfully a photograph.
  if (dict.has(PDFName.of("ImageMask"))) return false;

  return true;
}

function nameEntry(dict: PDFDict, key: string): string | null {
  const value = dict.get(PDFName.of(key));
  return value instanceof PDFName ? value.asString().replace(/^\//, "") : null;
}

function numberEntry(dict: PDFDict, key: string): number | null {
  const value = dict.get(PDFName.of(key));
  if (value && "asNumber" in value && typeof value.asNumber === "function") {
    const n = (value as { asNumber(): number }).asNumber();
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
