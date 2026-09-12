"use client";

import { formatBytes } from "@/lib/bytes";

export interface ListedFile {
  id: string;
  name: string;
  size: number;
}

/**
 * What was dropped, and how heavy it is.
 *
 * Sizes are the hero of this product, so they get tabular figures and their own
 * column — they recompute in place once a job runs, and proportional digits make
 * that jitter unreadable.
 */
export function FileList({
  files,
  total,
  onRemove,
  onClear,
}: {
  files: readonly ListedFile[];
  total: number;
  onRemove?: (id: string) => void;
  onClear?: () => void;
}) {
  if (files.length === 0) return null;

  return (
    <section className="rounded-[10px] border border-edge bg-surface">
      <header className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h2 className="text-sm font-medium">
          {files.length} file{files.length === 1 ? "" : "s"}
          <span className="tabular ml-2 text-ink-soft">
            {formatBytes(total)}
          </span>
        </h2>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="-mr-2 min-h-[44px] px-2 text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            Clear
          </button>
        )}
      </header>

      <ul className="divide-y divide-edge">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-3 py-0.5 pl-4 pr-1">
            <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>
              {file.name}
            </span>
            <span className="tabular shrink-0 text-sm text-ink-soft">
              {formatBytes(file.size)}
            </span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                aria-label={`Remove ${file.name}`}
                // A full 44px square. The glyph is small but the target is not:
                // mis-tapping remove on file 30 of 42 costs the whole file.
                className="grid size-11 shrink-0 place-items-center rounded text-ink-soft hover:text-wont"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
