import { PDFDocument } from "@cantoo/pdf-lib";
import { shrinkPdf, type ShrinkOptions } from "@/modules/shrink";
import { formatBytes } from "@/lib/bytes";
import { throwIfAborted } from "@/modules/shrink/types";

/**
 * The last thing to try when a document will not travel at all.
 *
 * There is a case the ladder cannot solve. A 60 MB property deed, a 120-page bank
 * statement, a scanned court record — compress it as hard as you like and it is
 * still larger than one message can carry. Every rung has been climbed, the text is
 * already gone to rasterizing, and the answer is still no. Up to now the interface
 * said "still too large to send even alone. Try a smaller limit, or split the
 * document" and then offered no way to split the document, which is a refusal
 * wearing the clothes of advice.
 *
 * So it gets divided by page, and each piece is compressed to fit on its own.
 *
 * Two things this deliberately is not.
 *
 * It is **not a split-volume archive**. There is no `.zip.001`, no reassembly, no
 * instructions for the recipient. Every piece is a complete PDF that opens by
 * itself, which is the rule the whole product is built on — sequential split
 * archives are a malware-delivery signature and get quarantined by Gmail's outbound
 * filter and most corporate inbound ones.
 *
 * It is **not a splitting tool**. Nobody picks page ranges. There is no UI for this
 * at all: it happens only to a document that genuinely cannot be sent whole, and
 * only for email, where dividing is the difference between arriving and not. For a
 * portal upload it never runs, because a form asking for one document is not helped
 * by three.
 */

export interface SplitPiece {
  /** 1-based inclusive page range in the source document. */
  fromPage: number;
  toPage: number;
  bytes: Uint8Array;
  /** Measured length of `bytes`. Never an estimate. */
  size: number;
  ok: boolean;
  textPreserved: boolean;
  shortfall?: string;
}

export interface SplitOptions extends ShrinkOptions {
  /**
   * What the ladder actually got the whole document down to, if it has been tried.
   *
   * Only used to guess how many pieces to start with, and worth passing. Guessing
   * from the raw source assumes compression achieves nothing: a 60 MB scan that
   * compresses to 12 MB is four messages, and guessing off the 60 starts by cutting
   * it into eighteen. The halving below only ever cuts further, never rejoins, so
   * an over-large first guess is one the result never recovers from.
   */
  compressedSize?: number;
}

export interface SplitResult {
  /** False when there was nothing that could be divided. */
  split: boolean;
  pieces: SplitPiece[];
  pageCount: number;
  /** Set when `split` is false: why, in language fit to show a user. */
  reason?: string;
}

/**
 * Never divide a document into more pieces than this.
 *
 * A recipient facing thirty emails has been handed a different problem, not a
 * solved one, and past this point the honest answer is that the limit is wrong for
 * the document rather than that the document needs more cutting.
 */
const MAX_PIECES = 24;

export async function splitToFit(
  source: Uint8Array,
  target: number,
  options: SplitOptions,
  signal?: AbortSignal,
): Promise<SplitResult> {
  throwIfAborted(signal);

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(source, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch {
    return {
      split: false,
      pieces: [],
      pageCount: 0,
      reason: "This document could not be opened, so it could not be divided.",
    };
  }

  // Loading can succeed on a file whose page tree is missing, and then the first
  // question you ask it throws. A damaged document is the caller's ordinary case,
  // not an exception — it is here precisely because everything else already failed.
  let pageCount: number;
  try {
    pageCount = doc.getPageCount();
  } catch {
    return {
      split: false,
      pieces: [],
      pageCount: 0,
      reason: "This document's pages could not be read, so it could not be divided.",
    };
  }

  if (pageCount < 2) {
    return {
      split: false,
      pieces: [],
      pageCount,
      reason:
        `This is a single page, so there is nothing to divide — the whole ` +
        `document has to travel together. A larger limit, or sending a link, is ` +
        `the way through.`,
    };
  }

  // A first guess at how many pieces, from how far over the target the compressed
  // document landed. It is only a guess: each piece is measured afterwards and cut
  // again if it is still too big, so guessing low costs a round rather than a
  // broken result.
  const guess = Math.min(
    pageCount,
    MAX_PIECES,
    // One, not two. Forcing a minimum of two divided a document that already fitted,
    // which is the same mistake as compressing one that already fitted: work done,
    // quality spent, nothing gained. If one turns out to be too many, the loop below
    // finds that out by measuring.
    Math.max(1, Math.ceil((options.compressedSize ?? source.length) / Math.max(target, 1))),
  );

  const queue: Array<[number, number]> = evenRanges(pageCount, guess);
  const pieces: SplitPiece[] = [];

  while (queue.length > 0) {
    throwIfAborted(signal);
    const [from, to] = queue.shift() as [number, number];

    const extracted = await extractRange(doc, from, to);
    const shrunk = await shrinkPdf(extracted, target, options, signal);

    // Still over, and more than one page to work with: halve it and try again.
    // Measured, never predicted — the piece that comes back is the piece that is
    // checked, which is the same rule the rest of the product runs on.
    if (
      !shrunk.ok &&
      to > from &&
      pieces.length + queue.length + 2 <= MAX_PIECES
    ) {
      const middle = from + Math.floor((to - from) / 2);
      queue.unshift([from, middle], [middle + 1, to]);
      continue;
    }

    pieces.push({
      fromPage: from,
      toPage: to,
      bytes: shrunk.bytes,
      size: shrunk.size,
      ok: shrunk.ok,
      textPreserved: shrunk.textPreserved,
      shortfall: shrunk.ok
        ? undefined
        : (shrunk.shortfall ??
          `Pages ${from}–${to} are ${formatBytes(shrunk.size)}, still over the ` +
            `${formatBytes(target)} a single message can carry.`),
    });
  }

  pieces.sort((a, b) => a.fromPage - b.fromPage);
  return { split: true, pieces, pageCount };
}

/**
 * The name one piece carries.
 *
 * Page numbers rather than "part 2 of 5", because the recipient's real question is
 * which pages they are looking at, and because a filename reading like a volume in a
 * set invites them to go looking for a way to join them back together. There isn't
 * one; each of these is already a whole document.
 */
export function pieceName(name: string, piece: SplitPiece): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const range =
    piece.fromPage === piece.toPage
      ? `page ${piece.fromPage}`
      : `pages ${piece.fromPage}-${piece.toPage}`;
  return `${stem} (${range}).pdf`;
}

/** `count` contiguous 1-based page ranges covering 1..pageCount, as evenly as possible. */
function evenRanges(pageCount: number, count: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const per = Math.ceil(pageCount / count);
  for (let start = 1; start <= pageCount; start += per) {
    ranges.push([start, Math.min(pageCount, start + per - 1)]);
  }
  return ranges;
}

async function extractRange(
  doc: PDFDocument,
  from: number,
  to: number,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const indices = [];
  for (let page = from; page <= to; page++) indices.push(page - 1);
  const copied = await out.copyPages(doc, indices);
  for (const page of copied) out.addPage(page);
  return out.save({ useObjectStreams: true });
}
