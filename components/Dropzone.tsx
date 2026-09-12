"use client";

import { useCallback, useRef, useState } from "react";

/**
 * The way files get in.
 *
 * Both a drop target and a button, because the two audiences arrive differently:
 * on a phone there is nothing to drag, and tapping has to open the file picker
 * directly. The whole thing is one large tap target for that reason.
 */
export function Dropzone({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const files = Array.from(list).filter((f) => f.size > 0);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div
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
      className={[
        "rounded-[14px] border border-dashed p-8 text-center transition-all duration-150 sm:p-12",
        over
          ? "border-accent bg-surface shadow-lg"
          : "border-edge bg-surface/60",
        disabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <p className="text-lg font-medium">Drop your documents here</p>
      <p className="mt-1 text-sm text-ink-soft">
        PDFs. They never leave your device.
      </p>

      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="mt-5 min-h-[44px] rounded-[10px] bg-accent px-5 py-2.5 font-medium text-accent-ink transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
      >
        Choose files
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files);
          // Clearing lets the same file be picked again after it was removed.
          e.target.value = "";
        }}
      />
    </div>
  );
}
