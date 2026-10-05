"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleNotch } from "@phosphor-icons/react";
import { BRAND } from "@/lib/brand";
import { formatBytes } from "@/lib/bytes";
import type { Preset } from "@/lib/presets";
import { useShrinkJob } from "@/lib/use-shrink-job";
import { ActionBar, FileSummary, StepRail, type Step } from "@/components/app/Shell";
import { Dropzone } from "@/components/Dropzone";
import { Landing } from "@/components/landing/Landing";
import { LockedNotice, ToolOffers } from "@/components/tools/ToolOffers";
import { ToolPanel } from "@/components/tools/ToolPanel";
import { analyse, type AnalysedFile, type ToolId } from "@/modules/tools";
import { FileList, type ListedFile } from "@/components/FileList";
import { Results } from "@/components/Results";
import { Roadmap } from "@/components/Roadmap";
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
  /** Phone only: the file list is a summary until somebody asks for the list. */
  const [listOpen, setListOpen] = useState(false);
  const [analysed, setAnalysed] = useState<AnalysedFile[]>([]);
  const job = useShrinkJob();

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
      // One at a time, and each one released before the next is read. Reading them
      // all with Promise.all held every byte of every file in memory at once purely
      // to count pages — forty-two files is forty-two megabytes of nothing, on the
      // device least able to spare it, before the user has even chosen a limit.
      const facts: AnalysedFile[] = [];
      for (const f of files) {
        if (cancelled) return;
        facts.push(
          await analyse({
            id: f.id,
            name: f.name,
            bytes: new Uint8Array(await f.file.arrayBuffer()),
          }),
        );
      }
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

  /*
   * Which step a phone is on, read off what has happened rather than driven by a
   * wizard.
   *
   * There is no "next" button that only advances a counter, and nothing to get out
   * of step with reality: files or no files, working or not, finished or not. The
   * one consequence worth knowing is that dropping a file moves you on immediately,
   * which is also what somebody who just dropped a file wants.
   */
  const step: Step = job.running
    ? "working"
    : finished
      ? "done"
      : files.length === 0
        ? "files"
        : "limit";

  /** Shown on a phone only when it is this step's turn; desktop shows everything. */
  const onStep = (...steps: Step[]) =>
    steps.includes(step) ? "" : "hidden lg:block";

  // Nothing loaded and nothing running: the only moment the case for the product is
  // worth anybody's screen. The instant a file arrives this is a tool, and a tool
  // with a sales pitch stapled underneath is a worse tool.
  const idle = files.length === 0 && !job.running && !finished;

  return (
    <div className="min-h-dvh pb-36 lg:pb-0">
      <main className="mx-auto max-w-5xl px-5 py-6 sm:py-10 lg:py-14">
        <header className="flex items-baseline gap-3">
          <span className="text-xl font-semibold tracking-tight">
            {BRAND.name}
          </span>
          <span className="hidden text-sm text-ink-soft sm:inline">
            {BRAND.tagline}
          </span>
        </header>

        {!idle && tool === null && (
          <div className="mt-5">
            <StepRail step={step} />
          </div>
        )}

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

              {tool === null && files.length > 0 && (
                <FileSummary
                  count={files.length}
                  bytes={formatBytes(total)}
                  onEdit={() => setListOpen((v) => !v)}
                />
              )}

              {tool === null && (
                <div className={files.length === 0 || listOpen ? "" : "hidden lg:block"}>
                  <Dropzone onFiles={addFiles} disabled={job.running} />
                </div>
              )}

              {/* The full list, on a phone, only when it has been asked for. */}
              {tool === null && listOpen && files.length > 0 && (
                <div className="lg:hidden">
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
                </div>
              )}

              {tool === null && files.length > 0 && (
                <div className={onStep("limit")}>
                  <LockedNotice files={analysed} onChoose={chooseTool} />
                </div>
              )}

              {tool === null && files.length > 0 && (
                <div className={onStep("limit")}>
                  <TargetPicker selected={preset} onSelect={setPreset} />
                </div>
              )}

              {job.running && job.progress && (
                <div className="flex min-h-[55svh] flex-col justify-center lg:block lg:min-h-0">
                  <Progress
                    done={job.progress.done}
                    total={job.progress.total}
                    current={job.progress.current}
                    onCancel={job.cancel}
                  />
                </div>
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
              {tool === null && strategy && !job.running && (
                <ActionBar
                  label="Make it fit"
                  detail={strategy.reason}
                  onPress={start}
                />
              )}

              {tool === null && !job.running && analysed.length > 0 && (
                <div className={onStep("limit")}>
                  <ToolOffers files={analysed} onChoose={chooseTool} />
                </div>
              )}

              {/*
                Last on the page, under everything that works. It is the only
                part of this column that is not a thing you can do right now,
                so it goes where the eye arrives having run out of those.
              */}
              {tool === null && !job.running && files.length > 0 && (
                <div className={onStep("limit")}>
                  <Roadmap />
                </div>
              )}
            </div>

            <aside className="hidden lg:sticky lg:top-14 lg:block lg:self-start">
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
        <nav className="flex flex-wrap gap-x-5">
          {[
            ["/legal/privacy", "Privacy"],
            ["/legal/terms", "Terms"],
            ["/legal/refunds", "Refunds"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-[44px] items-center transition-colors duration-150 hover:text-accent"
            >
              {label}
            </Link>
          ))}
        </nav>
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
