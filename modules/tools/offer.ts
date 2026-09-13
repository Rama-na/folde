import { formatBytes } from "@/lib/bytes";
import type { FileKind } from "@/lib/file-type";

/**
 * Which tools are worth showing, given what the person actually dropped.
 *
 * This is the whole information architecture in one pure function, and it is the
 * reason this does not become a wall of twenty-four identical tiles.
 *
 * Every competitor in this category asks you to pick a tool and *then* upload. That
 * ordering is why their front pages look the way they do: with no files in hand, the
 * only honest thing to show is everything. Turn it around — files first — and most
 * of the menu answers itself. Six PDFs can obviously be merged. One page cannot be
 * split. A folder of photographs is not going to be unlocked.
 *
 * So nothing here is hidden behind cleverness; it is hidden behind not applying.
 * A tool that cannot do anything with these files is not a tool this person needs to
 * read past.
 */

export type ToolId =
  | "fit"
  | "merge"
  | "organise"
  | "extract"
  | "to-images"
  | "from-images"
  | "protect"
  | "unlock";

/** What we know about one dropped file. Nothing here does IO; the caller measured. */
export interface AnalysedFile {
  id: string;
  name: string;
  size: number;
  kind: FileKind;
  /** PDFs only, and only when it opened. */
  pages?: number;
  /** PDFs only. True when it will ask for a password before it opens. */
  locked?: boolean;
}

export interface Offer {
  id: ToolId;
  /** Shown on the button. */
  label: string;
  /** One line under it, saying what will happen to *these* files. */
  detail: string;
}

/**
 * The offers, best first.
 *
 * "Fit a size limit" is always first and always present. It is the job people came
 * here for, it is the only one that works on every kind of file, and burying it
 * under a row of conversions to look like a fuller product would be trading the
 * one thing this does better than anyone for the eleven things it does the same.
 */
export function offeredTools(files: readonly AnalysedFile[]): Offer[] {
  if (files.length === 0) return [];

  const pdfs = files.filter((f) => f.kind === "pdf");
  const images = files.filter(
    (f) => f.kind === "jpeg" || f.kind === "png" || f.kind === "heic",
  );
  const locked = pdfs.filter((f) => f.locked);
  const readable = pdfs.filter((f) => !f.locked);
  const pageTotal = readable.reduce((n, f) => n + (f.pages ?? 0), 0);

  const offers: Offer[] = [];

  // A locked file is the only thing that jumps the queue, because until it is
  // unlocked nothing else on this list can touch it.
  if (locked.length > 0) {
    offers.push({
      id: "unlock",
      label: "Unlock",
      detail:
        locked.length === 1
          ? `${locked[0].name} needs a password before anything can read it.`
          : `${locked.length} of these need a password before anything can read them.`,
    });
  }

  offers.push({
    id: "fit",
    label: "Fit a size limit",
    detail: sentenceFor(files),
  });

  if (readable.length >= 2) {
    offers.push({
      id: "merge",
      label: "Merge into one PDF",
      detail: `${readable.length} documents, ${pageTotal} pages, in the order below.`,
    });
  }

  if (readable.length === 1 && (readable[0].pages ?? 0) > 1) {
    const pages = readable[0].pages ?? 0;
    offers.push({
      id: "organise",
      label: "Reorder, rotate or delete pages",
      detail: `${pages} pages to rearrange.`,
    });
    offers.push({
      id: "extract",
      label: "Take out some pages",
      detail: `Keep a range — 1-3, 7 — as its own PDF.`,
    });
  }

  if (readable.length >= 1) {
    offers.push({
      id: "to-images",
      label: "Turn pages into images",
      detail:
        pageTotal > 0
          ? `${pageTotal} JPEGs, one per page.`
          : "One JPEG per page.",
    });
    offers.push({
      id: "protect",
      label: "Add a password",
      detail:
        readable.length === 1
          ? "Nobody opens it without the password — including you."
          : `Lock ${readable.length} documents with the same password.`,
    });
  }

  if (images.length >= 1) {
    offers.push({
      id: "from-images",
      label: images.length === 1 ? "Make it a PDF" : "Make one PDF",
      detail:
        images.length === 1
          ? "One A4 page, centred, nothing cropped."
          : `${images.length} photos, one per page, in the order below.`,
    });
  }

  return offers;
}

/**
 * What fitting a limit would do to *this* pile, said before it is asked for.
 *
 * The generic version of this sentence is "compress your files", which tells
 * somebody holding a deadline nothing they did not already know.
 */
function sentenceFor(files: readonly AnalysedFile[]): string {
  // `formatBytes`, not arithmetic of its own. It truncates rather than rounding,
  // which is what keeps a size from ever reading larger than the file is.
  const size = formatBytes(files.reduce((n, f) => n + f.size, 0));

  if (files.length === 1) {
    return `Bring ${size} under a portal limit, or an email cap.`;
  }
  return `Bring ${files.length} files, ${size}, under a portal limit or an email cap.`;
}
