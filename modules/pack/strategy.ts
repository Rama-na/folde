import {
  largestSendableFile,
  planBatches,
  weigh,
  type PackItem,
  type PackOptions,
} from "./index";

/**
 * Decide how hard to shrink, before shrinking anything.
 *
 * Compression is not free — it costs time on the user's phone and, past a point,
 * legibility. So the amount of it is a decision, and this is where that decision is
 * made. Two principles:
 *
 * 1. **If the pile already fits in one message, touch nothing.** A tool that
 *    compresses 3 MB of documents to send them under a 5 MB cap has degraded
 *    someone's paperwork for no reason whatsoever.
 * 2. **Spending compression to remove an email is usually worth it.** Each extra
 *    message is another thing the recipient has to notice, another thing that can be
 *    filtered, and another chance for someone to miss page 30 of 42. Quality loss
 *    that nobody will see beats an email nobody reads.
 *
 * What comes back is only a *plan*: per-file byte targets. The guarantee comes later
 * and elsewhere — the ladder reports what it actually achieved, and the batches are
 * then rebuilt from those measured sizes. So a bad estimate here costs an extra
 * email, never an overflowing one.
 */

export interface DeliveryStrategy {
  /** Messages needed if nothing were compressed. */
  batchesIfUntouched: number;
  /** Messages we are aiming for. */
  targetBatches: number;
  /**
   * Byte target per file id. A null target means "leave this file completely
   * alone" — it is already small enough to be carried as it is.
   */
  targets: Map<string, number | null>;
  /** One sentence, fit to show the user, explaining what we are about to do. */
  reason: string;
}

/**
 * How far below original size we are willing to push a file to save an email.
 *
 * Below roughly a fifth of its original size a scanned page starts losing the small
 * print — the date on a rent receipt, the account number on a statement — which is
 * usually the thing being asked for. Past this point we would rather send one more
 * message.
 */
const MIN_RETAINED_FRACTION = 0.2;

/**
 * Below this, shrinking a file cannot change anything worth changing.
 *
 * Handing every file a proportional target means an 8 KB text document gets asked
 * to reach 5 KB — which no amount of image downsampling achieves, so the ladder
 * climbs to rasterizing and destroys its selectable text to save three kilobytes
 * that could never have altered the batch count.
 *
 * Worse than the wasted work is what the user sees. A 161 KB text file inside a
 * 19 MB pile gets a target it cannot meet, and the results screen opens with a
 * failure — about a file that was never a problem, in a run that otherwise
 * succeeded. Manufacturing an alarm is its own kind of bug.
 *
 * So the floor scales with the batch budget as well: a saving has to be worth
 * something against the size of a message, not merely large in absolute terms.
 */
const MIN_WORTHWHILE_SAVING = 64 * 1024;
const MIN_WORTHWHILE_FRACTION = 0.05;

export function planDelivery(
  items: readonly PackItem[],
  options: PackOptions,
): DeliveryStrategy {
  const initial = planBatches(items, options);

  // Files too large to travel even alone are excluded from the batches — they do
  // not fit in any of them. They still have to be counted here: they are the files
  // that most need compressing, and leaving them out of the total is how a 19 MB
  // pile gets mistaken for one that already fits in a single email.
  const unsendable = initial.oversized.length;
  const untouched = initial.batches.length + unsendable;

  const leaveAlone = (): DeliveryStrategy => ({
    batchesIfUntouched: untouched,
    targetBatches: untouched,
    targets: new Map(items.map((i) => [i.id, null])),
    reason:
      untouched <= 1
        ? "Everything already fits in one email, so nothing needs compressing."
        : "These files are already as small as they usefully go.",
  });

  if (items.length === 0) return leaveAlone();
  // One batch and nothing stranded is the only state that needs no work at all.
  if (untouched <= 1 && unsendable === 0) return leaveAlone();

  // Try for progressively fewer messages, stopping at the most ambitious target
  // that does not demand shredding the documents to get there.
  for (let k = 1; k <= untouched; k++) {
    const targets = proportionalTargets(items, k, options);
    if (!targets) continue;

    return {
      batchesIfUntouched: untouched,
      targetBatches: k,
      targets,
      reason:
        k === 1
          ? `Compressing these will get all ${items.length} files into a single email instead of ${untouched}.`
          : `Compressing these will get it down to ${k} emails instead of ${untouched}.`,
    };
  }

  return leaveAlone();
}

/**
 * Share `k` messages' worth of budget across the files in proportion to their size.
 *
 * Proportional rather than equal: a 4 MB scan and a 40 KB receipt should not be held
 * to the same target. A file already under its share is left untouched and its
 * surplus stays unclaimed, which makes the plan conservative — the shrinkable files
 * are never asked to make up for it.
 *
 * Returns null when meeting the target would push some file below what is legible.
 */
function proportionalTargets(
  items: readonly PackItem[],
  k: number,
  options: PackOptions,
): Map<string, number | null> | null {
  const zip = options.zip ?? false;
  const perBatch = payloadCapacity(options.cap, items.length, zip);
  const budget = perBatch * k;

  // No file may exceed this, whatever the totals say, or it cannot be sent at all.
  const solo = largestSendableFile(options.cap, zip);
  const stranded = items.some((i) => i.size > solo);

  const total = items.reduce((n, i) => n + i.size, 0);
  if (total <= budget && !stranded) {
    return new Map(items.map((i) => [i.id, null]));
  }

  const ratio = budget / total;
  if (ratio < MIN_RETAINED_FRACTION) return null;

  const worthwhile = Math.max(
    MIN_WORTHWHILE_SAVING,
    perBatch * MIN_WORTHWHILE_FRACTION,
  );

  const targets = new Map<string, number | null>();
  for (const item of items) {
    // The proportional share, but never above what a lone attachment can weigh.
    // For a file that is over that ceiling this is not an optimisation, it is the
    // difference between sendable and not.
    const share = Math.min(Math.floor(item.size * ratio), solo);

    // A file already at or under its share needs no work at all. Nor does one
    // whose best case saves too little to matter — unless it is over the solo
    // ceiling, in which case it must shrink however little that buys.
    const pointless =
      share >= item.size ||
      (item.size - share < worthwhile && item.size <= solo);
    targets.set(item.id, pointless ? null : share);
  }
  return targets;
}

/**
 * Bytes of actual files that fit in one message, assuming the attachments spread
 * evenly across the batches.
 *
 * The per-attachment overhead depends on how many files land in a given message,
 * which is not known until packing. Assuming they spread evenly is the honest
 * middle estimate; being wrong only changes how ambitious the target is, and the
 * final packing works from measured sizes regardless.
 */
function payloadCapacity(cap: number, fileCount: number, zip: boolean): number {
  const perMessage = Math.max(1, Math.ceil(fileCount / 2));
  let lo = 0;
  let hi = cap;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const probe: PackItem[] = Array.from({ length: perMessage }, (_, i) => ({
      id: `probe-${i}`,
      name: "probe",
      size: Math.floor(mid / perMessage),
    }));
    if (weigh(probe, zip) <= cap) lo = mid;
    else hi = mid;
  }
  return lo;
}
