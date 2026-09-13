import { PDFDocument, PDFName } from "@cantoo/pdf-lib";

/**
 * Rung 1 — structural shrink. Nothing a reader can see changes.
 *
 * Rewrites the document with cross-reference and object streams, drops objects no
 * longer reachable, and strips metadata the user did not ask to publish. On a PDF
 * exported from Word or Google Docs this is often a double-digit percentage; on a
 * flatbed scan it is close to nothing, because a scan is one enormous JPEG and none
 * of this touches image bytes.
 *
 * It runs before every other rung regardless of whether it is enough on its own, so
 * later rungs start from an already-tidy document.
 *
 * The metadata strip is a small privacy win worth having by default: PDF Info and
 * XMP routinely carry the author's full name, the machine's username, and the path
 * the file was scanned to.
 */
export async function losslessShrinkPdf(
  source: Uint8Array,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  doc.catalog.delete(PDFName.of("Metadata"));
  doc.context.trailerInfo.Info = undefined;

  return doc.save({ useObjectStreams: true });
}

/**
 * Whether a PDF can be opened at all.
 *
 * Called before anything else so a corrupt or password-protected file produces a
 * clear message rather than a stack trace five rungs deep.
 */
export async function inspectPdf(
  source: Uint8Array,
): Promise<{ ok: true; pages: number } | { ok: false; reason: string }> {
  try {
    const doc = await PDFDocument.load(source, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const pages = doc.getPageCount();
    if (pages === 0) return { ok: false, reason: "This PDF has no pages." };
    if (doc.isEncrypted) {
      return {
        ok: false,
        reason:
          "This PDF is password-protected. Remove the password and try again.",
      };
    }
    return { ok: true, pages };
  } catch {
    return {
      ok: false,
      reason: "This file could not be opened as a PDF — it may be damaged.",
    };
  }
}
