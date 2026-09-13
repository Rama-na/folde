/**
 * Dividing a document that cannot be sent whole.
 *
 * The assertions that matter are about completeness and independence, not about
 * compression. A divided document that quietly loses pages 40 to 55 is worse than
 * one that was never divided, because nobody finds out until the person on the other
 * end needs page 47 — so every page of the source has to appear in exactly one
 * piece, and every piece has to open on its own with no reference to the others.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { formatBytes, KB } from "../lib/bytes";
import { nodeCodec } from "../modules/shrink/codec-node";
import { pieceName, splitToFit, type SplitPiece } from "../modules/split";
import { Cancelled } from "../modules/shrink/types";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

const options = { codec: nodeCodec, rasterizer: undefined };

async function main(): Promise<void> {
  console.log("\nsplit: a 120-page document against a limit it cannot meet whole");
  {
    const source = fixture("many-pages.pdf");
    const target = 20 * KB;
    const result = await splitToFit(source, target, options);

    check("it divided rather than refusing", result.split, result.reason ?? "");
    console.log(
      `  ${formatBytes(source.length)} over ${result.pageCount} pages -> ` +
        `${result.pieces.length} pieces`,
    );
    for (const piece of result.pieces) {
      console.log(
        `    pages ${String(piece.fromPage).padStart(3)}-${String(piece.toPage).padEnd(3)} ` +
          `${formatBytes(piece.size).padStart(9)}  ${piece.ok ? "fits" : "over"}`,
      );
    }

    check("more than one piece came back", result.pieces.length > 1);

    // The whole point. Every piece is weighed, not predicted.
    check(
      "every piece is measured under the limit",
      result.pieces.every((p) => !p.ok || p.size <= target),
      result.pieces
        .filter((p) => p.ok && p.size > target)
        .map((p) => `${p.fromPage}-${p.toPage}=${p.size}`)
        .join(", "),
    );
    check(
      "and every piece reached it",
      result.pieces.every((p) => p.ok),
      result.pieces
        .filter((p) => !p.ok)
        .map((p) => `${p.fromPage}-${p.toPage}: ${p.shortfall}`)
        .join(" | "),
    );

    // Completeness: the ranges must tile 1..pageCount exactly. No gap, no overlap,
    // nothing dropped off either end.
    check("the pieces are in page order", inOrder(result.pieces));
    check(
      "the first piece starts at page 1",
      result.pieces[0]?.fromPage === 1,
      String(result.pieces[0]?.fromPage),
    );
    check(
      "the last piece ends at the last page",
      result.pieces.at(-1)?.toPage === result.pageCount,
      `${result.pieces.at(-1)?.toPage} vs ${result.pageCount}`,
    );
    check(
      "no page is skipped and no page is in two pieces",
      result.pieces.every(
        (piece, i) => i === 0 || piece.fromPage === result.pieces[i - 1].toPage + 1,
      ),
      result.pieces.map((p) => `${p.fromPage}-${p.toPage}`).join(" "),
    );

    // Independence. Not a volume in a set — a document.
    let opened = 0;
    let pagesFound = 0;
    for (const piece of result.pieces) {
      check(
        `pages ${piece.fromPage}-${piece.toPage} are a PDF`,
        new TextDecoder().decode(piece.bytes.subarray(0, 5)) === "%PDF-",
      );
      const doc = await PDFDocument.load(piece.bytes);
      opened += 1;
      pagesFound += doc.getPageCount();
      check(
        `and hold exactly the pages the name claims`,
        doc.getPageCount() === piece.toPage - piece.fromPage + 1,
        `${doc.getPageCount()} pages for ${piece.fromPage}-${piece.toPage}`,
      );
    }
    check("every piece opened on its own", opened === result.pieces.length);
    check(
      "and between them they hold every page of the original",
      pagesFound === result.pageCount,
      `${pagesFound} vs ${result.pageCount}`,
    );

    const names = result.pieces.map((p) => pieceName("Bank statement.pdf", p));
    console.log(`  named: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ", ..." : ""}`);
    check(
      "the names say which pages, not which volume",
      names.every((n) => /\(pages? [\d-]+\)\.pdf$/.test(n)),
      names.join(", "),
    );
    // The rule this feature exists closest to breaking.
    check(
      "and nothing is named like a split archive",
      names.every((n) => !/\.(zip|)\.?\d{3}$/.test(n) && !/part \d+ of \d+/i.test(n)),
      names.join(", "),
    );
  }

  console.log("\nsplit: a document that already fits needs no dividing");
  {
    // Not this module's job to check — the caller only reaches for it once the
    // ladder has already failed — but it must still behave sanely if asked.
    const source = fixture("text.pdf");
    const result = await splitToFit(source, 500 * KB, options);
    check(
      "one piece, whole document, untouched",
      result.split &&
        result.pieces.length === 1 &&
        result.pieces[0].ok &&
        result.pieces[0].fromPage === 1,
      `${result.pieces.length} pieces`,
    );
  }

  console.log("\nsplit: a single page cannot be divided, and says so");
  {
    const source = fixture("tiny.pdf");
    const result = await splitToFit(source, 1 * KB, options);
    check("it refuses rather than inventing a division", !result.split);
    check(
      "and explains why in words fit to show somebody",
      typeof result.reason === "string" && result.reason.length > 20,
      result.reason ?? "(none)",
    );
    console.log(`  says: "${result.reason}"`);
  }

  console.log("\nsplit: an unreadable file refuses honestly");
  {
    const result = await splitToFit(fixture("corrupt.pdf"), 10 * KB, options);
    check("no pieces, and a reason", !result.split && !!result.reason);
    console.log(`  says: "${result.reason}"`);
  }

  console.log("\nsplit: cancellation stops it");
  {
    const controller = new AbortController();
    controller.abort();
    let threw = false;
    try {
      await splitToFit(fixture("many-pages.pdf"), 20 * KB, options, controller.signal);
    } catch (err) {
      threw = err instanceof Cancelled;
    }
    check("an aborted signal stops the work", threw);
  }

  console.log(
    failures === 0
      ? "\nAll split checks passed.\n"
      : `\n${failures} check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

function inOrder(pieces: readonly SplitPiece[]): boolean {
  return pieces.every((p, i) => i === 0 || p.fromPage > pieces[i - 1].fromPage);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
