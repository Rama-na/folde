import { type Attempt, throwIfAborted } from "./types";

/**
 * Produce a real, encoded candidate at the given effort. Every probe does actual
 * work and returns actual bytes — the search never reasons about estimated sizes.
 */
export type Probe = (
  effort: number,
  signal?: AbortSignal,
) => Promise<Attempt>;

export interface SearchOptions {
  /**
   * Hard ceiling on encode passes, counting every one. Each costs real time.
   *
   * It used to bound only the narrowing loop, which meant the two bracketing probes
   * below were spent whatever it said — so a caller asking for one pass got two, and
   * on a rung where a pass means rendering every page of a 120-page document that is
   * the difference between thirty-five seconds and seventy.
   */
  maxProbes?: number;
  /** Stop once the effort bracket is this narrow — further probes buy nothing. */
  tolerance?: number;
  /**
   * Where to look first, when the caller has an informed guess.
   *
   * Only a guide for where to probe, never a result: what comes back is still the
   * best candidate actually encoded and actually measured. The narrowing below is a
   * bisection, and a bisection that starts at the middle spends its first two or
   * three probes travelling to where a decent estimate could have put it in one. On
   * a rung where every probe re-encodes every image in the document, those probes
   * are most of the time somebody spends waiting.
   */
  seed?: number;

  /**
   * Asked before each narrowing probe. True keeps the best candidate found so far
   * rather than spending another pass.
   *
   * A probe count cannot express this on its own, because probes on some rungs are
   * not the same size as each other: rung 2's first pass may be skipped entirely and
   * its third may re-encode forty megapixels. What matters is the total spent, and
   * only the caller knows what a pass of its own actually cost.
   *
   * The two bracketing probes are never gated — without them there is no answer at
   * all, only a refusal. This governs refinement, which is where an expensive
   * document goes to spend thirty seconds buying a difference nobody can see.
   */
  budgetSpent?: () => boolean;

  /**
   * Accept immediately once an attempt lands at least this fraction of the target.
   *
   * Chasing the last few percent of a size budget costs several more encode passes
   * and buys quality nobody can see — the visible difference between a file at 91%
   * of the limit and one at 99% is nil, while the difference between waiting three
   * seconds and twelve is not. Set to 1 to disable and search exhaustively.
   */
  acceptFrom?: number;
}

export interface SearchOutcome {
  /** Lowest-effort attempt that met the target, or null if none did. */
  best: Attempt | null;
  /** Smallest attempt seen, whether or not it met the target. */
  closest: Attempt;
  probes: number;
}

const DEFAULT_MAX_PROBES = 8;
const DEFAULT_TOLERANCE = 0.02;
const DEFAULT_ACCEPT_FROM = 0.9;

/**
 * Find the gentlest compression that still fits under `target`.
 *
 * Output size is *broadly* monotonic in effort, but not strictly: JPEG encoders
 * wobble by a percent or two, and dropping resolution can occasionally cost bytes
 * when it pushes an image across a chroma-subsampling boundary. A textbook binary
 * search assumes strict monotonicity and can therefore return a candidate that does
 * not fit, or miss one that does.
 *
 * So the bracket is only a *guide* for where to probe next. What is returned is the
 * best candidate actually observed — every probe is measured and remembered. That
 * makes the result correct regardless of how the encoder behaves.
 */
export async function searchForTarget(
  probe: Probe,
  target: number,
  options: SearchOptions = {},
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const maxProbes = options.maxProbes ?? DEFAULT_MAX_PROBES;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const acceptFrom = options.acceptFrom ?? DEFAULT_ACCEPT_FROM;
  const goodEnough = target * acceptFrom;

  let probes = 0;
  let best: Attempt | null = null;
  let bestEffort = Infinity;
  let closest: Attempt | null = null;

  const record = (attempt: Attempt, effort: number): void => {
    if (closest === null || attempt.size < closest.size) closest = attempt;
    if (attempt.size <= target && effort < bestEffort) {
      best = attempt;
      bestEffort = effort;
    }
  };

  const run = async (effort: number): Promise<Attempt> => {
    throwIfAborted(signal);
    const attempt = await probe(effort, signal);
    probes += 1;
    record(attempt, effort);
    return attempt;
  };

  // One pass, and no room to bracket: spend it on the setting most likely to
  // succeed rather than the one most likely to look good.
  //
  // This only happens where a probe is ruinously expensive — rung 3 on a long
  // document — and by the time anything reaches that rung the gentle end of the
  // curve has already been ruled out by every rung below it. An optimistic pass that
  // misses would leave nothing to fall back on but a refusal, having spent exactly
  // as long as the pass that would have worked.
  if (maxProbes <= 1) {
    const only = await run(1);
    return {
      best: only.size <= target ? only : null,
      closest: closest ?? only,
      probes,
    };
  }

  // The gentlest setting first. If that fits, no search is needed and the user
  // keeps the best quality available — the common case for a file that is only
  // slightly over.
  const gentlest = await run(0);
  if (gentlest.size <= target) {
    return { best: gentlest, closest: gentlest, probes };
  }

  // The harshest setting. If even this misses, nothing along the curve will fit,
  // and the caller needs to climb to the next rung or report honestly.
  const harshest = await run(1);
  if (harshest.size > target) {
    return { best: null, closest: closest ?? harshest, probes };
  }

  // Something between them fits. Narrow toward the gentlest one that does.
  let lo = 0; // known not to fit
  let hi = 1; // known to fit
  let loSize = gentlest.size; // too big
  let hiSize = harshest.size; // fits

  // The caller's guess gets the first look, if it has one.
  let next =
    options.seed === undefined
      ? between(lo, hi, loSize, hiSize, target)
      : Math.min(1 - tolerance, Math.max(tolerance, options.seed));

  // `probes` already counts the two bracketing passes above, so the loop gets
  // whatever is left of the budget rather than a fresh allowance of it.
  while (probes < maxProbes && hi - lo > tolerance) {
    if (options.budgetSpent?.()) break;
    const mid = next;
    const attempt = await run(mid);
    if (attempt.size <= target) {
      // Close enough to the budget that further probing is wasted time.
      if (attempt.size >= goodEnough) {
        return { best: attempt, closest: closest ?? attempt, probes };
      }
      hi = mid;
      hiSize = attempt.size;
    } else {
      lo = mid;
      loSize = attempt.size;
    }
    next = between(lo, hi, loSize, hiSize, target);
  }

  return {
    best,
    closest: closest ?? harshest,
    probes,
  };
}

/**
 * Where to look next, from what the probes actually measured.
 *
 * The bracket has a measured size at each end, one over the target and one under, so
 * the straight line between them says roughly where it crosses. That is a secant
 * step, and on this curve it lands close enough that one or two more probes finish
 * the job.
 *
 * A plain bisection ignores the sizes entirely and walks the interval by halves.
 * On a 14 MB scan that was five narrowing passes, each re-encoding every image in
 * the document, and the last three of them moved the answer from 1562 pixels wide to
 * 1413 and back out to 1487 — a five per cent change in resolution, invisible at
 * reading size, bought with seventy-five megapixels of somebody's phone.
 *
 * Clamped well inside the bracket, because the size curve is only broadly monotonic:
 * a JPEG encoder that wobbles by a percent can otherwise push the next probe onto an
 * endpoint that has already been measured, and the search stops making progress.
 */
function between(
  lo: number,
  hi: number,
  loSize: number,
  hiSize: number,
  target: number,
): number {
  const span = loSize - hiSize;
  const fraction = span > 0 ? (loSize - target) / span : 0.5;
  const safe = Math.min(0.8, Math.max(0.2, fraction));
  return lo + (hi - lo) * safe;
}
