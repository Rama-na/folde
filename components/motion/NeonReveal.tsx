"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { useMotionBudget } from "@/lib/use-motion-budget";

/**
 * A lit bar that crosses the panel once, and leaves what it passed over readable.
 *
 * A replica of React Bits Pro's Neon Reveal, written here rather than installed:
 * that component ships through a licensed shadcn registry, this project has no
 * `components.json`, no licence key on hand, and no shadcn anywhere in it. Copying
 * the idea in as source is also how the sibling piece in this folder arrived —
 * `CountBytes` is React Bits' CountUp, adapted — so the precedent is the house
 * style rather than a shortcut.
 *
 * ## Why it is allowed to exist
 *
 * The rule for this build is that motion communicates organisation, transformation
 * or sending, and a bar sweeping across a box for the look of it is none of those.
 * So it is not sweeping for the look of it: this is a **measuring pass**. It travels
 * over the claim at the moment the claim is about to be made, the way a scanner
 * head crosses a page, and what is behind it is lit because it has now been read.
 * That is the same sentence the product says about every number it prints — measured,
 * not estimated — said in light instead of words.
 *
 * It runs once. Nothing here loops, and nothing follows a cursor.
 *
 * ## What it must never do
 *
 * Hide anything. The unlit state exists only while the sweep is running; the overlays
 * are removed outright when it finishes, and under a reduced-motion or Save-Data
 * budget they are never mounted at all. No information may live inside an animation,
 * so the end state and the never-animated state are the same pixels.
 */
export function NeonReveal({
  children,
  duration = 1.25,
  delay = 0.1,
  thickness = 1,
  className = "",
}: {
  children: React.ReactNode;
  /** Seconds for the bar to cross the panel. */
  duration?: number;
  /** Seconds to wait after the panel comes into view. */
  delay?: number;
  /** Width of the tube itself, in pixels. The glow is drawn around it. */
  thickness?: number;
  className?: string;
}) {
  const budget = useMotionBudget();
  const panel = useRef<HTMLDivElement>(null);
  const inView = useInView(panel, { once: true, amount: 0.45 });

  // Mount-gated, like everything else that changes shape between the server and a
  // client that has read the motion budget. The server and the first client paint
  // both render the plain panel, so there is nothing for hydration to disagree about.
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);

  // Removed from the tree the moment the pass is over, rather than left sitting at
  // zero opacity. An overlay that is merely invisible is still an overlay that can
  // come back wrong.
  const [swept, setSwept] = useState(false);

  const progress = useMotionValue(0);
  const lit = enhanced && budget === "full" && !swept;

  useEffect(() => {
    if (!lit || !inView) return;
    const controls = animate(progress, 1, {
      duration,
      delay,
      // Close to linear with the ends taken off. A scanner head does not accelerate
      // like a UI element, and easing this the way a card enters makes it read as
      // decoration rather than as a pass being made over something.
      ease: [0.55, 0, 0.35, 1],
      onComplete: () => setSwept(true),
    });
    return () => controls.stop();
  }, [delay, duration, inView, lit, progress]);

  // Where the tube is, as a percentage of the panel. It starts and finishes outside
  // the frame so it is never seen standing still at an edge.
  const x = useTransform(progress, [0, 1], ["-4%", "104%"]);

  // Everything the bar has not reached yet is still under the unlit wash. The mask
  // is a hard-ish edge a couple of points ahead of the tube, with a short ramp behind
  // it so the boundary is the glow rather than a line.
  const unlit = useTransform(progress, (p) => {
    const at = p * 100;
    return (
      `linear-gradient(90deg, transparent ${at - 3}%, ` +
      `rgba(0,0,0,0.55) ${at + 1}%, rgba(0,0,0,1) ${at + 5}%, rgba(0,0,0,1) 100%)`
    );
  });

  return (
    <div
      ref={panel}
      className={`relative isolate overflow-hidden rounded-[12px] border border-stage-edge bg-stage ${className}`}
    >
      {children}

      {lit && (
        <>
          {/* Not yet read. The wash is the stage's own colour, so what it covers
              dims towards the panel instead of greying out. */}
          <motion.div
            aria-hidden
            style={{ WebkitMaskImage: unlit, maskImage: unlit }}
            className="pointer-events-none absolute inset-0 z-10 bg-stage/92"
          />

          {/* The light the tube throws onto the panel, separate from the tube. Wide,
              dim and soft — without it the bar looks stuck on top of the panel
              rather than lighting it. */}
          <motion.div
            aria-hidden
            style={{ left: x }}
            className="pointer-events-none absolute inset-y-0 z-20 w-[26rem] max-w-[85%] -translate-x-1/2"
          >
            <div
              className="h-full w-full"
              style={{
                background:
                  "radial-gradient(closest-side, color-mix(in srgb, var(--color-stage-accent) 26%, transparent), transparent)",
              }}
            />
          </motion.div>

          <motion.div
            aria-hidden
            style={{ left: x, width: `${thickness}px` }}
            className="neon-bar pointer-events-none absolute -inset-y-4 z-30 -translate-x-1/2"
          />
        </>
      )}
    </div>
  );
}
