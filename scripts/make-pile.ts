/**
 * The pile: ~42 mixed files at ~37.6 MB, the case that started the project.
 *
 * Generated on demand rather than committed. The corpus in tests/fixtures/ is small
 * and versioned because each file pins a specific behaviour; 37 MB of generated
 * binaries to satisfy one scenario is not worth carrying in git history forever.
 * Gitignored, and rebuilt automatically by the browser suite when missing.
 *
 * The mix matters as much as the total. A real folder of paperwork is a few heavy
 * scans, a lot of phone photos, and a scattering of small documents — not 42 copies
 * of the same thing, which would make the batching look far tidier than it is.
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import sharp from "sharp";

const OUT = join(process.cwd(), "tests", "fixtures", "pile");

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function clamp(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

async function photo(width: number, height: number, seed: number): Promise<Uint8Array> {
  const rand = seeded(seed);
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels;
      const light = 55 + (185 * (x + y)) / (width + height);
      const subject =
        x > width * 0.15 && x < width * 0.85 && y > height * 0.2 && y < height * 0.8;
      const base = subject ? light * 1.3 : light * 0.65;
      const grain = (rand() - 0.5) * 28;
      data[o] = clamp(base + grain);
      data[o + 1] = clamp(base * 0.95 + grain);
      data[o + 2] = clamp(base * 0.87 + grain);
    }
  }
  const out = await sharp(data, { raw: { width, height, channels } })
    .jpeg({ quality: 90 })
    .toBuffer();
  return new Uint8Array(out);
}

async function scanPage(width: number, seed: number): Promise<Uint8Array> {
  const rand = seeded(seed);
  const height = Math.round(width * (842 / 595));
  const channels = 3;
  const data = Buffer.alloc(width * height * channels, 0xf3);
  for (let i = 0; i < data.length; i++) {
    data[i] = clamp(data[i] + Math.round((rand() - 0.5) * 16));
  }
  const marginX = Math.round(width * 0.12);
  const lineHeight = Math.round(height / 44);
  for (let line = 0; line < 36; line++) {
    const top = Math.round(height * 0.08) + line * lineHeight;
    const thickness = Math.max(2, Math.round(lineHeight * 0.3));
    const lineWidth = Math.round((width - marginX * 2) * (0.4 + rand() * 0.6));
    for (let y = top; y < top + thickness && y < height; y++) {
      for (let x = marginX; x < marginX + lineWidth && x < width; x++) {
        const o = (y * width + x) * channels;
        const ink = 38 + Math.round(rand() * 34);
        data[o] = ink;
        data[o + 1] = ink;
        data[o + 2] = ink;
      }
    }
  }
  const out = await sharp(data, { raw: { width, height, channels } })
    .jpeg({ quality: 90 })
    .toBuffer();
  return new Uint8Array(out);
}

async function scanPdf(pages: number, width: number, seed: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let p = 0; p < pages; p++) {
    const image = await doc.embedJpg(await scanPage(width, seed + p));
    const page = doc.addPage([595, 842]);
    page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  }
  return doc.save({ useObjectStreams: true });
}

async function textPdf(pages: number, seed: number): Promise<Uint8Array> {
  const rand = seeded(seed);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([595, 842]);
    for (let line = 0; line < 38; line++) {
      const words = Math.round(5 + rand() * 9);
      const text = Array.from({ length: words }, () =>
        "abcdefghijklmnopqrstuvwxyz".slice(0, 3 + Math.round(rand() * 7)),
      ).join(" ");
      page.drawText(text, { x: 64, y: 780 - line * 18, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
    }
  }
  return doc.save({ useObjectStreams: true });
}

/** Already built and roughly the right size? Leave it alone; it takes a while. */
export function pileExists(): boolean {
  if (!existsSync(OUT)) return false;
  return readdirSync(OUT).length >= 40;
}

export async function buildPile(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  let total = 0;
  let n = 0;

  const write = async (name: string, bytes: Uint8Array) => {
    writeFileSync(join(OUT, name), bytes);
    total += bytes.length;
    n += 1;
  };

  // Four heavy multi-page scans — the bank statements and certificates.
  for (let i = 0; i < 4; i++) {
    await write(`Statement-${i + 1}.pdf`, await scanPdf(3, 1700, 100 + i * 10));
  }
  // Eight single-page scans — Aadhaar, PAN, marksheets.
  for (let i = 0; i < 8; i++) {
    await write(`Document-${i + 1}.pdf`, await scanPdf(1, 1700, 300 + i * 7));
  }
  // Twenty phone photos — by far the commonest thing in a real folder.
  for (let i = 0; i < 20; i++) {
    const wide = i % 3 === 0;
    await write(
      `Photo-${String(i + 1).padStart(2, "0")}.jpg`,
      await photo(wide ? 2600 : 2100, wide ? 1950 : 1575, 500 + i * 13),
    );
  }
  // Ten small text documents — forms, letters, receipts.
  for (let i = 0; i < 10; i++) {
    await write(`Form-${String(i + 1).padStart(2, "0")}.pdf`, await textPdf(2 + (i % 4), 900 + i));
  }

  console.log(`pile: ${n} files, ${(total / 1_000_000).toFixed(1)} MB -> ${OUT}`);
}

if (process.argv[1]?.endsWith("make-pile.ts")) {
  buildPile().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
