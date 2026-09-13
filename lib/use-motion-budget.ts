"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * How much motion this device has earned.
 *
 * The audience is largely mid-range Android over patchy mobile data, and the
 * original design rules banned decorative motion outright for that reason. Rather
 * than overturn that judgement or be stuck behind it, the polish is conditional:
 * devices that can afford it get it, and the rest get the same interface without.
 *
 * Two signals, both of which the user has effectively opted into:
 *
 *  - `prefers-reduced-motion`, which is an explicit accessibility request and is
 *    honoured unconditionally.
 *  - Save-Data and a 2G-class connection, which say the person is paying for bytes
 *    or waiting on them. Animating at them is the wrong answer.
 *
 * The hard rule that makes this safe: **no information may exist only inside an
 * animation.** Under `reduced` every animated value snaps straight to its final
 * state, so the two paths end on identical pixels. The browser suite asserts that
 * by running a whole job with reduced motion forced and comparing the numbers.
 */
export type MotionBudget = "full" | "reduced";

interface SaveDataConnection {
  saveData?: boolean;
  effectiveType?: string;
}

export function useMotionBudget(): MotionBudget {
  const prefersReduced = useReducedMotion();
  const [constrained, setConstrained] = useState(false);

  useEffect(() => {
    const connection = (
      navigator as Navigator & { connection?: SaveDataConnection }
    ).connection;
    if (!connection) return;

    const read = () =>
      setConstrained(
        connection.saveData === true ||
          connection.effectiveType === "2g" ||
          connection.effectiveType === "slow-2g",
      );

    read();
    // Connections change mid-session more often than people expect: a train, a
    // lift, a hostel wifi that drops to cellular.
    const target = connection as unknown as EventTarget;
    target.addEventListener?.("change", read);
    return () => target.removeEventListener?.("change", read);
  }, []);

  return prefersReduced || constrained ? "reduced" : "full";
}
