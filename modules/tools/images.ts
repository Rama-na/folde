import { PDFDocument } from "@cantoo/pdf-lib";
import { detectType } from "@/lib/file-type";
import type { RenderPages } from "@/modules/shrink/types";
import { produced, refused, type ToolResult } from "./types";

/**
 * A4 in PDF points, and the margin a printer will not eat.
 *
 * Photographs of documents are the input here almost every time — a rent agreement
 * shot on a phone, a marksheet, a signature on paper — and what they are wanted for
 * is a portal that asks for a PDF or a printer. Both want a page, not a canvas the
 * shape of somebody's camera sensor.
 */
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 28;

export interface ImageInput {
  name: string;
  bytes: Uint8Array;
}

export type PageFit =
  /** One A4 page per image, the image centred and scaled to fit inside a margin. */
  | "a4"
  /** The page is exactly the image. No margin, no rescaling, nothing added. */
  | "image";

/**
 * Photographs into a PDF, one per page, in the order given.
 *
 * Dispatches on each file's bytes rather than its name, like everything else here:
 * phones and scanner apps write `.jpg` onto PNG data often enough that trusting the
 * extension means telling somebody their perfectly good photograph is damaged.
 *
 * One bad image does not cost the rest.
 */
export async function imagesToPdf(
  inputs: readonly ImageInput[],
  fit: PageFit = "a4",
): Promise<ToolResult & { skipped?: { name: string; reason: string }[] }> {
  if (inputs.length === 0) return refused("There are no images here.");

  const out = await PDFDocument.create();
  const skipped: { name: string; reason: string }[] = [];

  for (const input of inputs) {
    const { kind } = detectType(input.bytes);
    if (kind !== "jpeg" && kind !== "png") {
      skipped.push({
        name: input.name,
        reason:
          kind === "heic"
            ? "This is an iPhone HEIC photo. Set Camera → Formats → Most Compatible, or shrink it here first to turn it into a JPEG."
            : "This is not a JPEG or a PNG.",
      });
      continue;
    }

    try {
      const image =
        kind === "jpeg"
          ? await out.embedJpg(input.bytes)
          : await out.embedPng(input.bytes);

      if (fit === "image") {
        const page = out.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
        continue;
      }

      const page = out.addPage([A4.width, A4.height]);
      const room = {
        width: A4.width - MARGIN * 2,
        height: A4.height - MARGIN * 2,
      };
      // Never enlarged past the paper, and never enlarged past its own pixels
      // either: blowing a 400px signature up to fill A4 makes it blurry and no more
      // legible, and the forms that ask for one have their own ideas about size.
      const scale = Math.min(
        room.width / image.width,
        room.height / image.height,
        1,
      );
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: (A4.width - width) / 2,
        y: (A4.height - height) / 2,
        width,
        height,
      });
    } catch {
      skipped.push({
        name: input.name,
        reason: "This image could not be read.",
      });
    }
  }

  if (out.getPageCount() === 0) {
    return {
      ...refused(
        skipped.length === 1
          ? skipped[0].reason
          : "None of these files could be read as images.",
      ),
      skipped,
    };
  }

  return {
    ...produced(await out.save({ useObjectStreams: true })),
    ...(skipped.length > 0 ? { skipped } : {}),
  };
}

export interface PageImage {
  name: string;
  bytes: Uint8Array;
  page: number;
  of: number;
}

/**
 * The other direction: every page of a PDF as its own JPEG.
 *
 * Takes the renderer as a capability rather than importing it, so everything above
 * this line stays testable under Node — the same arrangement rung 3 of the
 * compression ladder uses, and for the same reason.
 *
 * Pages are handed over as they are drawn rather than collected here. A 120-page
 * scan at 200 DPI is several hundred megabytes of JPEG, and a phone that has to hold
 * all of it at once is a phone that stops.
 */
export async function pdfToImages(
  source: Uint8Array,
  render: RenderPages,
  options: {
    dpi?: number;
    quality?: number;
    baseName: string;
    onImage: (image: PageImage) => void | Promise<void>;
    onStart?: (page: number, of: number) => void;
  },
  signal?: AbortSignal,
): Promise<{ ok: true; pages: number } | { ok: false; reason: string }> {
  let pages = 0;
  const stem = options.baseName.replace(/\.pdf$/i, "");

  try {
    await render(
      source,
      {
        // 150 DPI is the point where a scanned page stops looking like a screenshot
        // and starts looking like a page, without quadrupling the bytes for detail
        // nobody is going to look at.
        dpi: options.dpi ?? 150,
        quality: options.quality ?? 0.85,
        onStart: options.onStart,
      },
      async (rendered) => {
        pages += 1;
        await options.onImage({
          // Zero-padded so a folder of them sorts the way the document reads. Page
          // 10 sorting before page 2 is a small thing that makes a 40-page export
          // useless.
          name: `${stem} ${String(rendered.page).padStart(
            String(rendered.of).length,
            "0",
          )}.jpg`,
          bytes: rendered.bytes,
          page: rendered.page,
          of: rendered.of,
        });
      },
      signal,
    );
  } catch (err) {
    if (err instanceof Error && err.name === "Cancelled") throw err;
    return {
      ok: false,
      reason: "This PDF could not be opened for rendering — it may be damaged.",
    };
  }

  if (pages === 0) return { ok: false, reason: "This PDF has no pages." };
  return { ok: true, pages };
}
