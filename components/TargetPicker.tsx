"use client";

import { useState } from "react";
import { formatBytes, KB, MB } from "@/lib/bytes";
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
 * Every preset carries the note about who enforces it, because almost nobody knows
 * their limit as a number. They know it as "the SSC site keeps rejecting it".
 */
export function TargetPicker({
  selected,
  onSelect,
}: {
  selected: Preset | null;
  onSelect: (preset: Preset) => void;
}) {
  const [mode, setMode] = useState<PresetMode>("mail");
  const presets = mode === "mail" ? MAIL_PRESETS : UPLOAD_PRESETS;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Where the files are going"
        className="flex gap-1 rounded-[12px] border border-edge bg-surface p-1"
      >
        <Tab
          active={mode === "mail"}
          onClick={() => setMode("mail")}
          label="Sending by email"
        />
        <Tab
          active={mode === "upload"}
          onClick={() => setMode("upload")}
          label="Uploading to a portal"
        />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {mode === "mail"
          ? "Mail servers measure the encoded message, not your files, so the real budget is about a quarter smaller than the limit. We account for that."
          : "Portals check the file itself. We get under the number and verify it before handing it back."}
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset)}
            aria-pressed={selected?.id === preset.id}
            className={[
              "min-h-[44px] rounded-[12px] border p-3 text-left transition-colors duration-150",
              selected?.id === preset.id
                ? "border-accent bg-accent-wash"
                : "border-edge bg-surface hover:border-ink-soft",
            ].join(" ")}
          >
            <span className="tabular block text-lg font-semibold tracking-tight">
              {formatBytes(preset.bytes)}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-ink-soft">
              {preset.note}
            </span>
          </button>
        ))}
      </div>

      <CustomLimit
        mode={mode}
        active={selected?.id === "custom"}
        onSelect={onSelect}
      />
    </div>
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

  const apply = (rawAmount: string, rawUnit: "KB" | "MB") => {
    const n = Number(rawAmount);
    if (!Number.isFinite(n) || n <= 0) return;
    onSelect(customPreset(Math.round(n * (rawUnit === "KB" ? KB : MB)), mode));
  };

  return (
    <div
      className={[
        "mt-2 rounded-[12px] border p-3 transition-colors duration-150",
        active ? "border-accent bg-accent-wash" : "border-edge bg-surface",
      ].join(" ")}
    >
      <label htmlFor="custom-limit" className="block text-sm font-medium">
        Or type the limit your form gives
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="custom-limit"
          type="number"
          inputMode="decimal"
          min={1}
          placeholder="350"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            apply(e.target.value, unit);
          }}
          className="tabular min-h-[44px] w-full min-w-0 rounded-[12px] border border-edge bg-canvas px-3 text-base placeholder:text-ink-soft/60"
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
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "min-h-[44px] flex-1 rounded-[10px] px-3 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-accent text-accent-ink"
          : "text-ink-soft hover:bg-accent-wash hover:text-ink",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
