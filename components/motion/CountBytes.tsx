"use client";

import { useEffect } from "react";
import { animate, useMotionValue, useTransform, motion } from "motion/react";
import { formatBytes } from "@/lib/bytes";
import { useMotionBudget } from "@/lib/use-motion-budget";

/**
 * A byte count that travels from where it started to where it ended up.
 *
 * Adapted from the React Bits CountUp pattern, copied in as source rather than
 * pulled as a dependency, which is how React Bits is meant to be used.
 *
 * This is the only counting animation in the product and it is the one place the
 * motion carries the information rather than decorating it. "40 MB became 9.9 MB"
 * is the entire payoff of the work, and watching the number fall says it in a way
 * that printing the final value does not. Everywhere else a number appears it is
 * static, because everywhere else the number is a fact, not an outcome.
 *
 * Driven by a motion value, so the count runs off the React render cycle. Doing
 * this with `useState` would re-render the tree on every frame and collapse on
 * exactly the phones this is aimed at.
 */
export function CountBytes({
  from,
  to,
  className,
}: {
  from: number;
  to: number;
  className?: string;
}) {
  const budget = useMotionBudget();
  const value = useMotionValue(budget === "reduced" ? to : from);
  const text = useTransform(value, (n) => formatBytes(Math.round(n)));

  useEffect(() => {
    if (budget === "reduced") {
      value.set(to);
      return;
    }
    const controls = animate(value, to, {
      duration: 0.9,
      // Fast at first then settling, so the size drop reads as decisive and the
      // final figure still has a moment to land.
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [budget, from, to, value]);

  return (
    <motion.span className={className}>
      {budget === "reduced" ? formatBytes(to) : text}
    </motion.span>
  );
}
