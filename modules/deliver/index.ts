import { zipSync } from "fflate";
import type { Batch } from "@/modules/pack";

/**
 * Getting the finished files off the device.
 *
 * Nothing here uploads anything. Every path is local: a download, or a handover to
 * whatever the operating system's own share sheet offers. That is the whole of
 * delivery for now, and it is deliberately the whole of it — sending on the user's
 * behalf means their documents reaching a server, which is a promise to break
 * carefully and visibly rather than by default.
 */

export interface DeliverableFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Bundle a batch into a single ZIP.
 *
 * Stored, not deflated. The contents are PDFs and JPEGs, which are already
 * compressed — deflating them again burns seconds of phone battery to save
 * approximately nothing, and it is also what the packer's size arithmetic assumes.
 */
export function zipBatch(files: readonly DeliverableFile[]): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const file of files) {
    entries[uniqueName(entries, file.name)] = [file.bytes, { level: 0 }];
  }
  return zipSync(entries, { level: 0 });
}

/**
 * The name a batch's parts should carry.
 *
 * Numbered "01 of 04" rather than "part1", because the recipient's question is never
 * "which one is this" — it is "do I have all of them". The count belongs in every
 * filename so a glance at the attachment list answers it.
 */
export function batchFileName(
  batch: Batch,
  total: number,
  extension: string,
): string {
  const width = Math.max(2, String(total).length);
  const index = String(batch.index).padStart(width, "0");
  const of = String(total).padStart(width, "0");
  return `${index} of ${of}.${extension}`;
}

/**
 * A plain-text list of what is in each message.
 *
 * Included with the first batch so the recipient can check the set is complete
 * without opening anything. The anxiety this product exists to remove is not "is it
 * compressed" — it is "did all forty-two of them arrive".
 */
export function buildManifest(batches: readonly Batch[]): string {
  const total = batches.length;
  const fileCount = batches.reduce((n, b) => n + b.items.length, 0);

  const lines: string[] = [
    `${fileCount} file(s), sent in ${total} part(s).`,
    "",
  ];

  for (const batch of batches) {
    lines.push(
      `Part ${String(batch.index).padStart(2, "0")} of ${String(total).padStart(2, "0")}`,
    );
    for (const item of batch.items) lines.push(`    ${item.name}`);
    lines.push("");
  }

  lines.push("Each part is complete on its own — nothing needs reassembling.");
  return lines.join("\n");
}

/**
 * Save a file to the user's device.
 *
 * Revoking the object URL on the next frame rather than immediately: Safari has not
 * finished reading it when the click returns, and revoking too early produces a
 * download that silently does nothing.
 */
export function downloadFile(file: DeliverableFile): void {
  const url = URL.createObjectURL(
    new Blob([toArrayBuffer(file.bytes)], { type: mimeFor(file.name) }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * Save several files.
 *
 * Browsers throttle or silently drop rapid consecutive downloads, so these are
 * spaced out. It is slower than firing them all at once, and unlike firing them all
 * at once it actually delivers every file.
 */
export async function downloadAll(
  files: readonly DeliverableFile[],
  gapMs = 350,
): Promise<void> {
  for (const [i, file] of files.entries()) {
    downloadFile(file);
    if (i < files.length - 1) await delay(gapMs);
  }
}

/** Whether this device can hand files to its own share sheet. */
export function canShareFiles(files: readonly DeliverableFile[]): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  return navigator.canShare({ files: files.map(toWebFile) });
}

/**
 * The same question, asked by name instead of by content.
 *
 * `navigator.canShare` decides on the count and the types, never the bytes. Asking
 * it with the real files means building a `File` per attachment, and a `Blob`
 * copies — so a render of three batches holding 40 MB copied 40 MB to find out
 * whether a button should be visible, every single render. Empty probes answer the
 * identical question for nothing.
 */
export function canShareNames(names: readonly string[]): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({
      files: names.map(
        (name) => new File([new Uint8Array(0)], name, { type: mimeFor(name) }),
      ),
    });
  } catch {
    return false;
  }
}

/**
 * Hand the files to the operating system's share sheet — Mail, Gmail, WhatsApp,
 * Drive, whatever the user actually has.
 *
 * This is the good path on a phone, and it is the only way to get an attachment
 * into a mail app without uploading it somewhere first. Returns false when the
 * device cannot do it, so the caller can fall back to a download rather than
 * leaving the user with nothing.
 */
export async function shareFiles(
  files: readonly DeliverableFile[],
  title: string,
): Promise<boolean> {
  if (!canShareFiles(files)) return false;
  try {
    await navigator.share({ files: files.map(toWebFile), title });
    return true;
  } catch (err) {
    // The user closing the share sheet is not a failure worth reporting.
    if ((err as Error)?.name === "AbortError") return true;
    return false;
  }
}

function toWebFile(file: DeliverableFile): File {
  return new File([toArrayBuffer(file.bytes)], file.name, {
    type: mimeFor(file.name),
  });
}

function mimeFor(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "zip":
      return "application/zip";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function uniqueName(taken: Record<string, unknown>, name: string): string {
  if (!(name in taken)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  while (`${stem} (${n})${ext}` in taken) n++;
  return `${stem} (${n})${ext}`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
