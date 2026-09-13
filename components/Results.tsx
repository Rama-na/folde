"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowSquareOut,
  DownloadSimple,
  ShareNetwork,
  WarningCircle,
  TextAa,
} from "@phosphor-icons/react";
import { formatBytes } from "@/lib/bytes";
import type { Preset } from "@/lib/presets";
import { useMotionBudget } from "@/lib/use-motion-budget";
import { CountBytes } from "@/components/motion/CountBytes";
import {
  batchFileName,
  buildManifest,
  canShareFiles,
  downloadAll,
  downloadFile,
  shareFiles,
  zipBatch,
  type DeliverableFile,
} from "@/modules/deliver";
import { planBatches, type PackItem } from "@/modules/pack";
import type { FileOutcome } from "@/workers/protocol";

/**
 * What came back, and how to get it off the device.
 *
 * Two shapes, because the two jobs end differently. A portal upload wants one file
 * at a time, verified under the number. An email wants batches that will survive
 * the recipient's filters.
 *
 * Everything here is measured. A size on this screen is the length of bytes we are
 * holding, never a projection.
 */
export function Results({
  outcomes,
  preset,
}: {
  outcomes: readonly FileOutcome[];
  preset: Preset;
}) {
  const failed = outcomes.filter((o) => !o.ok);
  const rasterized = outcomes.filter((o) => o.ok && !o.textPreserved);
  const succeeded = outcomes.filter((o) => o.ok);

  const saved = useMemo(() => {
    const before = outcomes.reduce((n, o) => n + o.originalSize, 0);
    const after = outcomes.reduce((n, o) => n + o.size, 0);
    return { before, after };
  }, [outcomes]);

  const shrank = saved.before > saved.after;

  return (
    <div className="space-y-6">
      {/*
        The payoff. The only element on the page at this scale, because it is the
        only question anybody came here with.
      */}
      <section className="rounded-[12px] border border-edge bg-surface p-5 sm:p-6">
        <p className="text-sm text-ink-soft">
          {outcomes.length} file{outcomes.length === 1 ? "" : "s"}
        </p>
        <p className="tabular mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          <span className="text-ink-soft">{formatBytes(saved.before)}</span>
          <span aria-hidden className="text-ink-soft/50">
            →
          </span>
          <CountBytes
            from={saved.before}
            to={saved.after}
            className={shrank ? "text-fits" : undefined}
          />
        </p>
        {shrank && (
          <p className="mt-2 text-sm font-medium text-fits">
            {Math.round((1 - saved.after / saved.before) * 100)}% smaller
          </p>
        )}
      </section>

      {failed.length > 0 && <Refusals outcomes={failed} />}
      {rasterized.length > 0 && <RasterWarning count={rasterized.length} />}

      {preset.mode === "mail" ? (
        <MailBatches outcomes={succeeded} preset={preset} />
      ) : (
        <SingleFiles outcomes={succeeded} />
      )}
    </div>
  );
}

/**
 * Files we could not get under the limit.
 *
 * Its own block, at the top, in the colour that means "this needs you". The one
 * thing this product must never do is bury a failure under a success.
 */
function Refusals({ outcomes }: { outcomes: readonly FileOutcome[] }) {
  return (
    <section className="rounded-[12px] border border-wont/40 bg-wont/5 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-wont">
        <WarningCircle size={17} weight="fill" aria-hidden />
        {outcomes.length} file{outcomes.length === 1 ? "" : "s"} could not reach
        the limit
      </h3>
      <ul className="mt-3 space-y-3">
        {outcomes.map((o) => (
          <li key={o.id} className="text-sm">
            <span className="font-medium">{o.name}</span>
            <p className="mt-0.5 leading-relaxed text-ink-soft">{o.shortfall}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RasterWarning({ count }: { count: number }) {
  return (
    <section className="rounded-[12px] border border-edge bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <TextAa size={17} weight="regular" aria-hidden />
        {count} file{count === 1 ? " was" : "s were"} converted to images
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        Getting under the limit needed the pages turned into pictures. They look
        the same, but the text inside can no longer be selected or searched.
      </p>
    </section>
  );
}

function SingleFiles({ outcomes }: { outcomes: readonly FileOutcome[] }) {
  if (outcomes.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-[12px] border border-edge bg-surface">
      <ul className="divide-y divide-edge">
        {outcomes.map((o) => (
          <li key={o.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 truncate text-sm">{o.name}</span>
            <span className="tabular shrink-0 text-sm font-medium text-fits">
              {formatBytes(o.size)}
            </span>
            <button
              type="button"
              onClick={() =>
                downloadFile({ name: o.name, bytes: new Uint8Array(o.bytes) })
              }
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[12px] border border-edge px-3 text-sm font-medium transition-colors duration-150 hover:border-accent hover:text-accent"
            >
              <DownloadSimple size={15} weight="bold" aria-hidden />
              Save
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The batches, as they will actually be sent.
 *
 * Each part shows what the mail server will weigh, not the sum of the file sizes.
 * That difference is the reason a "4.7 MB" email bounces off a 5 MB limit, and
 * showing the real number is how somebody comes to trust the plan.
 */
function MailBatches({
  outcomes,
  preset,
}: {
  outcomes: readonly FileOutcome[];
  preset: Preset;
}) {
  const [zip, setZip] = useState(false);
  const budget = useMotionBudget();

  const { batches, oversized } = useMemo(() => {
    const items: PackItem[] = outcomes.map((o) => ({
      id: o.id,
      name: o.name,
      size: o.size,
    }));
    return planBatches(items, { cap: preset.bytes, zip });
  }, [outcomes, preset.bytes, zip]);

  const bytesFor = (id: string): Uint8Array => {
    const found = outcomes.find((o) => o.id === id);
    return new Uint8Array(found?.bytes ?? new ArrayBuffer(0));
  };

  const filesForBatch = (index: number): DeliverableFile[] => {
    const batch = batches[index];
    const loose = batch.items.map((item) => ({
      name: item.name,
      bytes: bytesFor(item.id),
    }));
    if (!zip) return loose;
    return [
      {
        name: batchFileName(batch, batches.length, "zip"),
        bytes: zipBatch(loose),
      },
    ];
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight">
          {batches.length} email{batches.length === 1 ? "" : "s"} to send
        </h3>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={zip}
            onChange={(e) => setZip(e.target.checked)}
            className="size-4 accent-accent"
          />
          Bundle each as a ZIP
        </label>
      </header>

      {zip && (
        <p className="rounded-[12px] border border-edge bg-surface p-3 text-sm leading-relaxed text-ink-soft">
          Worth knowing: a lot of company and government mail systems reject ZIP
          attachments outright. Loose files get through more often.
        </p>
      )}

      {oversized.length > 0 && (
        <p className="rounded-[12px] border border-wont/40 bg-wont/5 p-3 text-sm">
          {oversized.length} file{oversized.length === 1 ? "" : "s"} still too
          large to send even alone. Try a smaller limit, or split the document.
        </p>
      )}

      <ul className="space-y-3">
        {batches.map((batch, i) => (
          <motion.li
            key={batch.index}
            // Three emails arriving one after another reads as three things.
            // A block appearing at once reads as one.
            initial={budget === "reduced" ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.35,
              delay: budget === "reduced" ? 0 : i * 0.06,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="rounded-[12px] border border-edge bg-surface p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                Part {String(batch.index).padStart(2, "0")} of{" "}
                {String(batches.length).padStart(2, "0")}
              </span>
              <span className="tabular text-sm text-ink-soft">
                {batch.items.length} file
                {batch.items.length === 1 ? "" : "s"} ·{" "}
                <span className="font-medium text-fits">
                  {formatBytes(batch.encodedBytes)} on the wire
                </span>
              </span>
            </div>

            <BatchContents names={batch.items.map((i) => i.name)} />

            <BatchActions
              files={filesForBatch(i)}
              label={`Part ${batch.index} of ${batches.length}`}
            />
          </motion.li>
        ))}
      </ul>

      {batches.length > 0 && (
        <button
          type="button"
          onClick={() =>
            downloadFile({
              name: "what-is-in-each-part.txt",
              bytes: new TextEncoder().encode(buildManifest(batches)),
            })
          }
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-ink-soft transition-colors duration-150 hover:text-accent"
        >
          <ArrowSquareOut size={15} weight="regular" aria-hidden />
          Save a list of what is in each part
        </button>
      )}
    </section>
  );
}

/**
 * What is in a batch, without printing twenty-one filenames.
 *
 * A batch of 21 files listed in full makes a card taller than a phone screen, and
 * somebody checking three batches has to scroll past sixty names to do it. The count
 * is the thing they are actually verifying; the names matter only when something
 * looks wrong, so they are one tap away rather than always on.
 */
function BatchContents({ names }: { names: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? names : names.slice(0, 4);
  const hidden = names.length - shown.length;

  return (
    <div className="mt-2">
      <ul className="space-y-0.5 text-sm text-ink-soft">
        {shown.map((name) => (
          <li key={name} className="truncate">
            {name}
          </li>
        ))}
      </ul>
      {(hidden > 0 || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-accent transition-opacity duration-150 hover:opacity-80"
        >
          {open ? "Show fewer" : `and ${hidden} more`}
        </button>
      )}
    </div>
  );
}

/**
 * Save or share one batch.
 *
 * Share is offered first where the device supports it. On a phone it is the only
 * route that gets an attachment into a mail app without uploading it somewhere
 * first, which is the whole point.
 */
function BatchActions({
  files,
  label,
}: {
  files: DeliverableFile[];
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const shareable = canShareFiles(files);

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {shareable && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await shareFiles(files, label);
            if (!ok) await downloadAll(files);
            setBusy(false);
          }}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] bg-accent px-4 text-sm font-medium text-accent-ink transition-transform duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          <ShareNetwork size={15} weight="bold" aria-hidden />
          Share
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await downloadAll(files);
          setBusy(false);
        }}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] border border-edge px-4 text-sm font-medium transition-colors duration-150 hover:border-accent hover:text-accent disabled:opacity-50"
      >
        <DownloadSimple size={15} weight="bold" aria-hidden />
        {busy
          ? "Saving…"
          : `Save ${files.length} file${files.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
