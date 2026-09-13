/**
 * The tools.
 *
 * What these assertions are actually about is *not losing things*. A merge that
 * drops a document, a reorder that silently keeps the old order, an extract that
 * hands back the wrong pages — every one of them produces a plausible-looking file
 * that is wrong, and nobody finds out until the person at the other end needs the
 * page that is missing. So almost every check here reloads the output and counts
 * what is really in it rather than trusting the call that made it.
 *
 * The renderer is stubbed where it is needed. It belongs to the browser, and
 * `test:browser` drives the real one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { formatBytes } from "../lib/bytes";
import {
  analyse,
  extractPages,
  imagesToPdf,
  isProtected,
  mergePdfs,
  offeredTools,
  parseRanges,
  pdfToImages,
  protectPdf,
  rebuildPdf,
  unlockPdf,
  type AnalysedFile,
} from "../modules/tools";
import type { RenderPages } from "../modules/shrink/types";

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

async function pagesOf(bytes: Uint8Array, password?: string): Promise<number> {
  const doc = await PDFDocument.load(
    bytes,
    password === undefined ? {} : ({ password } as never),
  );
  return doc.getPageCount();
}

async function main(): Promise<void> {
  console.log("\ntools: merging");
  {
    const text = fixture("text.pdf"); // 6 pages
    const many = fixture("many-pages.pdf"); // 120 pages
    const result = await mergePdfs([
      { name: "text.pdf", bytes: text },
      { name: "many-pages.pdf", bytes: many },
    ]);
    check("two PDFs merge", result.ok, result.ok ? "" : result.reason);
    if (result.ok) {
      const pages = await pagesOf(result.bytes);
      check(
        "and every page of both is in the result",
        pages === 126,
        `${pages} pages, expected 126`,
      );
      console.log(`  6 + 120 pages -> ${pages} pages, ${formatBytes(result.size)}`);
    }

    // The order is the caller's. Merging is almost always "in the order I have just
    // spent a minute arranging", and sorting it would break the document.
    const reversed = await mergePdfs([
      { name: "many-pages.pdf", bytes: many },
      { name: "text.pdf", bytes: text },
    ]);
    check(
      "the given order is kept, not sorted",
      reversed.ok && result.ok && reversed.size !== result.size,
      "both orders produced the same bytes, which means one was reordered",
    );

    const withJunk = await mergePdfs([
      { name: "text.pdf", bytes: text },
      { name: "corrupt.pdf", bytes: fixture("corrupt.pdf") },
      { name: "many-pages.pdf", bytes: many },
    ]);
    check(
      "one unreadable file does not cost the other two",
      withJunk.ok && (await pagesOf(withJunk.bytes)) === 126,
    );
    check(
      "and it is named rather than silently dropped",
      withJunk.skipped?.length === 1 &&
        withJunk.skipped[0].name === "corrupt.pdf",
      JSON.stringify(withJunk.skipped),
    );
    check(
      "merging one file refuses instead of pretending",
      !(await mergePdfs([{ name: "text.pdf", bytes: text }])).ok,
    );
  }

  console.log("\ntools: reordering, rotating and deleting");
  {
    const text = fixture("text.pdf");

    const reordered = await rebuildPdf(text, [
      { from: 6 },
      { from: 1 },
      { from: 3 },
    ]);
    check("a page plan rebuilds the document", reordered.ok);
    if (reordered.ok) {
      check(
        "with exactly the pages asked for",
        (await pagesOf(reordered.bytes)) === 3,
      );
    }

    const turned = await rebuildPdf(text, [{ from: 1, rotate: 90 }]);
    check("a rotation is applied", turned.ok);
    if (turned.ok) {
      const doc = await PDFDocument.load(turned.bytes);
      check(
        "and the page really carries it",
        doc.getPage(0).getRotation().angle === 90,
        `${doc.getPage(0).getRotation().angle} degrees`,
      );
    }

    // Rotation adds to whatever the page already had. A scan that arrived sideways
    // is already at 90, and setting rather than adding would quietly undo that.
    const prerotated = await PDFDocument.create();
    prerotated.addPage([200, 400]).setRotation(degrees(90));
    const already = await rebuildPdf(
      await prerotated.save(),
      [{ from: 1, rotate: 90 }],
    );
    if (already.ok) {
      const doc = await PDFDocument.load(already.bytes);
      check(
        "rotation adds to what the page already had",
        doc.getPage(0).getRotation().angle === 180,
        `${doc.getPage(0).getRotation().angle} degrees, expected 180`,
      );
    }

    const empty = await rebuildPdf(text, []);
    check(
      "an empty plan refuses rather than making a blank file",
      !empty.ok,
      empty.ok ? "" : empty.reason,
    );
    const past = await rebuildPdf(text, [{ from: 99 }]);
    check(
      "a page that does not exist is refused in plain words",
      !past.ok && /6 pages/.test(past.reason),
      past.ok ? "" : past.reason,
    );
  }

  console.log("\ntools: page ranges");
  {
    check("a list", parseRanges("1,3,5", 10).join() === "1,3,5");
    check("a span", parseRanges("2-4", 10).join() === "2,3,4");
    check("both", parseRanges("1-2, 9", 10).join() === "1,2,9");
    check("an open end", parseRanges("8-", 10).join() === "8,9,10");
    check("an open start", parseRanges("-3", 10).join() === "1,2,3");
    // Somebody typing 1-999 on a ten-page document means "all of it". Refusing to
    // understand that is not precision.
    check("past the end is clamped, not rejected", parseRanges("1-999", 10).length === 10);
    check("the given order is kept", parseRanges("5,1", 10).join() === "5,1");
    check("nonsense yields nothing", parseRanges("banana", 10).length === 0);

    const taken = await extractPages(fixture("text.pdf"), "2-3");
    check("extracting a range works", taken.ok);
    if (taken.ok) {
      check("and takes exactly that many pages", (await pagesOf(taken.bytes)) === 2);
    }
    const nothing = await extractPages(fixture("text.pdf"), "banana");
    check(
      "a range naming no pages is refused with an example",
      !nothing.ok && /1-3/.test(nothing.reason),
      nothing.ok ? "" : nothing.reason,
    );
  }

  console.log("\ntools: images into a PDF");
  {
    const photos = [
      { name: "photo-small.jpg", bytes: fixture("photo-small.jpg") },
      { name: "signature.png", bytes: fixture("signature.png") },
    ];
    const made = await imagesToPdf(photos);
    check("photos become a PDF", made.ok, made.ok ? "" : made.reason);
    if (made.ok) {
      const doc = await PDFDocument.load(made.bytes);
      check("one page each", doc.getPageCount() === 2);
      const page = doc.getPage(0);
      check(
        "on A4, so it prints and uploads like a page",
        Math.round(page.getWidth()) === 595 && Math.round(page.getHeight()) === 842,
        `${Math.round(page.getWidth())}x${Math.round(page.getHeight())}`,
      );
      console.log(`  2 images -> ${formatBytes(made.size)}, A4`);
    }

    const exact = await imagesToPdf([photos[0]], "image");
    if (exact.ok) {
      const doc = await PDFDocument.load(exact.bytes);
      check(
        "or exactly the image, when that is what was asked for",
        Math.round(doc.getPage(0).getWidth()) !== 595,
        `${Math.round(doc.getPage(0).getWidth())}pt wide`,
      );
    }

    // Dispatch is on bytes, never the name.
    const mislabelled = await imagesToPdf([
      { name: "actually-a-png.jpg", bytes: fixture("signature.png") },
    ]);
    check("a PNG named .jpg is read correctly anyway", mislabelled.ok);

    const notAnImage = await imagesToPdf([
      { name: "text.pdf", bytes: fixture("text.pdf") },
    ]);
    check(
      "a PDF handed to the image tool is refused, not mangled",
      !notAnImage.ok,
      notAnImage.ok ? "" : notAnImage.reason,
    );

    const mixed = await imagesToPdf([
      photos[0],
      { name: "text.pdf", bytes: fixture("text.pdf") },
    ]);
    check(
      "and one bad file does not cost the good one",
      mixed.ok && mixed.skipped?.length === 1,
    );
  }

  console.log("\ntools: pages out as images");
  {
    // The renderer belongs to the browser. This stands in for it, so everything
    // above it is exercised here and the real one is driven by test:browser.
    const render: RenderPages = async (_source, { onStart }, onPage) => {
      for (let n = 1; n <= 12; n++) {
        onStart?.(n, 12);
        await onPage({
          page: n,
          of: 12,
          bytes: new Uint8Array([0xff, 0xd8, 0xff, n]),
          widthPt: 595,
          heightPt: 842,
        });
      }
    };

    const names: string[] = [];
    const started: number[] = [];
    const result = await pdfToImages(fixture("many-pages.pdf"), render, {
      baseName: "Statement.pdf",
      onImage: (image) => void names.push(image.name),
      onStart: (page) => void started.push(page),
    });

    check("every page comes out", result.ok && result.pages === 12, JSON.stringify(result));
    check(
      "and is announced before it is drawn",
      started.length === 12 && started[0] === 1,
    );
    check(
      "the .pdf is dropped from the name, not kept",
      names.every((n) => !n.includes(".pdf")),
      names[0],
    );
    // Page 10 sorting before page 2 makes a 40-page export useless in a folder.
    check(
      "pages are zero-padded so they sort in reading order",
      names[0] === "Statement 01.jpg" && names[11] === "Statement 12.jpg",
      `${names[0]} ... ${names[11]}`,
    );
    console.log(`  12 pages -> ${names[0]} ... ${names[11]}`);
  }

  console.log("\ntools: passwords");
  {
    const text = fixture("text.pdf");
    const locked = await protectPdf(text, "hunter2");
    check("a document can be locked", locked.ok, locked.ok ? "" : locked.reason);

    if (locked.ok) {
      check("and it really is locked", await isProtected(locked.bytes));

      let openedWithout = false;
      try {
        await pagesOf(locked.bytes);
        openedWithout = true;
      } catch {
        // expected
      }
      check("it will not open without the password", !openedWithout);
      check(
        "and does open with it",
        (await pagesOf(locked.bytes, "hunter2")) === 6,
      );

      const wrong = await unlockPdf(locked.bytes, "hunter3");
      check(
        "a wrong password is refused clearly",
        !wrong.ok && /password did not open/.test(wrong.reason),
        wrong.ok ? "" : wrong.reason,
      );

      const unlocked = await unlockPdf(locked.bytes, "hunter2");
      check("the right one takes the lock off", unlocked.ok);
      if (unlocked.ok) {
        check(
          "and what comes back opens with no password at all",
          !(await isProtected(unlocked.bytes)) &&
            (await pagesOf(unlocked.bytes)) === 6,
        );
        console.log(
          `  6 pages locked to ${formatBytes(locked.size)} and back to ${formatBytes(unlocked.size)}`,
        );
      }
    }

    const tooShort = await protectPdf(text, "ab");
    check("a two-character password is refused", !tooShort.ok);
  }

  console.log("\ntools: what gets offered");
  {
    const analysed = await Promise.all([
      analyse({ id: "a", name: "text.pdf", bytes: fixture("text.pdf") }),
      analyse({ id: "b", name: "photo.jpg", bytes: fixture("photo-small.jpg") }),
    ]);
    check(
      "a PDF is analysed for its page count",
      analysed[0].kind === "pdf" && analysed[0].pages === 6,
      JSON.stringify(analysed[0]),
    );
    check(
      "and a photo is recognised from its bytes",
      analysed[1].kind === "jpeg" && analysed[1].pages === undefined,
    );

    const locked = await protectPdf(fixture("text.pdf"), "hunter2");
    if (locked.ok) {
      const shut = await analyse({ id: "c", name: "sealed.pdf", bytes: locked.bytes });
      check(
        "a locked document is marked locked, not damaged",
        shut.kind === "pdf" && shut.locked === true,
        JSON.stringify(shut),
      );
      // The one thing that jumps the queue: until it is open, nothing else applies.
      check(
        "and unlocking is offered first",
        offeredTools([shut])[0]?.id === "unlock",
        offeredTools([shut]).map((o) => o.id).join(),
      );
    }

    const ids = (files: AnalysedFile[]) => offeredTools(files).map((o) => o.id);
    const pdf = (over: Partial<AnalysedFile> = {}): AnalysedFile => ({
      id: "p",
      name: "a.pdf",
      size: 100_000,
      kind: "pdf",
      pages: 6,
      ...over,
    });

    check("nothing dropped, nothing offered", ids([]).length === 0);
    check(
      "fitting a limit is always there, and always first among the doable",
      ids([pdf()])[0] === "fit" && ids([pdf({ kind: "jpeg", pages: undefined })])[0] === "fit",
    );
    check(
      "two PDFs can be merged",
      ids([pdf({ id: "1" }), pdf({ id: "2" })]).includes("merge"),
    );
    check(
      "one PDF cannot be merged with itself",
      !ids([pdf()]).includes("merge"),
    );
    check(
      "a multi-page PDF can be reorganised",
      ids([pdf()]).includes("organise") && ids([pdf()]).includes("extract"),
    );
    check(
      "a single page cannot be reordered or split",
      !ids([pdf({ pages: 1 })]).includes("organise") &&
        !ids([pdf({ pages: 1 })]).includes("extract"),
    );
    check(
      "photos are offered a PDF, and are never offered a password",
      ids([pdf({ kind: "png", pages: undefined })]).includes("from-images") &&
        !ids([pdf({ kind: "png", pages: undefined })]).includes("protect"),
    );
    // The point of the whole design: a short list, not a wall.
    const busiest = ids([pdf({ id: "1" }), pdf({ id: "2" }), pdf({ id: "3", kind: "jpeg", pages: undefined })]);
    check(
      "even the busiest pile stays a short list",
      busiest.length <= 5,
      `${busiest.length}: ${busiest.join(", ")}`,
    );
    console.log(`  2 PDFs + a photo offers: ${busiest.join(", ")}`);
  }

  console.log(
    failures === 0
      ? "\nAll tool checks passed.\n"
      : `\n${failures} check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
