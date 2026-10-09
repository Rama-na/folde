"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import { FilePlus, Lock } from "@phosphor-icons/react";
import { useMotionBudget } from "@/lib/use-motion-budget";

/**
 * The way files get in, and the first thing on the page.
 *
 * It is the hero rather than a box below one. Somebody arriving here is usually
 * mid-problem and already annoyed; making them read a pitch before they can reach
 * the thing that helps would be the wrong trade, and it is the one advantage this
 * has over every tools site with a marketing page bolted on top.
 *
 * Both a drop target and a button, because the two audiences arrive differently.
 * There is nothing to drag on a phone, so the tap has to open the picker directly.
 *
 * It shrinks once it has done its job. A 270px hero asking for files you have
 * already given it is the single biggest thing wrong with the desktop layout: it
 * holds the top of the screen and pushes the size picker — the reason anybody is
 * here — most of the way down the viewport. Compact, it is still a full drop
 * target and still opens the picker; it just stops shouting.
 */
export function Dropzone({
  onFiles,
  disabled,
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Files are already loaded: this is "add more", not "start here". */
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const budget = useMotionBudget();

  const take = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const files = Array.from(list).filter((f) => f.size > 0);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  return (
    <motion.div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
      // Real feedback for a real pointer state, not decoration: the surface
      // acknowledges that it is about to receive something.
      animate={budget === "reduced" ? undefined : { scale: over ? 1.01 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={[
        "rounded-[18px] border border-dashed transition-colors duration-150",
        compact ? "px-4 py-2.5" : "p-8 text-center sm:p-12",
        over
          ? "border-accent bg-accent-wash"
          : "border-edge bg-surface hover:border-ink-soft",
        disabled ? "pointer-events-none opacity-50" : "",
      ].join(" ")}
    >
      {compact ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-[44px] w-full items-center gap-2.5 text-left text-sm font-medium transition-colors duration-150 hover:text-accent"
        >
          <FilePlus size={18} weight="regular" aria-hidden className="shrink-0 text-accent" />
          Add more files
          <span className="ml-auto text-xs font-normal text-ink-soft">
            or drop them here
          </span>
        </button>
      ) : (
        <>
          <FilePlus
            size={32}
            weight="light"
            className="mx-auto text-accent"
            aria-hidden
          />

          <p className="mt-4 text-lg font-medium tracking-tight">
            Drop your documents here
          </p>
          <p className="mt-1 text-sm text-ink-soft">PDFs and photos.</p>

          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="mt-6 inline-flex min-h-[44px] items-center rounded-[12px] bg-accent px-6 font-medium text-accent-ink transition-transform duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            Choose files
          </button>

          <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <Lock size={13} weight="fill" aria-hidden />
            They never leave your device
          </p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/heic,.pdf,.jpg,.jpeg,.png,.heic"
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files);
          // Clearing lets the same file be picked again after it was removed.
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}
