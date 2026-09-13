"use client";

import { X, FilePdf, Image as ImageIcon } from "@phosphor-icons/react";
import { formatBytes } from "@/lib/bytes";

export interface ListedFile {
  id: string;
  name: string;
  size: number;
}

/**
 * What was dropped, and how heavy it is.
 *
 * Sizes are the hero of this product, so they get Geist Mono and their own column.
 * They recompute in place once a job runs, and a drawn tabular figure is what keeps
 * that column from shuffling sideways on every update.
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
    <section className="overflow-hidden rounded-[12px] border border-edge bg-surface">
      <header className="flex items-center justify-between border-b border-edge px-4 py-2.5">
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
            className="-mr-2 min-h-[44px] px-2 text-sm text-ink-soft transition-colors duration-150 hover:text-ink"
          >
            Clear
          </button>
        )}
      </header>

      {/*
        Scrolls past about eight rows. Forty-two files is a normal case here, and
        an unbounded list pushes the target picker and the button off the bottom of
        a phone screen entirely.
      */}
      <ul className="max-h-[22rem] divide-y divide-edge overflow-y-auto">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-3 py-0.5 pl-4 pr-1">
            <FileGlyph name={file.name} />
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
                className="grid size-11 shrink-0 place-items-center rounded-[12px] text-ink-soft transition-colors duration-150 hover:bg-wont/10 hover:text-wont"
              >
                <X size={15} weight="bold" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * PDF or photo, by extension.
 *
 * Only decoration, so the name is good enough here. The ladder itself dispatches on
 * the file's bytes, because a wrong guess there tells somebody their perfectly good
 * photograph is damaged; a wrong guess here shows the wrong small glyph.
 */
function FileGlyph({ name }: { name: string }) {
  const isImage = /\.(jpe?g|png|heic)$/i.test(name);
  const Icon = isImage ? ImageIcon : FilePdf;
  return (
    <Icon
      size={16}
      weight="regular"
      className="shrink-0 text-ink-soft"
      aria-hidden
    />
  );
}
