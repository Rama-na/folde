"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CircleNotch } from "@phosphor-icons/react";
import { BRAND } from "@/lib/brand";
import { formatBytes } from "@/lib/bytes";
import type { Preset } from "@/lib/presets";
import { useShrinkJob } from "@/lib/use-shrink-job";
import { useMotionBudget } from "@/lib/use-motion-budget";
import { Dropzone } from "@/components/Dropzone";
import { Landing } from "@/components/landing/Landing";
import { LockedNotice, ToolOffers } from "@/components/tools/ToolOffers";
import { ToolPanel } from "@/components/tools/ToolPanel";
import { analyse, type AnalysedFile, type ToolId } from "@/modules/tools";
import { FileList, type ListedFile } from "@/components/FileList";
import { Results } from "@/components/Results";
import { TargetPicker } from "@/components/TargetPicker";
import { planDelivery } from "@/modules/pack/strategy";
import { largestSendableFile, type PackItem } from "@/modules/pack";

interface Held extends ListedFile {
  file: File;
}

export default function Home() {
  const [files, setFiles] = useState<Held[]>([]);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [tool, setTool] = useState<Exclude<ToolId, "fit"> | null>(null);
  const [analysed, setAnalysed] = useState<AnalysedFile[]>([]);
  const job = useShrinkJob();
  const budget = useMotionBudget();

  const total = useMemo(() => files.reduce((n, f) => n + f.size, 0), [files]);

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

  /*
   * What each file actually is, read from its bytes as soon as it lands.
   *
   * This is what lets the page offer only the tools that apply — six PDFs can be
   * merged, one page cannot be split — and it is deliberately cheap: a type sniff
   * and, for a PDF, its page count. Nothing is rendered and nothing is decoded, so
   * forty files arriving at once does not make the interface think.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const read = await Promise.all(
        files.map(async (f) => ({
          id: f.id,
          name: f.name,
          bytes: new Uint8Array(await f.file.arrayBuffer()),
        })),
      );
      if (cancelled) return;
      const facts = await Promise.all(read.map(analyse));
      if (!cancelled) setAnalysed(facts);
    })();
    return () => {
      cancelled = true;
    };
  }, [files]);

  const chooseTool = useCallback((id: ToolId) => {
    if (id === "fit") return;
    setTool(id);
  }, []);

  /** The bytes for one file, fetched when a tool actually needs them. */
  const readFile = useCallback(
    async (id: string): Promise<ArrayBuffer> => {
      const held = files.find((f) => f.id === id);
      if (!held) throw new Error("That file is no longer here.");
      return held.file.arrayBuffer();
    },
    [files],
  );

  /**
   * What we are about to do, worked out before doing any of it, so the user is
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
    job.run(
      payload,
      strategy.targets,
      // Only a mail job may divide a document. A portal form asking for one
      // document is not helped by being handed three.
      preset?.mode === "mail" ? largestSendableFile(preset.bytes) : null,
    );
  }, [files, job, preset, strategy]);

  const startOver = useCallback(() => {
    job.reset();
    setFiles([]);
    setPreset(null);
    setTool(null);
    setAnalysed([]);
  }, [job]);

  const finished = !job.running && job.outcomes.length > 0;

  // Nothing loaded and nothing running: the only moment the case for the product is
  // worth anybody's screen. The instant a file arrives this is a tool, and a tool
  // with a sales pitch stapled underneath is a worse tool.
  const idle = files.length === 0 && !job.running && !finished;

  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <header className="flex items-baseline gap-3">
          <span className="text-xl font-semibold tracking-tight">
            {BRAND.name}
          </span>
          <span className="text-sm text-ink-soft">{BRAND.tagline}</span>
        </header>

        {finished && preset ? (
          <div className="mx-auto mt-8 max-w-2xl">
            <Results outcomes={job.outcomes} preset={preset} />
            <button
              type="button"
              onClick={startOver}
              className="mt-6 inline-flex min-h-[44px] items-center text-sm text-ink-soft transition-colors duration-150 hover:text-accent"
            >
              Start over
            </button>
          </div>
        ) : (
          /*
           * Asymmetric on desktop, single column on a phone. The left column is
           * the thing you came to use; the right carries state once there is any,
           * and is not rendered at all when empty rather than reserving space.
           */
          <div
            id="drop"
            className="mt-8 grid scroll-mt-8 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8"
          >
            <div className="space-y-6">
              {tool !== null && (
                <ToolPanel
                  tool={tool}
                  files={analysed}
                  read={readFile}
                  onBack={() => setTool(null)}
                />
              )}

              {tool === null && idle && (
                <div className="max-w-xl">
                  <h1 className="text-3xl font-semibold leading-[1.15] tracking-tight sm:text-[2.6rem]">
                    Name the limit. Get files that land under it.
                  </h1>
                  <p className="mt-3 leading-relaxed text-ink-soft">
                    A scan, a passport photograph, or a folder of forty. Every
                    size you see here has been measured on the real output, on
                    your device — nothing is uploaded and nothing is guessed.
                  </p>
                </div>
              )}

              {tool === null && (
                <Dropzone onFiles={addFiles} disabled={job.running} />
              )}

              {tool === null && files.length > 0 && (
                <>
                  <LockedNotice files={analysed} onChoose={chooseTool} />
                  <TargetPicker selected={preset} onSelect={setPreset} />
                </>
              )}

              {strategy && !job.running && (
                <motion.section
                  initial={budget === "reduced" ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-[12px] border border-accent/30 bg-accent-wash p-4"
                >
                  <p className="text-sm leading-relaxed">{strategy.reason}</p>
                  <button
                    type="button"
                    onClick={start}
                    className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-accent px-6 font-medium text-accent-ink transition-transform duration-150 hover:opacity-90 active:scale-[0.98] sm:w-auto"
                  >
                    Make it fit
                    <ArrowRight size={16} weight="bold" aria-hidden />
                  </button>
                </motion.section>
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
                <p className="rounded-[12px] border border-wont/40 bg-wont/5 p-4 text-sm">
                  {job.error}
                </p>
              )}

              {/*
                Below the size picker, never above it. Fitting a limit is the job
                people arrived for; this is the answer to "while I am here", and the
                list is short because everything that does not apply to these
                particular files has already been thrown away.
              */}
              {tool === null && !job.running && analysed.length > 0 && (
                <ToolOffers files={analysed} onChoose={chooseTool} />
              )}
            </div>

            <aside className="lg:sticky lg:top-14 lg:self-start">
              {files.length > 0 ? (
                <FileList
                  files={files}
                  total={total}
                  onRemove={
                    job.running
                      ? undefined
                      : (id) => setFiles((c) => c.filter((f) => f.id !== id))
                  }
                  onClear={job.running ? undefined : () => setFiles([])}
                />
              ) : (
                <WhyItBounces />
              )}
            </aside>
          </div>
        )}
      </main>

      {idle && <Landing />}

      <footer className="mx-auto mt-20 max-w-5xl px-5 pb-10 text-sm text-ink-soft sm:mt-28">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-edge pt-6">
          <span>
            <span className="font-medium text-ink">{BRAND.name}</span>{" "}
            {BRAND.separator} {BRAND.tagline}
          </span>
          <span>
            Everything here happens on your device. Your documents are never
            uploaded.
          </span>
        </div>
      </footer>
    </div>
  );
}

/**
 * The most interesting true thing about the product, stated plainly.
 *
 * It sits where the file list will go, so an empty right column says something
 * useful instead of holding space. It is also the fact that explains why a
 * carefully-sized attachment still bounces, which is the exact confusion that
 * brought most people here.
 */
function WhyItBounces() {
  return (
    <section className="rounded-[12px] border border-edge bg-surface p-5">
      <h2 className="text-sm font-semibold">
        A 5 MB limit is not 5 MB of files
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Mail servers measure the encoded message, and encoding inflates every
        attachment by about 37% before headers are counted. A 5 MB cap is really
        about 3.5 MB of files.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        It is why a carefully-trimmed 4.7 MB email still bounces. On the wire it
        weighs <span className="tabular font-medium text-ink">6.4 MB</span>.
      </p>
    </section>
  );
}

/**
 * Real progress only.
 *
 * The count is files actually finished, not an animation. A bar that moves on a
 * timer while somebody waits on a deadline is a lie they can feel.
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
    <section className="rounded-[12px] border border-edge bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CircleNotch
            size={15}
            weight="bold"
            className="animate-spin text-accent"
            aria-hidden
          />
          <span className="tabular">
            {done} of {total}
          </span>{" "}
          done
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] text-sm text-ink-soft transition-colors duration-150 hover:text-wont"
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
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {current && (
        <p className="mt-2 truncate text-sm text-ink-soft">{current}</p>
      )}
    </section>
  );
}
