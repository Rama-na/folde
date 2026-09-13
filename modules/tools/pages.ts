import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import {
  produced,
  refused,
  type PagePlan,
  type ToolResult,
} from "./types";

/**
 * Rebuild a PDF from a list of its own pages.
 *
 * The single primitive behind reordering, rotating and deleting. See `PagePlan`.
 *
 * Pages are copied rather than mutated in place, so the output carries only what the
 * plan asked for — a deleted page leaves nothing behind, which matters when the
 * reason somebody deleted it was that it had their bank details on it.
 */
export async function rebuildPdf(
  source: Uint8Array,
  plan: readonly PagePlan[],
): Promise<ToolResult> {
  if (plan.length === 0) {
    return refused("That would leave a document with no pages in it.");
  }

  const opened = await open(source);
  if (!opened.ok) return refused(opened.reason);
  const { doc, pages } = opened;

  const outOfRange = plan.filter((p) => p.from < 1 || p.from > pages);
  if (outOfRange.length > 0) {
    return refused(
      `This document has ${pages} page${pages === 1 ? "" : "s"}, so there is no ` +
        `page ${outOfRange[0].from}.`,
    );
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    doc,
    plan.map((p) => p.from - 1),
  );
  for (const [i, page] of copied.entries()) {
    const turn = plan[i].rotate ?? 0;
    if (turn !== 0) {
      // Added to whatever the page already had. A scan that arrived sideways is
      // already at 90, and setting rather than adding would silently undo that.
      page.setRotation(degrees((page.getRotation().angle + turn) % 360));
    }
    out.addPage(page);
  }

  return produced(await out.save({ useObjectStreams: true }));
}

/**
 * Read a page range the way a person writes one: `1-3, 7, 11-`.
 *
 * Returns page numbers in the order given, so `5-7,1` means exactly that. Out-of-range
 * numbers are clamped away rather than rejected — somebody typing `1-999` on a
 * twelve-page document means "all of it", and refusing to understand that is not
 * precision, it is obstruction.
 */
export function parseRanges(input: string, pages: number): number[] {
  const out: number[] = [];
  for (const part of input.split(",")) {
    const piece = part.trim();
    if (!piece) continue;

    const match = /^(\d+)?\s*-\s*(\d+)?$/.exec(piece);
    if (match) {
      const from = Math.max(1, Number(match[1] ?? 1));
      const to = Math.min(pages, Number(match[2] ?? pages));
      for (let n = from; n <= to; n++) out.push(n);
      continue;
    }

    const single = Number(piece);
    if (Number.isInteger(single) && single >= 1 && single <= pages) {
      out.push(single);
    }
  }
  return out;
}

/** The pages named by a range expression, as their own document. */
export async function extractPages(
  source: Uint8Array,
  ranges: string,
): Promise<ToolResult> {
  const opened = await open(source);
  if (!opened.ok) return refused(opened.reason);

  const wanted = parseRanges(ranges, opened.pages);
  if (wanted.length === 0) {
    return refused(
      `Nothing in "${ranges}" names a page of this ${opened.pages}-page document. ` +
        `Try something like 1-3, 7.`,
    );
  }
  return rebuildPdf(
    source,
    wanted.map((from) => ({ from })),
  );
}

/**
 * Open a PDF, and say why in plain words when it will not open.
 *
 * Shared by every tool in this folder so that a password-protected file gets the
 * same sentence whichever one the user reached for, and so that "encrypted" is never
 * reported as "damaged" — they call for completely different things from the person
 * holding the file.
 */
export async function open(
  source: Uint8Array,
  password?: string,
): Promise<
  { ok: true; doc: PDFDocument; pages: number } | { ok: false; reason: string }
> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(source, {
      updateMetadata: false,
      ...(password === undefined ? {} : { password }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/password|encrypt/i.test(message)) {
      return {
        ok: false,
        reason: password
          ? "That password did not open this document."
          : "This document is password-protected. Unlock it first.",
      };
    }
    return {
      ok: false,
      reason: "This file could not be opened as a PDF — it may be damaged.",
    };
  }

  try {
    const pages = doc.getPageCount();
    if (pages === 0) return { ok: false, reason: "This PDF has no pages." };
    return { ok: true, doc, pages };
  } catch {
    // Loading can succeed on a document whose page tree is missing, and then the
    // first question you ask it throws.
    return {
      ok: false,
      reason: "This document's pages could not be read.",
    };
  }
}
