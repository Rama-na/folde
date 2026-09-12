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
  /** Hard ceiling on encode passes. Each one costs real time on a phone. */
  maxProbes?: number;
  /** Stop once the effort bracket is this narrow — further probes buy nothing. */
  tolerance?: number;
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
  while (probes < maxProbes && hi - lo > tolerance) {
    const mid = (lo + hi) / 2;
    const attempt = await run(mid);
    if (attempt.size <= target) {
      // Close enough to the budget that further probing is wasted time.
      if (attempt.size >= goodEnough) {
        return { best: attempt, closest: closest ?? attempt, probes };
      }
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return {
    best,
    closest: closest ?? harshest,
    probes,
  };
}
