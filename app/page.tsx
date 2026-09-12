"use client";

import { useCallback, useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";
import { formatBytes } from "@/lib/bytes";
import type { Preset } from "@/lib/presets";
import { useShrinkJob } from "@/lib/use-shrink-job";
import { Dropzone } from "@/components/Dropzone";
import { FileList, type ListedFile } from "@/components/FileList";
import { Results } from "@/components/Results";
import { TargetPicker } from "@/components/TargetPicker";
import { planDelivery } from "@/modules/pack/strategy";
import type { PackItem } from "@/modules/pack";

interface Held extends ListedFile {
  file: File;
}

export default function Home() {
  const [files, setFiles] = useState<Held[]>([]);
  const [preset, setPreset] = useState<Preset | null>(null);
  const job = useShrinkJob();

  const total = useMemo(
    () => files.reduce((n, f) => n + f.size, 0),
    [files],
  );

  const addFiles = useCallback((incoming: File[]) => {
    setFiles((current) => [
      ...current,
      ...incoming.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        file,
      })),
    ]);
  }, []);

  /**
   * What we are about to do, worked out before doing any of it — so the user is
   * told the plan rather than watching a bar and hoping.
   */
  const strategy = useMemo(() => {
    if (!preset || files.length === 0) return null;
    const items: PackItem[] = files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
    }));

    if (preset.mode === "upload") {
      // A portal takes one file at a time, so there is nothing to batch: every
      // file is simply held to the limit, and one already under it is left alone.
      return {
        reason: `Each file will be brought under ${formatBytes(preset.bytes)}. Anything already smaller is left untouched.`,
        targets: items.map(
          (i) =>
            [i.id, i.size <= preset.bytes ? null : preset.bytes] as [
              string,
              number | null,
            ],
        ),
      };
    }

    const plan = planDelivery(items, { cap: preset.bytes });
    return { reason: plan.reason, targets: [...plan.targets.entries()] };
  }, [files, preset]);

  const start = useCallback(async () => {
    if (!strategy) return;
    const payload = await Promise.all(
      files.map(async (f) => ({
        id: f.id,
        name: f.name,
        bytes: await f.file.arrayBuffer(),
      })),
    );
    job.run(payload, strategy.targets);
  }, [files, job, strategy]);

  const startOver = useCallback(() => {
    job.reset();
    setFiles([]);
    setPreset(null);
  }, [job]);

  const finished = !job.running && job.outcomes.length > 0;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{BRAND.name}</h1>
        <p className="mt-1 text-ink-soft">{BRAND.tagline}</p>
      </header>

      <div className="mt-8 space-y-6">
        {!finished && (
          <>
            <Dropzone onFiles={addFiles} disabled={job.running} />

            <FileList
              files={files}
              total={total}
              onRemove={
                job.running
                  ? undefined
                  : (id) =>
                      setFiles((c) => c.filter((f) => f.id !== id))
              }
              onClear={job.running ? undefined : () => setFiles([])}
            />

            {files.length > 0 && (
              <TargetPicker selected={preset} onSelect={setPreset} />
            )}

            {strategy && !job.running && (
              <section className="rounded-[10px] border border-edge bg-surface p-4">
                <p className="text-sm">{strategy.reason}</p>
                <button
                  type="button"
                  onClick={start}
                  className="mt-4 min-h-[44px] w-full rounded-[10px] bg-accent px-5 font-medium text-accent-ink transition-opacity duration-150 hover:opacity-90 sm:w-auto"
                >
                  Make it fit
                </button>
              </section>
            )}
          </>
        )}

        {job.running && job.progress && (
          <Progress
            done={job.progress.done}
            total={job.progress.total}
            current={job.progress.current}
            onCancel={job.cancel}
          />
        )}

        {job.error && (
          <p className="rounded-[10px] border border-wont/40 bg-wont/5 p-4 text-sm">
            {job.error}
          </p>
        )}

        {finished && preset && (
          <>
            <Results outcomes={job.outcomes} preset={preset} />
            <button
              type="button"
              onClick={startOver}
              className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              Start over
            </button>
          </>
        )}
      </div>

      <footer className="mt-16 border-t border-edge pt-6 text-sm text-ink-soft">
        Everything here happens on your device. Your documents are never uploaded.
      </footer>
    </main>
  );
}

/**
 * Real progress only.
 *
 * The count is files actually finished, not an animation — a bar that moves on a
 * timer while someone waits on a deadline is a lie they can feel.
 */
function Progress({
  done,
  total,
  current,
  onCancel,
}: {
  done: number;
  total: number;
  current: string;
  onCancel: () => void;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <section className="rounded-[10px] border border-edge bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">
          <span className="tabular">
            {done} of {total}
          </span>{" "}
          done
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-edge"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-accent transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>

      {current && (
        <p className="mt-2 truncate text-sm text-ink-soft">{current}</p>
      )}
    </section>
  );
}
