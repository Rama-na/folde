import { PDFDocument } from "@cantoo/pdf-lib";
import { open } from "./pages";
import { produced, refused, type ToolResult } from "./types";

export interface MergeInput {
  name: string;
  bytes: Uint8Array;
}

/**
 * Several PDFs into one, in the order given.
 *
 * The order is the caller's and is never sorted here. "Merge these four" almost
 * always means "in the order I have just spent a minute arranging them", and a tool
 * that quietly alphabetises a scanned contract has broken the document.
 *
 * One unreadable file does not cost the rest — the same rule the worker follows for
 * a batch. It is named, skipped, and reported, because a merge that silently drops
 * page 40 of 42 is the failure this whole product exists to make impossible.
 */
export async function mergePdfs(
  inputs: readonly MergeInput[],
): Promise<ToolResult & { skipped?: { name: string; reason: string }[] }> {
  if (inputs.length < 2) {
    return refused("Merging needs at least two PDFs.");
  }

  const out = await PDFDocument.create();
  const skipped: { name: string; reason: string }[] = [];
  let merged = 0;

  for (const input of inputs) {
    const opened = await open(input.bytes);
    if (!opened.ok) {
      skipped.push({ name: input.name, reason: opened.reason });
      continue;
    }
    const pages = await out.copyPages(opened.doc, opened.doc.getPageIndices());
    for (const page of pages) out.addPage(page);
    merged += 1;
  }

  if (merged === 0) {
    return {
      ...refused(
        skipped.length === 1
          ? skipped[0].reason
          : "None of these files could be opened as PDFs.",
      ),
      skipped,
    };
  }
  if (merged === 1) {
    return {
      ...refused(
        "Only one of these could be opened, so there is nothing to merge it with.",
      ),
      skipped,
    };
  }

  return {
    ...produced(await out.save({ useObjectStreams: true })),
    ...(skipped.length > 0 ? { skipped } : {}),
  };
}
