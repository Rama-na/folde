"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleNotch, DownloadSimple, WarningCircle } from "@phosphor-icons/react";
import { formatBytes } from "@/lib/bytes";
import { useToolJob } from "@/lib/use-tool-job";
import { downloadAll, downloadFile } from "@/modules/deliver";
import type { AnalysedFile, PagePlan, ToolId } from "@/modules/tools";
import type { ToolFile, ToolOp } from "@/workers/tools-protocol";
import { Ordering, PageGrid, PasswordInput, RangeInput } from "./surfaces";

const TITLES: Record<ToolId, string> = {
  fit: "Fit a size limit",
  merge: "Merge into one PDF",
  organise: "Reorder, rotate or delete pages",
  extract: "Take out some pages",
  "to-images": "Turn pages into images",
  "from-images": "Make one PDF",
  protect: "Add a password",
  unlock: "Unlock",
};

/**
 * One tool, from its controls to the file it produces.
 *
 * Everything here is deliberately linear: what you are doing, the controls for it,
 * one button, then either the result or a sentence saying why there isn't one. There
 * is no dashboard and no second column, because a tool used once every few months by
 * somebody in a hurry should not need to be learned.
 *
 * The four states this actually has — ready, working, done, failed — are all built.
 * A surface that only draws the successful one shows a spinner forever the first
 * time something goes wrong, which for this audience is the first time they use it.
 */
export function ToolPanel({
  tool,
  files,
  read,
  onBack,
}: {
  tool: Exclude<ToolId, "fit">;
  files: readonly AnalysedFile[];
  /** Hands back the bytes for a file id. Held by the page, not by this. */
  read: (id: string) => Promise<ArrayBuffer>;
  onBack: () => void;
}) {
  const job = useToolJob();

  const subjects = useMemo(() => {
    if (tool === "unlock") return files.filter((f) => f.locked);
    if (tool === "from-images") {
      return files.filter(
        (f) => f.kind === "jpeg" || f.kind === "png" || f.kind === "heic",
      );
    }
    return files.filter((f) => f.kind === "pdf" && !f.locked);
  }, [files, tool]);

  const single = subjects[0];
  const pages = single?.pages ?? 0;

  const [order, setOrder] = useState<string[]>(() => subjects.map((f) => f.id));
  const [plan, setPlan] = useState<PagePlan[]>([]);
  const [ranges, setRanges] = useState("");
  const [password, setPassword] = useState("");
  const [fit, setFit] = useState<"a4" | "image">("a4");

  // The page grid needs pictures of the pages before it can be used, so they are
  // fetched the moment the tool opens rather than behind a button nobody would know
  // to press.
  useEffect(() => {
    if (tool !== "organise" || !single) return;
    setPlan(Array.from({ length: pages }, (_, i) => ({ from: i + 1 })));
    let cancelled = false;
    void read(single.id).then((bytes) => {
      if (cancelled) return;
      job.run({ kind: "thumbnails", file: { name: single.name, bytes } }, [bytes]);
    });
    return () => {
      cancelled = true;
    };
    // Run once per tool opening. `job` is stable enough for this and including it
    // would restart the render on every thumbnail that arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, single?.id, pages]);

  const gather = useCallback(
    async (ids: readonly string[]): Promise<{ files: ToolFile[]; transfer: ArrayBuffer[] }> => {
      const out: ToolFile[] = [];
      for (const id of ids) {
        const file = files.find((f) => f.id === id);
        if (!file) continue;
        out.push({ name: file.name, bytes: await read(id) });
      }
      return { files: out, transfer: out.map((f) => f.bytes) };
    },
    [files, read],
  );

  const start = useCallback(async () => {
    const build = async (): Promise<{ op: ToolOp; transfer: ArrayBuffer[] } | null> => {
      switch (tool) {
        case "merge": {
          const { files: got, transfer } = await gather(order);
          return { op: { kind: "merge", files: got }, transfer };
        }
        case "from-images": {
          const { files: got, transfer } = await gather(order);
          return { op: { kind: "images-to-pdf", files: got, fit }, transfer };
        }
        case "protect": {
          const { files: got, transfer } = await gather(subjects.map((f) => f.id));
          return { op: { kind: "protect", files: got, password }, transfer };
        }
        default: {
          if (!single) return null;
          const bytes = await read(single.id);
          const file = { name: single.name, bytes };
          if (tool === "organise") return { op: { kind: "rebuild", file, plan }, transfer: [bytes] };
          if (tool === "extract") return { op: { kind: "extract", file, ranges }, transfer: [bytes] };
          if (tool === "to-images") return { op: { kind: "pdf-to-images", file }, transfer: [bytes] };
          if (tool === "unlock") return { op: { kind: "unlock", file, password }, transfer: [bytes] };
          return null;
        }
      }
    };

    const built = await build();
    if (built) job.run(built.op, built.transfer);
  }, [fit, gather, job, order, password, plan, ranges, read, single, subjects, tool]);

  const ready = readyToRun(tool, { plan, ranges, password, pages, subjects: subjects.length });
  const finished = !job.running && job.outputs.length > 0;
  // Thumbnails are not an output, so a grid that has filled in is not a finished job.
  const showingThumbnails = tool === "organise" && job.thumbnails.size > 0;

  return (
    <section className="space-y-5">
      <header>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-ink-soft transition-colors duration-150 hover:text-accent"
        >
          <ArrowLeft size={15} weight="bold" aria-hidden />
          Back
        </button>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          {TITLES[tool]}
        </h2>
      </header>

      {!finished && (
        <Controls
          tool={tool}
          subjects={subjects}
          order={order}
          setOrder={setOrder}
          pages={pages}
          plan={plan}
          setPlan={setPlan}
          thumbnails={job.thumbnails}
          ranges={ranges}
          setRanges={setRanges}
          password={password}
          setPassword={setPassword}
          fit={fit}
          setFit={setFit}
        />
      )}

      {job.error && (
        <p className="flex items-start gap-2 rounded-[12px] border border-wont/40 bg-wont/5 p-4 text-sm leading-relaxed">
          <WarningCircle size={17} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-wont" />
          {job.error}
        </p>
      )}

      {job.skipped.length > 0 && (
        <div className="rounded-[12px] border border-edge bg-surface p-4">
          <h3 className="text-sm font-semibold">
            {job.skipped.length} file{job.skipped.length === 1 ? "" : "s"} could not
            be used
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            {job.skipped.map((s) => (
              <li key={s.name}>
                <span className="font-medium text-ink">{s.name}</span> {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {job.running && !showingThumbnails && (
        <Working progress={job.progress} onCancel={job.cancel} />
      )}

      {finished ? (
        <Outputs outputs={job.outputs} onAgain={job.reset} />
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={!ready || job.running}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-accent px-6 font-medium text-accent-ink transition-transform duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 sm:w-auto"
        >
          {job.running ? "Working…" : ACTIONS[tool]}
        </button>
      )}
    </section>
  );
}

const ACTIONS: Record<Exclude<ToolId, "fit">, string> = {
  merge: "Merge them",
  organise: "Save the new order",
  extract: "Take those pages",
  "to-images": "Make the images",
  "from-images": "Make the PDF",
  protect: "Lock it",
  unlock: "Unlock it",
};

function readyToRun(
  tool: Exclude<ToolId, "fit">,
  state: {
    plan: readonly PagePlan[];
    ranges: string;
    password: string;
    pages: number;
    subjects: number;
  },
): boolean {
  switch (tool) {
    case "merge":
      return state.subjects >= 2;
    case "organise":
      return state.plan.length > 0;
    case "extract":
      return state.ranges.trim().length > 0;
    case "protect":
      return state.password.length >= 4;
    case "unlock":
      return state.password.length > 0;
    default:
      return state.subjects >= 1;
  }
}

function Controls(props: {
  tool: Exclude<ToolId, "fit">;
  subjects: readonly AnalysedFile[];
  order: string[];
  setOrder: (next: string[]) => void;
  pages: number;
  plan: PagePlan[];
  setPlan: (next: PagePlan[]) => void;
  thumbnails: Map<number, string>;
  ranges: string;
  setRanges: (next: string) => void;
  password: string;
  setPassword: (next: string) => void;
  fit: "a4" | "image";
  setFit: (next: "a4" | "image") => void;
}) {
  const { tool, subjects } = props;

  if (subjects.length === 0) {
    return (
      <p className="rounded-[12px] border border-edge bg-surface p-4 text-sm leading-relaxed text-ink-soft">
        None of the files you dropped can be used for this. Go back and add
        something else.
      </p>
    );
  }

  switch (tool) {
    case "merge":
      return (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-soft">
            They will be joined in this order. Nothing is sorted for you.
          </p>
          <Ordering files={subjects} order={props.order} onReorder={props.setOrder} />
        </div>
      );

    case "from-images":
      return (
        <div className="space-y-3">
          <Ordering files={subjects} order={props.order} onReorder={props.setOrder} />
          <div role="radiogroup" aria-label="Page size" className="grid gap-2 sm:grid-cols-2">
            <FitChoice
              checked={props.fit === "a4"}
              onSelect={() => props.setFit("a4")}
              title="One A4 page each"
              detail="Centred, nothing cropped. What a form or a printer expects."
            />
            <FitChoice
              checked={props.fit === "image"}
              onSelect={() => props.setFit("image")}
              title="Exactly the photo"
              detail="The page is the picture. No margin, nothing added."
            />
          </div>
        </div>
      );

    case "organise":
      return (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-soft">
            {props.plan.length} of {props.pages} pages kept.
          </p>
          <PageGrid
            pages={props.pages}
            thumbnails={props.thumbnails}
            plan={props.plan}
            onChange={props.setPlan}
          />
        </div>
      );

    case "extract":
      return (
        <RangeInput pages={props.pages} value={props.ranges} onChange={props.setRanges} />
      );

    case "to-images":
      return (
        <p className="text-sm leading-relaxed text-ink-soft">
          Every page becomes its own JPEG, numbered so they stay in reading order.
          The text in them stops being selectable, which is what an image is.
        </p>
      );

    case "protect":
    case "unlock":
      return (
        <PasswordInput
          mode={tool}
          value={props.password}
          onChange={props.setPassword}
        />
      );
  }
}

function FitChoice({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={[
        "min-h-[44px] rounded-[12px] border p-3 text-left transition-colors duration-150",
        checked ? "border-accent bg-accent-wash" : "border-edge bg-surface hover:border-ink-soft",
      ].join(" ")}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{detail}</span>
    </button>
  );
}

/** Real progress only. The count is work actually finished, never a timer. */
function Working({
  progress,
  onCancel,
}: {
  progress: { done: number; total: number; current: string } | null;
  onCancel: () => void;
}) {
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <section className="rounded-[12px] border border-edge bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CircleNotch size={15} weight="bold" className="animate-spin text-accent" aria-hidden />
          {progress && progress.total > 0 ? (
            <span className="tabular">
              {progress.done} of {progress.total}
            </span>
          ) : (
            <span>Working</span>
          )}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] text-sm text-ink-soft transition-colors duration-150 hover:text-wont"
        >
          Cancel
        </button>
      </div>
      {progress && progress.total > 0 && (
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
      )}
      {progress?.current && (
        <p className="mt-2 truncate text-sm text-ink-soft">{progress.current}</p>
      )}
    </section>
  );
}

function Outputs({
  outputs,
  onAgain,
}: {
  outputs: { name: string; bytes: ArrayBuffer; size: number }[];
  onAgain: () => void;
}) {
  const total = outputs.reduce((n, o) => n + o.size, 0);
  const files = outputs.map((o) => ({
    name: o.name,
    bytes: new Uint8Array(o.bytes),
  }));

  return (
    <section className="space-y-4">
      <div className="rounded-[12px] border border-edge bg-surface p-5">
        <p className="text-sm text-ink-soft">
          {outputs.length} file{outputs.length === 1 ? "" : "s"}
        </p>
        {/* Measured from the bytes being handed over, like every other size here. */}
        <p className="tabular mt-1 text-3xl font-semibold tracking-tight text-fits">
          {formatBytes(total)}
        </p>
      </div>

      {outputs.length <= 8 ? (
        <ul className="overflow-hidden rounded-[12px] border border-edge bg-surface">
          {outputs.map((output) => (
            <li
              key={output.name}
              className="flex items-center gap-3 border-b border-edge px-4 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{output.name}</span>
              <span className="tabular shrink-0 text-sm text-ink-soft">
                {formatBytes(output.size)}
              </span>
              <button
                type="button"
                onClick={() =>
                  downloadFile({ name: output.name, bytes: new Uint8Array(output.bytes) })
                }
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[12px] border border-edge px-3 text-sm font-medium transition-colors duration-150 hover:border-accent hover:text-accent"
              >
                <DownloadSimple size={15} weight="bold" aria-hidden />
                Save
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[12px] border border-edge bg-surface p-4 text-sm leading-relaxed text-ink-soft">
          {outputs[0].name} through {outputs[outputs.length - 1].name}. Browsers
          space downloads out, so saving all of them takes a moment.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void downloadAll(files)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] bg-accent px-5 font-medium text-accent-ink transition-transform duration-150 hover:opacity-90 active:scale-[0.98]"
        >
          <DownloadSimple size={16} weight="bold" aria-hidden />
          Save {outputs.length === 1 ? "it" : `all ${outputs.length}`}
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="inline-flex min-h-[44px] items-center rounded-[12px] border border-edge px-5 text-sm font-medium transition-colors duration-150 hover:border-accent hover:text-accent"
        >
          Do it again
        </button>
      </div>
    </section>
  );
}
