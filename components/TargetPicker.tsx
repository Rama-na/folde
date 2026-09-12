"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/bytes";
import {
  MAIL_PRESETS,
  UPLOAD_PRESETS,
  type Preset,
  type PresetMode,
} from "@/lib/presets";

/**
 * Where are these files going?
 *
 * This is the one question the product asks, and the whole answer depends on it —
 * a portal checks the file on disk, a mail server checks the encoded message, and
 * those are different numbers for the same stated limit.
 *
 * The presets carry the note about who enforces each figure, because almost nobody
 * knows their limit as a number. They know it as "the SSC site keeps rejecting it".
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
        className="flex gap-1 rounded-[10px] border border-edge bg-surface p-1"
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

      <p className="mt-3 text-sm text-ink-soft">
        {mode === "mail"
          ? "Mail servers measure the encoded message, not your files — so the real budget is about a quarter smaller than the limit. We account for that."
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
              "min-h-[44px] rounded-[10px] border p-3 text-left transition-colors duration-150",
              selected?.id === preset.id
                ? "border-accent bg-accent/10"
                : "border-edge bg-surface hover:border-ink-soft",
            ].join(" ")}
          >
            <span className="tabular block text-lg font-semibold">
              {formatBytes(preset.bytes)}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-ink-soft">
              {preset.note}
            </span>
          </button>
        ))}
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
        "min-h-[44px] flex-1 rounded-[8px] px-3 text-sm font-medium transition-colors duration-150",
        active ? "bg-accent text-accent-ink" : "text-ink-soft hover:text-ink",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
