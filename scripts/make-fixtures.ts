/**
 * Build the test corpus.
 *
 * The fixtures are committed, but generated rather than hand-collected: real
 * paperwork cannot go in a public repo, and a corpus built from a seeded generator
 * is reproducible, diffable and safe. Run `npm run fixtures` to rebuild.
 *
 * Each fixture exists to pin a specific behaviour of the ladder — see the comment
 * on each one. Adding a fixture without a reason to exist is how a test suite stops
 * meaning anything.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

const OUT = join(process.cwd(), "tests", "fixtures");

/** Deterministic PRNG, so a rebuilt corpus is byte-identical. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * A page that looks like a scanned document: off-white paper, dark text lines of
 * varying length, a little sensor noise. This compresses the way a real flatbed
 * scan does, which pure random noise emphatically does not.
 */
async function scanLikeJpeg(
  width: number,
  height: number,
  seed: number,
  quality: number,
): Promise<Uint8Array> {
  const rand = seeded(seed);
  const channels = 3;
  const data = Buffer.alloc(width * height * channels, 0xf4);

  // Sensor noise across the whole sheet.
  for (let i = 0; i < data.length; i++) {
    data[i] = clamp(data[i] + Math.round((rand() - 0.5) * 14));
  }

  const marginX = Math.round(width * 0.12);
  const lineHeight = Math.round(height / 46);
  for (let line = 0; line < 38; line++) {
    const top = Math.round(height * 0.08) + line * lineHeight;
    const thickness = Math.max(2, Math.round(lineHeight * 0.32));
    const lineWidth = Math.round(
      (width - marginX * 2) * (0.45 + rand() * 0.55),
    );
    for (let y = top; y < top + thickness && y < height; y++) {
      for (let x = marginX; x < marginX + lineWidth && x < width; x++) {
        const o = (y * width + x) * channels;
        const ink = 40 + Math.round(rand() * 30);
        data[o] = ink;
        data[o + 1] = ink;
        data[o + 2] = ink;
      }
    }
  }

  const out = await sharp(data, { raw: { width, height, channels } })
    .jpeg({ quality })
    .toBuffer();
  return new Uint8Array(out);
}

function clamp(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

async function textPdf(pages: number, seed: number): Promise<Uint8Array> {
  const rand = seeded(seed);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([595, 842]);
    for (let line = 0; line < 40; line++) {
      const words = Math.round(6 + rand() * 8);
      const text = Array.from({ length: words }, () =>
        "abcdefghijklmnopqrstuvwxyz".slice(0, 3 + Math.round(rand() * 7)),
      ).join(" ");
      page.drawText(text, {
        x: 64,
        y: 780 - line * 18,
        size: 11,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
  }
  return doc.save({ useObjectStreams: true });
}

/** A PDF whose pages are each one full-page JPEG, the shape of every scan. */
async function scanPdf(
  pages: number,
  pixelWidth: number,
  seed: number,
  quality = 92,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pixelHeight = Math.round(pixelWidth * (842 / 595));

  for (let p = 0; p < pages; p++) {
    const jpeg = await scanLikeJpeg(pixelWidth, pixelHeight, seed + p, quality);
    const image = await doc.embedJpg(jpeg);
    const page = doc.addPage([595, 842]);
    page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  }
  return doc.save({ useObjectStreams: true });
}

/**
 * A PDF whose image is Flate-encoded rather than JPEG. Rung 2 deliberately skips
 * these, so this fixture is what proves the ladder refuses honestly (or rasterizes)
 * instead of silently reporting success it did not achieve.
 */
async function flateImagePdf(seed: number): Promise<Uint8Array> {
  const width = 1400;
  const height = 1980;
  const jpeg = await scanLikeJpeg(width, height, seed, 92);
  const png = await sharp(Buffer.from(jpeg)).png({ compressionLevel: 6 }).toBuffer();

  const doc = await PDFDocument.create();
  const image = await doc.embedPng(new Uint8Array(png));
  const page = doc.addPage([595, 842]);
  page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  return doc.save({ useObjectStreams: true });
}

/**
 * A photograph, the way a phone camera produces one: smooth gradients, a subject
 * with edges, and sensor grain. Flat colour would compress to nothing and prove
 * the image ladder works when it does not.
 */
async function phonePhoto(
  width: number,
  height: number,
  seed: number,
): Promise<Uint8Array> {
  const rand = seeded(seed);
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels;
      // A diagonal gradient standing in for lighting across the frame.
      const light = 60 + (180 * (x + y)) / (width + height);
      // A rectangular subject, the way a held-up document fills a photo.
      const inSubject =
        x > width * 0.18 &&
        x < width * 0.82 &&
        y > height * 0.22 &&
        y < height * 0.78;
      const base = inSubject ? light * 1.25 : light * 0.7;
      const grain = (rand() - 0.5) * 26;
      data[o] = clamp(base + grain);
      data[o + 1] = clamp(base * 0.96 + grain);
      data[o + 2] = clamp(base * 0.88 + grain);
    }
  }

  const out = await sharp(data, { raw: { width, height, channels } })
    .jpeg({ quality: 94 })
    .toBuffer();
  return new Uint8Array(out);
}

/** A signature: mostly white, a few dark strokes. PNG, as forms usually want. */
async function signaturePng(seed: number): Promise<Uint8Array> {
  const rand = seeded(seed);
  const width = 1200;
  const height = 400;
  const channels = 3;
  const data = Buffer.alloc(width * height * channels, 0xff);

  let x = 80;
  let y = height / 2;
  for (let step = 0; step < 5200; step++) {
    x += 1.2 + rand() * 0.9;
    y += (rand() - 0.5) * 26;
    if (x >= width - 40) break;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const px = Math.round(x + dx);
        const py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const o = (py * width + px) * channels;
        data[o] = 20;
        data[o + 1] = 24;
        data[o + 2] = 40;
      }
    }
  }

  const out = await sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 6 })
    .toBuffer();
  return new Uint8Array(out);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const write = (name: string, bytes: Uint8Array): void => {
    writeFileSync(join(OUT, name), bytes);
    const kb = (bytes.length / 1000).toFixed(1);
    console.log(`  ${name.padEnd(24)} ${kb.padStart(9)} KB`);
  };

  console.log("Building fixtures:");

  // Already small. Pins rung 0: must come back byte-identical, never re-encoded.
  write("tiny.pdf", await textPdf(1, 11));

  // Text only. Rung 1 is all that can help; there are no images to downsample.
  write("text.pdf", await textPdf(6, 22));

  // Many pages of text. Pins that the ladder stays responsive on a long document.
  write("many-pages.pdf", await textPdf(120, 33));

  // The core case: a 300 DPI scan, the shape of nearly every real upload.
  write("scan-300dpi.pdf", await scanPdf(3, 2480, 44));

  // A heavier multi-page scan, for the email-batching path.
  write("scan-heavy.pdf", await scanPdf(8, 2480, 55));

  // Flate-encoded image: rung 2 must skip it rather than corrupt it.
  write("flate-image.pdf", await flateImagePdf(66));

  // A phone photo of a document, the commonest thing anyone uploads to a portal.
  // 12 megapixel-ish, the way a mid-range Android camera writes it.
  write("photo.jpg", await phonePhoto(4032, 3024, 77));

  // A smaller one, for the case that is already near the limit.
  write("photo-small.jpg", await phonePhoto(1600, 1200, 88));

  // A PNG signature. Pins that PNG comes back as JPEG with a changed name.
  write("signature.png", await signaturePng(99));

  // Not a PDF at all. Pins that a damaged file gets a sentence, not a stack trace.
  write("corrupt.pdf", new Uint8Array(Buffer.from("%PDF-1.7\nnot actually a pdf")));

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
