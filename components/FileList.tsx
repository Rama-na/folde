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
            className="text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            Clear
          </button>
        )}
      </header>

      <ul className="divide-y divide-edge">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-3 px-4 py-2.5">
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
                className="shrink-0 rounded px-2 py-1 text-ink-soft hover:text-wont"
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
