"use client";

import { motion } from "motion/react";
import { ArrowRight, CircleNotch } from "@phosphor-icons/react";
import { useMotionBudget } from "@/lib/use-motion-budget";

/**
 * The phone shell.
 *
 * Most of this product is used in a phone browser, and until now a phone got the
 * desktop page stacked: a drop zone, a tab bar, four limit cards, a custom input, a
 * plan, a progress card and a file list, all the same visual weight, all in one
 * column, with the button that actually does the work wherever that column happened
 * to put it. Somebody holding the phone one-handed had to hunt for it, and on the
 * screen that prompted this rewrite it was below the fold.
 *
 * So: one thing at a time, and the next action always under the thumb. The steps are
 * derived from what the user has actually done rather than from a wizard they have
 * to drive — files or no files, working or not, finished or not — so there is no
 * state machine to get out of step with reality, and no "next" button that only
 * advances a counter.
 *
 * Desktop keeps the two-column working surface. It has room for everything at once
 * and the thumb is not a constraint there.
 */

export type Step = "files" | "limit" | "working" | "done";

const LABELS: Record<Step, string> = {
  files: "Files",
  limit: "Limit",
  working: "Working",
  done: "Done",
};

/**
 * Where a step sits on the rail.
 *
 * "working" shares the last leg with "done" but does not fill it. The first version
 * filled all three and said "Step 3 of 3 · Done" with a spinner still turning
 * underneath, which is the rail contradicting the screen.
 */
function railIndex(step: Step): number {
  if (step === "files") return 0;
  if (step === "limit") return 1;
  return 2;
}

/**
 * Three hairlines at the top of the screen.
 *
 * Not decoration and not a loading bar: it answers "how much of this is left", which
 * is the question somebody has twenty minutes before a portal closes. It is the
 * cheapest possible answer — three rules and a word — because the screen below it is
 * the part that matters.
 */
export function StepRail({ step }: { step: Step }) {
  const at = railIndex(step);
  const reached = (i: number) =>
    i < at || (i === at && step !== "working") ? "w-full" : i === at ? "w-1/3" : "w-0";

  return (
    <div className="lg:hidden" aria-hidden>
      <ol className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-edge">
            <div
              className={[
                "h-full rounded-full bg-accent transition-[width] duration-500 ease-out",
                reached(i),
              ].join(" ")}
            />
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs font-medium text-ink-soft">
        Step {at + 1} of 3 · {LABELS[step]}
      </p>
    </div>
  );
}

/**
 * The one action.
 *
 * Pinned to the bottom of the screen on a phone, where a thumb can reach it, and
 * sitting inline in the column on a desktop, where it already was. One element and
 * two positions rather than two elements — partly because a second copy is a second
 * thing to keep in sync, and partly because two buttons with the same name in the
 * same document is ambiguous for a screen reader and for anything else reading the
 * page.
 *
 * `env(safe-area-inset-bottom)` keeps it clear of the home indicator on a notched
 * phone; without it the button sits under the swipe area and every third tap is a
 * gesture instead.
 */
export function ActionBar({
  label,
  detail,
  onPress,
  disabled = false,
  busy = false,
  secondary,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: { label: string; onPress: () => void };
}) {
  const budget = useMotionBudget();
  return (
    <motion.div
      initial={budget === "reduced" ? false : { y: 24 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      /*
        `mb-0` is load-bearing, not tidiness. This sits inside the column's
        `space-y-6`, and Tailwind v4 implements that as `margin-block-end` on every
        child but the last — which a `bottom: 0` fixed element does not ignore. It
        lifts the bar 24px off the bottom of the screen, and the strip of tool list
        showing underneath was the exact thing that looked unfinished in the
        screenshot. On `lg` the bar is static again and wants the rhythm back.
      */
      className="fixed inset-x-0 bottom-0 z-40 mb-0 border-t border-edge bg-canvas lg:static lg:mb-6 lg:border-0 lg:bg-transparent lg:pb-0"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {/*
        Opaque, with the page fading out above it.

        It was a translucent blur, which in a screenshot turned out to be exactly
        the clumsy thing: the tool list underneath showed through as ghost text
        directly behind "Make it fit", so the most important control on a phone sat
        on top of words it had nothing to do with. A frosted bar only reads as glass
        when there is something worth seeing through it. Here the honest treatment
        is a solid bar and eight pixels of fade, so the column visibly runs under it
        rather than being smeared into it.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-canvas to-transparent lg:hidden"
      />
      <div className="mx-auto flex max-w-lg items-center gap-2 px-4 pt-3 lg:mx-0 lg:max-w-none lg:px-0 lg:pt-0">
        {secondary && (
          <button
            type="button"
            onClick={secondary.onPress}
            className="min-h-[52px] shrink-0 rounded-[12px] border border-edge px-4 text-sm font-medium transition-colors duration-150 active:bg-accent-wash"
          >
            {secondary.label}
          </button>
        )}
        <button
          type="button"
          onClick={onPress}
          disabled={disabled || busy}
          className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-accent px-5 text-base font-semibold text-accent-ink transition-transform duration-150 active:scale-[0.985] disabled:opacity-40 lg:min-h-[44px] lg:flex-none lg:text-sm"
        >
          {busy && (
            <CircleNotch size={17} weight="bold" className="animate-spin" aria-hidden />
          )}
          {label}
          {!busy && <ArrowRight size={16} weight="bold" aria-hidden />}
        </button>
      </div>
      {/*
        What pressing it will do, attached to the thing that does it.

        This sentence used to be a card of its own further up the column, and on a
        phone it appeared at the exact moment the fixed bar covered it: you chose a
        limit, the page told you the plan, and the plan landed underneath the
        button. Keeping them together is also just truer — "2 emails instead of 3"
        is not a fact about the page, it is a description of this button.

        `role="status"` because it appears in response to choosing a limit and says
        what will happen to these particular files. A screen reader should announce
        that when it changes.
      */}
      {detail && (
        <p
          role="status"
          className="mx-auto max-w-lg px-4 pt-2 text-center text-xs leading-relaxed text-ink-soft lg:mx-0 lg:max-w-prose lg:px-0 lg:text-left"
        >
          {detail}
        </p>
      )}
    </motion.div>
  );
}

/**
 * What is loaded, in one line, once the files stop being the subject.
 *
 * The full list is genuinely useful while you are assembling a pile and pure noise
 * once you have moved on to choosing a limit. On a phone it was costing most of a
 * screen at the moment the limit picker needed one.
 */
export function FileSummary({
  count,
  bytes,
  onEdit,
}: {
  count: number;
  bytes: string;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[12px] border border-edge bg-surface px-4 py-3 text-left transition-colors duration-150 active:bg-accent-wash lg:hidden"
    >
      {/* An h2 rather than a span, because on a phone this *is* the file list's
          heading — the list itself is one tap away, and the count is the part
          somebody checks. */}
      <h2 className="text-sm font-medium">
        {count} file{count === 1 ? "" : "s"}{" "}
        <span className="tabular font-normal text-ink-soft">{bytes}</span>
      </h2>
      <span className="text-sm font-medium text-accent">Change</span>
    </button>
  );
}
