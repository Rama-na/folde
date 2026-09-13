"use client";

import { useMemo, useState } from "react";
import {
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeSlash,
  Trash,
} from "@phosphor-icons/react";
import { formatBytes } from "@/lib/bytes";
import { parseRanges, type AnalysedFile, type PagePlan, type Rotation } from "@/modules/tools";

/**
 * The controls for each tool.
 *
 * Every one of these is a working surface rather than a composition: predictable
 * layout, one column, nothing asymmetric, no motion. Somebody rearranging a
 * twenty-page document under time pressure needs the page they are dragging to stay
 * where they put it, and that is worth more than an interesting grid.
 */

/** Row of the ordering list, shared by merge and images-to-PDF. */
export function Ordering({
  files,
  order,
  onReorder,
}: {
  files: readonly AnalysedFile[];
  order: readonly string[];
  onReorder: (next: string[]) => void;
}) {
  const byId = new Map(files.map((f) => [f.id, f]));

  const move = (index: number, by: number) => {
    const next = [...order];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    onReorder(next);
  };

  return (
    <ol className="overflow-hidden rounded-[12px] border border-edge bg-surface">
      {order.map((id, index) => {
        const file = byId.get(id);
        if (!file) return null;
        return (
          <li
            key={id}
            className="flex items-center gap-3 border-b border-edge px-3 py-2 last:border-b-0"
          >
            <span className="tabular w-6 shrink-0 text-sm text-ink-soft">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{file.name}</span>
              <span className="tabular mt-0.5 block text-xs text-ink-soft">
                {formatBytes(file.size)}
                {file.pages ? ` · ${file.pages} pages` : ""}
              </span>
            </span>
            {/* Arrows rather than drag. Dragging is nicer with a mouse and close to
                unusable with a thumb, and this is a phone-first product. */}
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={`Move ${file.name} up`}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-edge transition-colors duration-150 hover:border-accent hover:text-accent disabled:opacity-30"
            >
              <ArrowUp size={15} weight="bold" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === order.length - 1}
              aria-label={`Move ${file.name} down`}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-edge transition-colors duration-150 hover:border-accent hover:text-accent disabled:opacity-30"
            >
              <ArrowDown size={15} weight="bold" aria-hidden />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The pages of one document, as pictures of themselves.
 *
 * Real renders, not numbered rectangles. Nobody can tell page 7 from page 8 of a
 * bank statement by its number, and a reorder tool that shows placeholders is a
 * reorder tool you have to use twice: once to guess, once to fix.
 *
 * They arrive one at a time from the worker, so the grid fills in as they render
 * rather than waiting on the whole document.
 */
export function PageGrid({
  pages,
  thumbnails,
  plan,
  onChange,
}: {
  pages: number;
  thumbnails: Map<number, string>;
  plan: readonly PagePlan[];
  onChange: (next: PagePlan[]) => void;
}) {
  const move = (index: number, by: number) => {
    const next = [...plan];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  const turn = (index: number) => {
    const next = [...plan];
    next[index] = {
      ...next[index],
      rotate: (((next[index].rotate ?? 0) + 90) % 360) as Rotation,
    };
    onChange(next);
  };

  const drop = (index: number) => {
    onChange(plan.filter((_, i) => i !== index));
  };

  if (plan.length === 0) {
    return (
      <p className="rounded-[12px] border border-wont/40 bg-wont/5 p-4 text-sm">
        Every page has been removed. Put one back, or go back and start again.
      </p>
    );
  }

  return (
    // One column on a phone, deliberately. Four 44px controls need 176px and a
    // half-width cell at 390px gives about 165, so the second column silently
    // clipped the delete button out of its own card: still clickable by a test,
    // unreachable by a thumb. A single column also makes the page itself legible,
    // which is the only reason these are pictures rather than numbers.
    <ul className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 sm:grid-cols-3">
      {plan.map((page, index) => {
        const src = thumbnails.get(page.from);
        return (
          <li
            key={`${page.from}-${index}`}
            className="overflow-hidden rounded-[12px] border border-edge bg-surface"
          >
            <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-canvas">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={`Page ${page.from}`}
                  style={{ transform: `rotate(${page.rotate ?? 0}deg)` }}
                  className="max-h-full max-w-full object-contain transition-transform duration-150"
                />
              ) : (
                // A skeleton the shape of the thing that is coming, not a spinner.
                <div className="size-full animate-pulse bg-edge/60" />
              )}
            </div>
            <div className="flex items-center justify-between gap-1 border-t border-edge px-2 py-1">
              <span className="tabular text-xs text-ink-soft">{page.from}</span>
              <span className="flex">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move page ${page.from} earlier`}
                  className="inline-flex size-11 items-center justify-center rounded-[12px] transition-colors duration-150 hover:text-accent disabled:opacity-30"
                >
                  <ArrowUp size={14} weight="bold" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === plan.length - 1}
                  aria-label={`Move page ${page.from} later`}
                  className="inline-flex size-11 items-center justify-center rounded-[12px] transition-colors duration-150 hover:text-accent disabled:opacity-30"
                >
                  <ArrowDown size={14} weight="bold" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => turn(index)}
                  aria-label={`Rotate page ${page.from}`}
                  className="inline-flex size-11 items-center justify-center rounded-[12px] transition-colors duration-150 hover:text-accent"
                >
                  <ArrowClockwise size={14} weight="bold" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => drop(index)}
                  aria-label={`Remove page ${page.from}`}
                  className="inline-flex size-11 items-center justify-center rounded-[12px] transition-colors duration-150 hover:text-wont"
                >
                  <Trash size={14} weight="bold" aria-hidden />
                </button>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A page range, checked as it is typed.
 *
 * The count underneath is the whole point. "1-3, 7" is easy to get wrong by one, and
 * the moment to find that out is now rather than after the file has been sent.
 */
export function RangeInput({
  pages,
  value,
  onChange,
}: {
  pages: number;
  value: string;
  onChange: (next: string) => void;
}) {
  const chosen = useMemo(() => parseRanges(value, pages), [value, pages]);

  return (
    <div>
      <label htmlFor="range" className="block text-sm font-medium">
        Which pages to keep
      </label>
      <p className="mt-1 text-xs text-ink-soft">
        A list, a span, or both. This document has {pages} pages.
      </p>
      <input
        id="range"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="1-3, 7"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tabular mt-2 min-h-[44px] w-full rounded-[12px] border border-edge bg-canvas px-3 text-base placeholder:text-ink-soft/60"
      />
      <p
        className={`mt-2 text-sm ${chosen.length > 0 ? "text-fits" : "text-ink-soft"}`}
        aria-live="polite"
      >
        {value.trim() === ""
          ? "Nothing chosen yet."
          : chosen.length === 0
            ? `Nothing in that names a page of this document.`
            : `${chosen.length} page${chosen.length === 1 ? "" : "s"}: ${chosen.slice(0, 12).join(", ")}${chosen.length > 12 ? "..." : ""}`}
      </p>
    </div>
  );
}

/**
 * A password, and the warning that has to come before the button rather than after.
 *
 * Nothing here stores anything, which is the promise the whole product runs on and
 * is also exactly why a forgotten password means a document nobody opens again. That
 * sentence belongs on this screen, in this moment, not in a help page.
 */
export function PasswordInput({
  mode,
  value,
  onChange,
}: {
  mode: "protect" | "unlock";
  value: string;
  onChange: (next: string) => void;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div>
      <label htmlFor="password" className="block text-sm font-medium">
        {mode === "protect" ? "Choose a password" : "The password"}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="password"
          type={shown ? "text" : "password"}
          autoComplete={mode === "protect" ? "new-password" : "current-password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[44px] w-full min-w-0 rounded-[12px] border border-edge bg-canvas px-3 text-base"
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide characters" : "Show characters"}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-edge transition-colors duration-150 hover:border-accent hover:text-accent"
        >
          {shown ? (
            <EyeSlash size={16} weight="regular" aria-hidden />
          ) : (
            <Eye size={16} weight="regular" aria-hidden />
          )}
        </button>
      </div>

      {mode === "protect" && (
        <p className="mt-3 rounded-[12px] border border-edge bg-surface p-3 text-sm leading-relaxed text-ink-soft">
          Write it down somewhere first. This is real encryption and nothing here
          remembers anything, so a forgotten password is a document that nobody opens
          again, including you.
        </p>
      )}
      {mode === "protect" && value.length > 0 && value.length < 4 && (
        <p className="mt-2 text-sm text-wont">
          Four characters at the very least.
        </p>
      )}
    </div>
  );
}
