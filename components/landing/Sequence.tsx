"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { formatBytes } from "@/lib/bytes";
import { STORY, type StoryFile } from "@/lib/story";
import { useMotionBudget } from "@/lib/use-motion-budget";

/**
 * Six documents, from a folder to a set of emails, scrubbed by the scroll.
 *
 * The motion language here is fixed and narrow: every movement on this page is one
 * of organisation, transformation, or sending, and anything that is none of those
 * does not get to move. So the cards straighten (organisation), the sizes fall
 * (transformation), and the parts close around them (sending). There is no parallax,
 * no drifting background, nothing reacting to the cursor.
 *
 * The scroll is the timeline rather than a trigger, because the thing being
 * explained is a sequence with an order, and letting somebody run it at their own
 * pace — forwards, backwards, or stopped halfway — is what turns an animation into
 * an explanation.
 *
 * Every number in it comes out of `lib/story.ts`, which runs the real packer. The
 * cards are illustration; the arithmetic is not.
 */
export function Sequence() {
  const budget = useMotionBudget();

  // The still version is what the server sends and what the browser paints first,
  // every time, for everybody. The scrolled version replaces it once the page is
  // running and has decided it can afford it.
  //
  // Both halves of that matter. Swapping the tree during hydration is a mismatch
  // React refuses — this rendered the animated version on the server and the still
  // one on a reduced-motion client, and threw for it. And a page whose facts only
  // appear once a scroll handler is attached is a page that says nothing at all if
  // the script never arrives, which on a mid-range phone over patchy data is not a
  // hypothetical.
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);

  if (!enhanced || budget === "reduced") return <SequenceStill />;
  return <SequenceScrolled />;
}

function SequenceScrolled() {
  const track = useRef<HTMLDivElement>(null);

  // The scroll position through the tall track, 0 at the top and 1 when its last
  // pixel reaches the bottom of the viewport. The sticky stage inside it stays put
  // for that whole distance, which is what gives the sequence room to run.
  const { scrollYProgress } = useScroll({
    target: track,
    offset: ["start start", "end end"],
  });

  return (
    <section
      ref={track}
      aria-label="What happens to a folder of documents"
      className="relative mt-20 h-[260vh] sm:mt-28"
    >
      {/*
        Clipped sideways, not hidden. A card nudged 30px out of line on a 390px
        screen pushes a couple of pixels past the edge and the whole page gains a
        horizontal scrollbar — and `overflow-x: hidden` would fix that by turning
        this into a scroll container, which is the one thing that would stop the
        stage inside it from sticking. `clip` removes the overflow without that.
      */}
      <div className="sticky top-0 flex min-h-dvh flex-col justify-center overflow-x-clip py-12">
        <Acts progress={scrollYProgress} />
        <Stage progress={scrollYProgress} />
      </div>
    </section>
  );
}

/**
 * The three words for the three things happening.
 *
 * Without these the animation is pleasant and mute. With them it is a claim the
 * viewer can check against what is moving in front of them.
 */
const ACTS = [
  { label: "The folder", detail: "Six files, as they arrived" },
  { label: "Measured", detail: "Each one pushed only as far as needed" },
  { label: "Packed", detail: "Weighed the way the mail server weighs it" },
] as const;

function Acts({ progress }: { progress: MotionValue<number> }) {
  return (
    <ol className="mx-auto flex w-full max-w-xl gap-3 px-5 sm:gap-6">
      {ACTS.map((act, i) => (
        <Act key={act.label} act={act} index={i} progress={progress} />
      ))}
    </ol>
  );
}

/**
 * Every scroll-driven range on this page has to stay inside 0 to 1.
 *
 * Not a style preference — a hard constraint, and an expensive one to learn. Motion
 * detects a transform reading straight from scroll progress and hands it to the
 * browser's native animation engine, where the input range becomes a list of
 * keyframe offsets. Offsets outside 0..1 are rejected outright, and the throw lands
 * during mount rather than at the offending line: the first version of this file
 * used `start - 0.12` for the first act, and the result was the entire page
 * unmounting with "Offsets must be monotonically non-decreasing" and no clue which
 * of a dozen transforms had done it.
 *
 * So the windows below are written out in full instead of computed with offsets that
 * can run off either end.
 */
const ACT_WINDOWS = [
  { fade: [0, 0.06, 0.28, 0.38], line: [0, 0.22] },
  { fade: [0.3, 0.36, 0.58, 0.68], line: [0.3, 0.52] },
  { fade: [0.6, 0.66, 0.88, 0.98], line: [0.6, 0.82] },
] as const;

function Act({
  act,
  index,
  progress,
}: {
  act: (typeof ACTS)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  // Each act owns a third of the scroll, fading up as its third begins and dimming
  // — not vanishing — once it is done, so the sequence reads as a progression
  // rather than three unrelated states.
  const window = ACT_WINDOWS[index];
  const opacity = useTransform(progress, [...window.fade], [0.25, 1, 1, 0.25], {
    clamp: true,
  });
  const line = useTransform(progress, [...window.line], ["0%", "100%"], {
    clamp: true,
  });

  return (
    <motion.li style={{ opacity }} className="min-w-0 flex-1">
      <div className="h-0.5 w-full overflow-hidden rounded-full bg-edge">
        <motion.div style={{ width: line }} className="h-full bg-accent" />
      </div>
      <p className="mt-2 text-sm font-medium">{act.label}</p>
      <p className="mt-0.5 hidden text-xs leading-snug text-ink-soft sm:block">
        {act.detail}
      </p>
    </motion.li>
  );
}

function Stage({ progress }: { progress: MotionValue<number> }) {
  // Parts pull apart as they close around their contents, which is the whole of
  // "these are separate messages" said without a word.
  const gap = useTransform(progress, [0.6, 0.78], ["0px", "14px"], {
    clamp: true,
  });

  return (
    <motion.div
      style={{ gap }}
      className="mx-auto mt-8 flex w-full max-w-xl flex-col px-5"
    >
      {STORY.parts.map((part, partIndex) => (
        <Part
          key={part.index}
          index={part.index}
          total={STORY.parts.length}
          encodedBytes={part.encodedBytes}
          files={part.items.map(
            (item) => STORY.files.find((f) => f.id === item.id) as StoryFile,
          )}
          offset={partIndex === 0 ? 0 : STORY.parts[0].items.length}
          progress={progress}
        />
      ))}
    </motion.div>
  );
}

function Part({
  index,
  total,
  encodedBytes,
  files,
  offset,
  progress,
}: {
  index: number;
  total: number;
  encodedBytes: number;
  files: readonly StoryFile[];
  offset: number;
  progress: MotionValue<number>;
}) {
  const enclose = useTransform(progress, [0.62, 0.8], [0, 1], { clamp: true });
  // Loose rows drawing together. The straightening is what the cards do; this is
  // what the space between them does, and the two together are the whole of "these
  // got organised".
  const rowGap = useTransform(progress, [0.06, 0.32], ["13px", "6px"], {
    clamp: true,
  });

  return (
    <div className="relative p-2">
      {/* The boundary of one email. Drawn as an overlay so it can appear without
          the rows below it shifting by a border width when it does. */}
      <motion.div
        aria-hidden
        style={{ opacity: enclose }}
        className="pointer-events-none absolute inset-0 rounded-[12px] border border-accent/40 bg-accent-wash/40"
      />
      <motion.p
        style={{ opacity: enclose }}
        className="relative flex flex-wrap items-baseline justify-between gap-x-3 px-2 pb-2 text-xs"
      >
        <span className="font-medium">
          Part {String(index).padStart(2, "0")} of{" "}
          {String(total).padStart(2, "0")}
        </span>
        <span className="tabular text-fits">
          {formatBytes(encodedBytes)} on the wire
        </span>
      </motion.p>

      <motion.ul style={{ rowGap }} className="relative flex flex-col">
        {files.map((file, i) => (
          <Document
            key={file.id}
            file={file}
            index={offset + i}
            progress={progress}
          />
        ))}
      </motion.ul>
    </div>
  );
}

/**
 * How far out of line each card starts.
 *
 * Fixed rather than random: a folder that lands somewhere different on every reload
 * is a page reacting to itself, and the scatter has a job — it is the "before" — so
 * it needs to look the same every time somebody scrolls back up to check.
 *
 * Small numbers, and they took a try to get right. The first pass used six degrees
 * and forty pixels, which on a row this wide is not a scattered folder — it is a
 * stack of bars sweeping across each other, illegible and closer to a rendering
 * fault than to paperwork. Under two degrees is enough: the eye reads "nobody
 * straightened these" long before it reads an angle.
 */
const SCATTER = [
  { x: -26, y: 5, rotate: -1.8 },
  { x: 30, y: -6, rotate: 1.3 },
  { x: -14, y: 7, rotate: 2.1 },
  { x: 22, y: 3, rotate: -1 },
  { x: -30, y: -4, rotate: 0.9 },
  { x: 12, y: 6, rotate: -2 },
] as const;

function Document({
  file,
  index,
  progress,
}: {
  file: StoryFile;
  index: number;
  progress: MotionValue<number>;
}) {
  const scatter = SCATTER[index % SCATTER.length];

  // Staggered by index so the pile straightens as a sequence of six decisions
  // rather than one snap. The stagger is small; a slow one reads as a loading state.
  const from = 0.06 + index * 0.025;
  const to = from + 0.2;

  const x = useTransform(progress, [from, to], [scatter.x, 0], { clamp: true });
  const y = useTransform(progress, [from, to], [scatter.y, 0], { clamp: true });
  const rotate = useTransform(progress, [from, to], [scatter.rotate, 0], {
    clamp: true,
  });

  const size = useTransform(progress, [0.36, 0.58], [file.before, file.after], {
    clamp: true,
  });
  const text = useTransform(size, (n) => formatBytes(Math.round(n)));

  // One boolean, flipped once, rather than a colour interpolated every frame —
  // and it is the colour that carries the meaning, so it changes when the figure
  // has actually finished falling.
  const [measured, setMeasured] = useState(false);
  useMotionValueEvent(progress, "change", (v) => {
    const next = v >= 0.57;
    if (next !== measured) setMeasured(next);
  });

  return (
    <motion.li
      style={{ x, y, rotate }}
      className="flex items-center gap-3 rounded-[12px] border border-edge bg-surface px-3 py-2.5"
    >
      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
      <motion.span
        className={[
          "tabular shrink-0 text-sm font-medium tracking-tight transition-colors duration-200",
          measured ? "text-fits" : "text-ink-soft",
        ].join(" ")}
      >
        {text}
      </motion.span>
    </motion.li>
  );
}

/**
 * The same thing, for anyone who will not see it move.
 *
 * Reduced motion and Save-Data get the end of the sequence instead of the sequence,
 * because the rule the whole product follows is that no information may exist only
 * inside an animation. Every figure below is the one the scrolled version arrives
 * at — read from the same module, not retyped.
 */
function SequenceStill() {
  return (
    <section
      aria-label="What happens to a folder of documents"
      className="mx-auto mt-20 w-full max-w-2xl px-5"
    >
      <p className="text-sm text-ink-soft">
        Six files, {formatBytes(STORY.totalBefore)}. As they are, that is{" "}
        {STORY.partsUntouched} emails. Measured and packed, it is{" "}
        {STORY.parts.length}.
      </p>
      <div className="mt-4 space-y-3">
        {STORY.parts.map((part) => (
          <div
            key={part.index}
            className="rounded-[12px] border border-accent/40 bg-accent-wash/40 p-3"
          >
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
              <span className="font-medium">
                Part {String(part.index).padStart(2, "0")} of{" "}
                {String(STORY.parts.length).padStart(2, "0")}
              </span>
              <span className="tabular text-fits">
                {formatBytes(part.encodedBytes)} on the wire
              </span>
            </p>
            <ul className="mt-2 space-y-1.5">
              {part.items.map((item) => {
                const file = STORY.files.find(
                  (f) => f.id === item.id,
                ) as StoryFile;
                return (
                  <li
                    key={file.id}
                    className="flex items-center gap-3 rounded-[12px] border border-edge bg-surface px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {file.name}
                    </span>
                    <span className="tabular shrink-0 text-sm text-ink-soft">
                      {formatBytes(file.before)}
                    </span>
                    <span aria-hidden className="text-ink-soft/50">
                      →
                    </span>
                    <span className="tabular shrink-0 text-sm font-medium text-fits">
                      {formatBytes(file.after)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
