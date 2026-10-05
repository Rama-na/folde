/**
 * The ladder, against the committed corpus.
 *
 * The contract under test is the product's central promise: when `ok` is true the
 * file really is under the target, measured from the bytes we are handing back; when
 * it is false we say so in words rather than quietly returning something too big.
 *
 * Rung 3 (rasterize) is not exercised here — it needs a PDF renderer and a canvas,
 * which live in the browser. Rungs 0-2 and the target search are the same code in
 * both environments, so this covers the logic; the browser path gets its own smoke
 * test. Runs here therefore pass `rasterizer: undefined` on purpose, which is also
 * how we verify the honest-refusal path.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "@cantoo/pdf-lib";
import { formatBytes, rawAttachmentBudget, KB, MB } from "../lib/bytes";
import { shrinkPdf } from "../modules/shrink";
import { nodeCodec } from "../modules/shrink/codec-node";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (!condition) {
    failures += 1;
    console.log(`     FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const fixtures = [
  "tiny.pdf",
  "text.pdf",
  "many-pages.pdf",
  "scan-300dpi.pdf",
  "scan-heavy.pdf",
  "flate-image.pdf",
  "corrupt.pdf",
];

const targets = [
  { label: "200 KB portal", bytes: 200 * KB },
  { label: "500 KB portal", bytes: 500 * KB },
  { label: "2 MB portal", bytes: 2 * MB },
  // A single attachment on a 5 MB mail cap, budgeted after base64 inflation.
  { label: "5 MB mail", bytes: rawAttachmentBudget(5 * MB, 1) },
];

async function pageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log(
    `\n${"fixture".padEnd(17)}${"target".padEnd(15)}${"rung".padEnd(13)}` +
      `${"result".padStart(11)}  fits  text  ms`,
  );
  console.log("-".repeat(78));

  for (const name of fixtures) {
    const source = new Uint8Array(readFileSync(join(FIXTURES, name)));
    const sourcePages = await pageCount(source);

    for (const target of targets) {
      const started = Date.now();
      const result = await shrinkPdf(source, target.bytes, {
        codec: nodeCodec,
        rasterizer: undefined,
      });
      const ms = Date.now() - started;

      console.log(
        `${name.padEnd(17)}${target.label.padEnd(15)}${result.rung.padEnd(13)}` +
          `${formatBytes(result.size).padStart(11)}  ` +
          `${result.ok ? " yes" : "  no"}  ` +
          `${result.textPreserved ? " yes" : "  no"}  ${ms}`,
      );

      const where = `${name} @ ${target.label}`;

      // The central promise. A reported size must be the real length of the real
      // bytes, and "ok" must mean it actually fits.
      check(
        `${where}: reported size matches the bytes returned`,
        result.size === result.bytes.length,
        `${result.size} vs ${result.bytes.length}`,
      );
      check(
        `${where}: ok implies under target`,
        !result.ok || result.size <= target.bytes,
        `${result.size} > ${target.bytes}`,
      );
      check(
        `${where}: failure is explained`,
        result.ok || (result.shortfall ?? "").length > 20,
        "shortfall missing or too terse to show a user",
      );

      // Rung 0 must hand back the original, untouched.
      if (result.rung === "passthrough" && result.ok) {
        check(
          `${where}: passthrough returns the original bytes`,
          result.bytes.length === source.length,
        );
      }

      // Anything we rewrote must still be a readable PDF with every page intact.
      // Dropping a page of someone's paperwork to hit a size target would be a far
      // worse bug than missing the target.
      if (sourcePages !== null && result.rung !== "passthrough") {
        const outPages = await pageCount(result.bytes);
        check(
          `${where}: output still opens as a PDF`,
          outPages !== null,
          "output could not be parsed",
        );
        check(
          `${where}: page count preserved`,
          outPages === sourcePages,
          `${outPages} vs ${sourcePages}`,
        );
      }

      // Without a rasterizer the ladder must never claim to have removed text.
      check(
        `${where}: no rasterizing without a rasterizer`,
        result.textPreserved,
        "textPreserved false but rung 3 was unavailable",
      );
    }
  }

  console.log("-".repeat(78));
  console.log("\nspecific behaviours");

  // A file already under the limit must come back byte-identical.
  {
    const tiny = new Uint8Array(readFileSync(join(FIXTURES, "tiny.pdf")));
    const result = await shrinkPdf(tiny, 200 * KB, { codec: nodeCodec });
    check(
      "an already-small file is never re-encoded",
      result.rung === "passthrough" &&
        Buffer.compare(Buffer.from(tiny), Buffer.from(result.bytes)) === 0,
      `rung was ${result.rung}`,
    );
    console.log(`  passthrough leaves ${formatBytes(result.size)} untouched`);
  }

  /*
   * What rung 3 is allowed to cost.
   *
   * The rasterizer is stubbed here rather than real — the point is not what it
   * renders, it is how many times the ladder asks. A probe at this rung costs one
   * render per page, and the ladder used to spend a flat four probes on every
   * document, so a 120-page statement cost four hundred and eighty renders to arrive
   * at a refusal. That is minutes on a phone, and it is why this test counts calls
   * rather than bytes.
   */
  {
    const counted = (pages: number) => {
      const seen = { probes: 0, renders: 0, reports: [] as number[] };
      const rasterizer = async (
        _source: Uint8Array,
        _dpi: number,
        _quality: number,
        _signal?: AbortSignal,
        onPage?: (page: number, of: number) => void,
      ) => {
        seen.probes += 1;
        // Stand in for a real render loop: one render per page, every page
        // announced, exactly as the browser rasterizer does it.
        for (let n = 1; n <= pages; n++) {
          seen.renders += 1;
          onPage?.(n, pages);
          seen.reports.push(n);
        }
        // Sized off the DPI the ladder asked for, which is the one input that falls
        // monotonically with effort. Tying it to `quality` does not work: quality
        // holds at its ceiling for the first half of the curve and only then
        // drops, so the harshest probe can come back larger than the gentlest.
        return new Uint8Array(Math.round(pages * _dpi * 22));
      };
      return { seen, rasterizer };
    };

    const long = new Uint8Array(readFileSync(join(FIXTURES, "many-pages.pdf")));
    const longRun = counted(120);
    await shrinkPdf(long, 40 * KB, {
      codec: nodeCodec,
      rasterizer: longRun.rasterizer,
    });
    check(
      "a 120-page document gets one rasterize pass, not four",
      longRun.seen.probes === 1,
      `${longRun.seen.probes} probes, ${longRun.seen.renders} page renders`,
    );
    console.log(
      `  many-pages.pdf: ${longRun.seen.probes} probe(s), ${longRun.seen.renders} page renders`,
    );

    const short = new Uint8Array(readFileSync(join(FIXTURES, "text.pdf")));
    const shortRun = counted(6);
    await shrinkPdf(short, 7 * KB, {
      codec: nodeCodec,
      rasterizer: shortRun.rasterizer,
    });
    check(
      "a short document still gets a real search, not one blunt pass",
      shortRun.seen.probes >= 2 && shortRun.seen.probes <= 4,
      `${shortRun.seen.probes} probes`,
    );
    console.log(
      `  text.pdf: ${shortRun.seen.probes} probe(s), ${shortRun.seen.renders} page renders`,
    );

    check(
      "neither spends more page renders than the budget allows",
      longRun.seen.renders <= 220 && shortRun.seen.renders <= 220,
      `${longRun.seen.renders} and ${shortRun.seen.renders}`,
    );
    check(
      "and every page is announced before it is rendered",
      longRun.seen.reports.length === longRun.seen.renders &&
        longRun.seen.reports[0] === 1 &&
        longRun.seen.reports.at(-1) === 120,
      `${longRun.seen.reports.length} reports`,
    );
  }

  /*
   * What rung 2 is allowed to cost.
   *
   * This is the rung that made somebody's phone look broken. A probe here re-encodes
   * every image in the document, and nothing counted them: a 20 MB forty-page scan
   * spent 469 megapixels and about half a minute of phone time arriving at an answer
   * that 71 megapixels reaches.
   *
   * Two separate faults, and this guards both. The first was a rounding error with a
   * bill attached — the "nothing to gain from a full-size re-encode" test asked for
   * `scale >= 1`, and a 300 DPI scan on A4 measures 300.0004 DPI, so every image in
   * every such document was re-encoded at 99.9987 per cent of its size to learn
   * nothing. The second was that the narrowing ignored the sizes it had already
   * measured and walked the interval by halves instead.
   */
  {
    const counted = async (name: string) => {
      const source = new Uint8Array(readFileSync(join(FIXTURES, name)));
      let megapixels = 0;
      const pointless: string[] = [];
      const codec = {
        async transcodeJpeg(bytes: Uint8Array, request: {
          width: number;
          height: number;
          quality: number;
          sourceType: string;
        }) {
          megapixels += (request.width * request.height) / 1e6;
          const natural = await nodeCodec.probeSize(bytes, request.sourceType);
          const scale = request.width / natural.width;
          if (scale >= 0.98 && request.quality >= 0.9) {
            pointless.push(`${request.width}px at q${request.quality}`);
          }
          return nodeCodec.transcodeJpeg(bytes, request);
        },
        probeSize: nodeCodec.probeSize,
      };
      const result = await shrinkPdf(source, rawAttachmentBudget(5 * MB, 1), {
        codec,
        rasterizer: undefined,
      });
      return { megapixels, pointless, result };
    };

    const scan = await counted("scan-300dpi.pdf");
    const heavy = await counted("scan-heavy.pdf");
    console.log(
      `  scan-300dpi ${scan.megapixels.toFixed(0)} MP, scan-heavy ${heavy.megapixels.toFixed(0)} MP re-encoded`,
    );

    // A re-encode at full size and full quality returns the file it was given. It is
    // the most expensive thing this rung can do and it is worth nothing.
    check(
      "no image is re-encoded at its own size and quality",
      scan.pointless.length === 0 && heavy.pointless.length === 0,
      [...scan.pointless, ...heavy.pointless].slice(0, 3).join(", "),
    );

    // Both were over 90 MP before the narrowing learned to read its own measurements.
    check(
      "finding the target costs a fraction of what it used to",
      scan.megapixels < 60 && heavy.megapixels < 90,
      `${scan.megapixels.toFixed(0)} and ${heavy.megapixels.toFixed(0)} MP`,
    );

    // Cheaper is only an improvement if it still lands close to the limit. Spending
    // half the budget would be a smaller file than asked for, which is quality
    // given away.
    const budget = rawAttachmentBudget(5 * MB, 1);
    check(
      "and still uses most of the limit it was given",
      scan.result.ok &&
        heavy.result.ok &&
        scan.result.size > budget * 0.85 &&
        heavy.result.size > budget * 0.85,
      `${Math.round((scan.result.size / budget) * 100)}% and ${Math.round((heavy.result.size / budget) * 100)}%`,
    );
  }

  // A damaged file gets a sentence, not a stack trace.
  {
    const corrupt = new Uint8Array(readFileSync(join(FIXTURES, "corrupt.pdf")));
    const result = await shrinkPdf(corrupt, 200 * KB, { codec: nodeCodec });
    check(
      "a damaged file is refused in plain language",
      !result.ok && /damaged|could not be opened/i.test(result.shortfall ?? ""),
      result.shortfall ?? "no shortfall given",
    );
    console.log(`  corrupt file says: "${result.shortfall}"`);
  }

  // The core real-world case: a 300 DPI scan down to the commonest portal limit,
  // with its text still selectable because only the images were touched.
  {
    const scan = new Uint8Array(readFileSync(join(FIXTURES, "scan-300dpi.pdf")));
    const result = await shrinkPdf(scan, 200 * KB, { codec: nodeCodec });
    check(
      "a 300 DPI scan reaches 200 KB by downsampling alone",
      result.ok && result.rung === "downsample",
      `ok=${result.ok} rung=${result.rung} size=${result.size}`,
    );
    const ratio = ((1 - result.size / scan.length) * 100).toFixed(1);
    console.log(
      `  scan-300dpi ${formatBytes(scan.length)} -> ${formatBytes(result.size)} (${ratio}% smaller)`,
    );
  }

  // Cancellation must actually stop the work.
  {
    const heavy = new Uint8Array(readFileSync(join(FIXTURES, "scan-heavy.pdf")));
    const controller = new AbortController();
    controller.abort();
    let cancelled = false;
    try {
      await shrinkPdf(
        heavy,
        200 * KB,
        { codec: nodeCodec },
        controller.signal,
      );
    } catch (err) {
      cancelled = (err as Error).name === "Cancelled";
    }
    check("an aborted signal cancels the work", cancelled);
    console.log("  abort stops the ladder");
  }

  console.log(
    failures === 0
      ? "\nAll shrink checks passed.\n"
      : `\n${failures} check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
