"use client";

import { useMemo, useState } from "react";
import { formatBytes } from "@/lib/bytes";
import type { Preset } from "@/lib/presets";
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
 * Everything shown here is measured. A size on this screen is the length of bytes
 * we are holding, not a projection.
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

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-edge bg-surface p-4">
        <p className="text-sm text-ink-soft">
          {outcomes.length} file{outcomes.length === 1 ? "" : "s"}
        </p>
        <p className="tabular mt-1 text-2xl font-semibold">
          {formatBytes(saved.before)} → {formatBytes(saved.after)}
        </p>
        {saved.before > saved.after && (
          <p className="mt-1 text-sm text-fits">
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
 * Given their own block, at the top, in the colour that means "this needs you".
 * The one thing this product must never do is bury a failure under a success.
 */
function Refusals({ outcomes }: { outcomes: readonly FileOutcome[] }) {
  return (
    <section className="rounded-[10px] border border-wont/40 bg-wont/5 p-4">
      <h3 className="text-sm font-semibold text-wont">
        {outcomes.length} file{outcomes.length === 1 ? "" : "s"} could not reach
        the limit
      </h3>
      <ul className="mt-2 space-y-2">
        {outcomes.map((o) => (
          <li key={o.id} className="text-sm">
            <span className="font-medium">{o.name}</span>
            <p className="mt-0.5 text-ink-soft">{o.shortfall}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RasterWarning({ count }: { count: number }) {
  return (
    <section className="rounded-[10px] border border-edge bg-surface p-4">
      <h3 className="text-sm font-semibold">
        {count} file{count === 1 ? " was" : "s were"} converted to images
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        Getting under the limit needed the pages turned into pictures. They look
        the same, but the text inside can no longer be selected or searched.
      </p>
    </section>
  );
}

function SingleFiles({ outcomes }: { outcomes: readonly FileOutcome[] }) {
  if (outcomes.length === 0) return null;
  return (
    <section className="rounded-[10px] border border-edge bg-surface">
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
              className="min-h-[44px] shrink-0 rounded-[10px] border border-edge px-3 text-sm font-medium hover:border-ink-soft"
            >
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
 * Each part shows what the mail server will weigh, not the sum of the file sizes —
 * that difference is the reason a "4.7 MB" email bounces off a 5 MB limit, and
 * showing the real number is how the user learns to trust the plan.
 */
function MailBatches({
  outcomes,
  preset,
}: {
  outcomes: readonly FileOutcome[];
  preset: Preset;
}) {
  const [zip, setZip] = useState(false);

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
        <h3 className="font-semibold">
          {batches.length} email{batches.length === 1 ? "" : "s"} to send
        </h3>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={zip}
            onChange={(e) => setZip(e.target.checked)}
            className="size-4"
          />
          Bundle each as a ZIP
        </label>
      </header>

      {zip && (
        <p className="rounded-[10px] border border-edge bg-surface p-3 text-sm text-ink-soft">
          Worth knowing: a lot of company and government mail systems reject ZIP
          attachments outright. Loose files get through more often.
        </p>
      )}

      {oversized.length > 0 && (
        <p className="rounded-[10px] border border-wont/40 bg-wont/5 p-3 text-sm">
          {oversized.length} file{oversized.length === 1 ? "" : "s"} still too
          large to send even alone. Try a smaller limit, or split the document.
        </p>
      )}

      <ul className="space-y-3">
        {batches.map((batch, i) => (
          <li
            key={batch.index}
            className="rounded-[10px] border border-edge bg-surface p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                Part {String(batch.index).padStart(2, "0")} of{" "}
                {String(batches.length).padStart(2, "0")}
              </span>
              <span className="tabular text-sm text-ink-soft">
                {batch.items.length} file
                {batch.items.length === 1 ? "" : "s"} ·{" "}
                <span className="text-fits">
                  {formatBytes(batch.encodedBytes)} on the wire
                </span>
              </span>
            </div>

            <ul className="mt-2 space-y-0.5 text-sm text-ink-soft">
              {batch.items.map((item) => (
                <li key={item.id} className="truncate">
                  {item.name}
                </li>
              ))}
            </ul>

            <BatchActions
              files={filesForBatch(i)}
              label={`Part ${batch.index} of ${batches.length}`}
            />
          </li>
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
          className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          Save a list of what is in each part
        </button>
      )}
    </section>
  );
}

/**
 * Save or share one batch.
 *
 * Share is offered first where the device supports it: on a phone it is the only
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
    <div className="mt-3 flex flex-wrap gap-2">
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
          className="min-h-[44px] rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-50"
        >
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
        className="min-h-[44px] rounded-[10px] border border-edge px-4 text-sm font-medium hover:border-ink-soft disabled:opacity-50"
      >
        {busy ? "Saving…" : `Save ${files.length} file${files.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
