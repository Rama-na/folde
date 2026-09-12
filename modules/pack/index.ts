import { encodedMessageSize, MIME_PART_OVERHEAD } from "@/lib/bytes";

/**
 * Split a pile of files into messages that will actually arrive.
 *
 * Two rules shape everything here, and both are the opposite of what the obvious
 * implementation does:
 *
 * 1. **No file is ever split across batches.** Every batch is independently
 *    complete and independently openable. Split archives — `.zip.001`, `.zip.002` —
 *    are a malware-delivery signature: Gmail's outbound filter and most corporate
 *    inbound filters delay or quarantine a run of them, and if one part goes astray
 *    the recipient discovers it only when reassembly fails. A tool that confidently
 *    emits eight split volumes has produced mail that does not arrive.
 *
 * 2. **Loose attachments, not ZIP, by default.** Plenty of government and
 *    enterprise mail systems reject `.zip` outright. Zipping is available because it
 *    genuinely helps when the file *count* is the problem rather than the size, but
 *    it is a choice the user makes, not a default they discover.
 */

export interface PackItem {
  id: string;
  name: string;
  /** Final size after shrinking. Measured bytes, never an estimate. */
  size: number;
}

export interface Batch {
  /** 1-based, for "01 of 04" labelling. */
  index: number;
  items: PackItem[];
  /** Sum of the item sizes. */
  rawBytes: number;
  /** What the mail server will actually weigh. */
  encodedBytes: number;
}

export interface PackPlan {
  batches: Batch[];
  /** The stated attachment cap these batches were built for. */
  cap: number;
  /**
   * Files that cannot be sent at all, because one of them alone exceeds the cap.
   * Never silently dropped — the caller must tell the user, since the fix is to
   * shrink harder or split the document, and only they can decide which.
   */
  oversized: PackItem[];
  /** Whether batches will be zipped into a single attachment each. */
  zipped: boolean;
}

export interface PackOptions {
  /** The mail system's stated attachment limit, in bytes. */
  cap: number;
  /** Bundle each batch into one ZIP instead of attaching files loosely. */
  zip?: boolean;
}

/**
 * ZIP overhead for content that is already compressed.
 *
 * PDFs and JPEGs do not deflate meaningfully, so a ZIP of them is essentially the
 * sum of the files plus per-entry bookkeeping: a local header, a central directory
 * entry, and the filename twice. Budgeting as though ZIP shrinks anything is how a
 * batch ends up over the limit.
 */
const ZIP_ENTRY_OVERHEAD = 92;
const ZIP_TRAILER = 22;

/**
 * Plan the batches.
 *
 * First-fit-decreasing: sort largest first, drop each file into the first batch it
 * fits. It is simple, deterministic, and provably within a small constant of optimal
 * for bin packing — and being one batch off optimal costs the user one extra email,
 * which is a far better failure than a clever heuristic that occasionally overflows.
 *
 * The fit test is exact rather than a fixed budget, because in `mail` mode the
 * budget depends on how many files are already in the batch: every attachment adds
 * its own MIME part headers, so the room left shrinks as the batch fills.
 */
export function planBatches(
  items: readonly PackItem[],
  options: PackOptions,
): PackPlan {
  const { cap } = options;
  const zipped = options.zip ?? false;

  const oversized: PackItem[] = [];
  const packable: PackItem[] = [];

  for (const item of items) {
    if (fitsAlone(item.size, cap, zipped)) {
      packable.push(item);
    } else {
      oversized.push(item);
    }
  }

  // Largest first. Big files placed early leave the small ones to fill the gaps;
  // the reverse strands large files in batches of their own.
  const ordered = [...packable].sort(
    (a, b) => b.size - a.size || a.name.localeCompare(b.name),
  );

  const bins: PackItem[][] = [];
  for (const item of ordered) {
    const home = bins.find((bin) => admits(bin, item, cap, zipped));
    if (home) {
      home.push(item);
    } else {
      bins.push([item]);
    }
  }

  // Within a batch, restore the order the user gave us. Packing order is an
  // implementation detail; someone reading "03 of 04" wants their own filing order,
  // not a size ranking.
  const position = new Map(items.map((item, i) => [item.id, i]));
  const batches: Batch[] = bins.map((bin, i) => {
    const sorted = [...bin].sort(
      (a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
    );
    const rawBytes = sumSizes(sorted);
    return {
      index: i + 1,
      items: sorted,
      rawBytes,
      encodedBytes: weigh(sorted, zipped),
    };
  });

  return { batches, cap, oversized, zipped };
}

/** What the receiving mail server will measure for this set of files. */
export function weigh(items: readonly PackItem[], zipped: boolean): number {
  if (items.length === 0) return 0;

  if (zipped) {
    const archive =
      sumSizes(items) + items.length * ZIP_ENTRY_OVERHEAD + ZIP_TRAILER;
    return encodedMessageSize(archive, 1);
  }
  return encodedMessageSize(sumSizes(items), items.length);
}

function admits(
  bin: readonly PackItem[],
  item: PackItem,
  cap: number,
  zipped: boolean,
): boolean {
  return weigh([...bin, item], zipped) <= cap;
}

function fitsAlone(size: number, cap: number, zipped: boolean): boolean {
  return size <= largestSendableFile(cap, zipped);
}

/**
 * The largest a single file can be and still be sendable on its own.
 *
 * The ceiling every file has to clear regardless of how the batching works out: a
 * file above this cannot travel in any message, however few others accompany it. It
 * is therefore also the hard upper bound on any compression target.
 */
export function largestSendableFile(cap: number, zipped = false): number {
  let lo = 0;
  let hi = cap;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (weigh([{ id: "", name: "", size: mid }], zipped) <= cap) lo = mid;
    else hi = mid;
  }
  return lo;
}

function sumSizes(items: readonly PackItem[]): number {
  return items.reduce((total, item) => total + item.size, 0);
}

/**
 * The lower bound on how many batches this pile could possibly need.
 *
 * Used to tell the user "4 emails" honestly, and in tests to keep the packer from
 * quietly regressing into producing more batches than necessary.
 */
export function minimumBatches(
  items: readonly PackItem[],
  cap: number,
  zipped = false,
): number {
  const total = sumSizes(items);
  if (total === 0) return 0;
  // Generous per-batch capacity: ignore per-part overhead entirely, which can only
  // make the bound lower and therefore safe to compare against.
  const perBatch = Math.max(1, capacityIgnoringParts(cap, zipped));
  return Math.ceil(total / perBatch);
}

function capacityIgnoringParts(cap: number, zipped: boolean): number {
  let lo = 0;
  let hi = cap;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const weight = zipped
      ? encodedMessageSize(mid + ZIP_TRAILER + ZIP_ENTRY_OVERHEAD, 1)
      : encodedMessageSize(mid, 1);
    if (weight <= cap) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * A human-readable manifest of what went where.
 *
 * Sent with the batches so the recipient can tell at a glance whether they have
 * everything — the anxiety this product exists to remove is not "is it compressed",
 * it is "did all forty-two of them arrive".
 */
export function describeBatch(batch: Batch, total: number): string {
  const label = `${pad(batch.index)} of ${pad(total)}`;
  const lines = batch.items.map((item) => `  ${item.name}`);
  return [`Part ${label} — ${batch.items.length} file(s)`, ...lines].join("\n");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Per-attachment MIME overhead, re-exported so callers need not reach into lib. */
export { MIME_PART_OVERHEAD };
