"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { useMotionBudget } from "@/lib/use-motion-budget";

/**
 * Smooth scrolling, for the people whose devices can spare it.
 *
 * The sequence below the drop zone is scrubbed by scroll position, and a wheel or
 * trackpad delivers that position in coarse jumps — so the animation it drives
 * arrives in jumps too. Lenis interpolates between them, which is the difference
 * between a sequence that reads as one movement and one that reads as a flipbook.
 * That is the whole justification; it is not here to feel expensive.
 *
 * Which is also why it is gated. Hijacking scroll is a real cost — it fights
 * assistive technology, it fights people who have asked for less movement, and on a
 * mid-range phone over patchy data it spends frames that the compression itself
 * needs. Under `prefers-reduced-motion` or Save-Data this component mounts, decides
 * against itself, and leaves native scrolling exactly as the browser shipped it.
 *
 * Lenis is MIT. GSAP's ScrollTrigger would have done the same job, and was asked
 * for, but GSAP ships under a bespoke "no charge" licence rather than a permissive
 * one, which CLAUDE.md rules out — and `motion`, already here and also MIT, drives
 * the sequence perfectly well.
 */
export function SmoothScroll() {
  const budget = useMotionBudget();

  useEffect(() => {
    if (budget !== "full") return;

    const lenis = new Lenis({
      // Short enough that a flick still feels like a flick. Past about 1.4 the page
      // keeps travelling after you have stopped asking it to, which reads as lag.
      duration: 1.05,
      // Touch devices already have momentum scrolling that people know the feel of.
      // Replacing it is the single fastest way to make a site feel broken on a phone.
      syncTouch: false,
      autoRaf: true,
    });

    return () => lenis.destroy();
  }, [budget]);

  return null;
}
