"use client";

import { useId, useState } from "react";
import { motion } from "motion/react";
import { EnvelopeSimple, UploadSimple } from "@phosphor-icons/react";
import { formatBytes, KB, MB } from "@/lib/bytes";
import { useMotionBudget } from "@/lib/use-motion-budget";
import {
  MAIL_PRESETS,
  UPLOAD_PRESETS,
  customPreset,
  type Preset,
  type PresetMode,
} from "@/lib/presets";

/**
 * Where are these files going?
 *
 * The one question the product asks, and the whole answer depends on it: a portal
 * checks the file sitting on disk, a mail server checks the encoded message, and
 * those are different numbers for the same stated limit.
 *
 * This used to be four separate bordered boxes stacked down the screen: a tab bar,
 * a paragraph, four identical cards a hundred and ten pixels tall, and a custom
 * input. Four containers for one question, every one of them the same white
 * rectangle on a near-white page, so nothing on the screen looked more important
 * than anything else. It was most of why the thing read as clumsy.
 *
 * It is one panel now, divided by hairlines rather than by gaps, and the limits are
 * tight tiles instead of cards. Elevation is for hierarchy; a list of four
 * equivalent choices has none, so it gets no boxes.
 *
 * Two things have been tried in here and taken back out: a third tab for sending
 * on the user's behalf, which left "Send it for me" selected at the top while
 * "Make it fit · under 10 MB" stayed live at the bottom, and a disclosure row for
 * the same feature under the limits, which only repeated what the roadmap below
 * the tools already says. This panel answers one question. The unbuilt feature is
 * named in `components/Roadmap.tsx`, and again on the results screen at the moment
 * somebody is actually told to attach three emails by hand.
 */
export function TargetPicker({
  selected,
  onSelect,
}: {
  selected: Preset | null;
  onSelect: (preset: Preset) => void;
}) {
  const [destination, setDestination] = useState<PresetMode>("mail");
  const presets = destination === "mail" ? MAIL_PRESETS : UPLOAD_PRESETS;

  return (
    <section className="overflow-hidden rounded-[12px] border border-edge bg-surface">
      <div
        role="tablist"
        aria-label="Where the files are going"
        className="relative flex border-b border-edge"
      >
        <Tab
          active={destination === "mail"}
          onClick={() => setDestination("mail")}
          label="Sending by email"
          short="Email"
          icon={EnvelopeSimple}
        />
        <Tab
          active={destination === "upload"}
          onClick={() => setDestination("upload")}
          label="Uploading to a portal"
          short="Portal"
          icon={UploadSimple}
        />
      </div>

      <div className="p-3 sm:p-4">
        <p className="px-1 text-sm leading-relaxed text-ink-soft">
          {destination === "mail"
            ? "Mail servers weigh the encoded message, not your files, so the real budget is about a quarter under the limit. We account for that."
            : "Portals check the file itself. We get under the number and verify it before handing it back."}
        </p>

        {/*
          Keyed on the destination, so switching tabs fades one set of limits out
          and the next in. Without it four numbers change in place and the screen
          reads as four typos rather than as a different question being answered.
        */}
        <motion.div
          key={destination}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="mt-3 grid grid-cols-2 gap-2"
        >
          {presets.map((preset) => (
            <LimitTile
              key={preset.id}
              preset={preset}
              selected={selected?.id === preset.id}
              onSelect={() => onSelect(preset)}
            />
          ))}
        </motion.div>

        <CustomLimit
          mode={destination}
          active={selected?.id === "custom"}
          onSelect={onSelect}
        />
      </div>

    </section>
  );
}

/**
 * One limit.
 *
 * Sixty-odd pixels rather than a hundred and ten, because four of these stacked on
 * a phone was most of a screen spent on a choice that takes a second. The number
 * does the work and the note is support; previously they were the same weight and
 * the tile read as a paragraph with a heading.
 */
function LimitTile({
  preset,
  selected,
  onSelect,
}: {
  preset: Preset;
  selected: boolean;
  onSelect: () => void;
}) {
  const budget = useMotionBudget();

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="relative min-h-[64px] rounded-[12px] border border-edge bg-canvas px-3 py-2.5 text-left transition-colors duration-150 hover:border-ink-soft/50"
    >
      {/*
        The selection is one element that moves between tiles rather than a border
        that switches on and off. It is the only thing on this screen that tracks a
        choice, so letting it travel says "this instead of that" in a way two static
        borders cannot. `layoutId` animates it between positions for free.
      */}
      {selected && (
        <motion.span
          layoutId={budget === "reduced" ? undefined : "chosen-limit"}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="pointer-events-none absolute inset-0 rounded-[12px] border-2 border-accent bg-accent-wash"
          aria-hidden
        />
      )}
      <span className="relative block">
        <span className="tabular block text-[1.0625rem] font-semibold leading-none tracking-tight">
          {formatBytes(preset.bytes)}
        </span>
        <span className="mt-1.5 block text-[11px] leading-[1.35] text-ink-soft">
          {preset.note}
        </span>
      </span>
    </button>
  );
}

/**
 * A limit we do not carry a figure for.
 *
 * Portals change their caps without notice and there are more of them than any list
 * can hold. Without this, somebody whose form says 350 KB has no route through the
 * product at all, which is a strange way to treat the one number they actually know.
 */
function CustomLimit({
  mode,
  active,
  onSelect,
}: {
  mode: PresetMode;
  active: boolean;
  onSelect: (preset: Preset) => void;
}) {
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"KB" | "MB">("KB");
  const id = useId();

  const apply = (rawAmount: string, rawUnit: "KB" | "MB") => {
    const n = Number(rawAmount);
    if (!Number.isFinite(n) || n <= 0) return;
    onSelect(customPreset(Math.round(n * (rawUnit === "KB" ? KB : MB)), mode));
  };

  return (
    <div className="mt-3 border-t border-edge pt-3">
      <label htmlFor={id} className="block px-1 text-sm font-medium">
        Or type the limit your form gives
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={1}
          placeholder="350"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            apply(e.target.value, unit);
          }}
          className={[
            "tabular min-h-[44px] w-full min-w-0 rounded-[12px] border bg-canvas px-3 text-base transition-colors duration-150 placeholder:text-ink-soft/60",
            active ? "border-accent" : "border-edge",
          ].join(" ")}
        />
        <select
          aria-label="Unit"
          value={unit}
          onChange={(e) => {
            const next = e.target.value as "KB" | "MB";
            setUnit(next);
            apply(amount, next);
          }}
          className="min-h-[44px] shrink-0 rounded-[12px] border border-edge bg-canvas px-3 text-base"
        >
          <option value="KB">KB</option>
          <option value="MB">MB</option>
        </select>
      </div>
    </div>
  );
}

function Tab({
  active,
  onClick,
  label,
  short,
  icon: Glyph,
}: {
  active: boolean;
  onClick: () => void;
  /** The accessible name. Stays long so it says what it means out of context. */
  label: string;
  /** What fits on a phone. */
  short: string;
  icon: typeof EnvelopeSimple;
}) {
  const budget = useMotionBudget();
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      onClick={onClick}
      className={[
        "relative flex min-h-[48px] flex-1 items-center justify-center gap-1.5 px-2 text-sm font-medium transition-colors duration-150",
        active ? "text-ink" : "text-ink-soft hover:text-ink",
      ].join(" ")}
    >
      <Glyph size={15} weight={active ? "fill" : "regular"} aria-hidden />
      <span className="truncate">{short}</span>
      {active && (
        // Travels between the two tabs rather than switching on and off, for the
        // same reason the selection on a limit does: a mark that moves says "this
        // instead of that", and two marks fading in and out says nothing.
        <motion.span
          layoutId={budget === "reduced" ? undefined : "chosen-destination"}
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent"
        />
      )}
    </button>
  );
}
