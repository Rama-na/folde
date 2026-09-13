/**
 * The real thing, in a real browser.
 *
 * `test:shrink` covers the ladder under Node with sharp. This covers what that
 * cannot: the OffscreenCanvas codec, the Web Worker plumbing, pdf.js rasterizing,
 * and the interface actually wiring them together. Those are exactly the parts a
 * green Node suite says nothing about.
 *
 * It drives the production build, not the dev server, so what is measured is what
 * gets deployed.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { chromium, type Browser, type Page } from "playwright-core";
import { formatBytes } from "../lib/bytes";
import { MEASURED, STORY } from "../lib/story";
import { buildPile, pileExists } from "./make-pile";

const PORT = 3311;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const FIXTURES = join(process.cwd(), "tests", "fixtures");
const PILE = join(FIXTURES, "pile");

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(ORIGIN);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server did not start");
}

/**
 * Put fixtures into the page's file input, the way a user would.
 *
 * Paths, not in-memory buffers: buffer payloads travel to the browser as base64
 * over the debugging protocol, and the large fixtures were being dropped on the
 * way — which looked exactly like a bug in the app.
 */
async function upload(page: Page, names: string[]): Promise<void> {
  await page.setInputFiles(
    'input[type="file"]',
    names.map((name) => join(FIXTURES, name)),
  );
}

/** Bytes the page should be holding, so a silent drop cannot pass as success. */
function fixtureTotal(names: string[]): number {
  return names.reduce((n, name) => n + readFileSync(join(FIXTURES, name)).length, 0);
}

/** Match the page's own size formatting, which truncates rather than rounds. */
function formatMB(bytes: number): string {
  const mb = Math.floor((bytes / 1_000_000) * 10) / 10;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * Nothing broke.
 *
 * The suite once passed a whole run while the page was showing a worker crash and
 * silently dropping half the files — every individual assertion was true of the
 * part that did work. This is the check that makes that impossible.
 */
async function assertClean(page: Page, where: string): Promise<void> {
  // An honest "could not reach the limit" is a result, not a crash; anything else
  // in the failure colour is the page telling the user something broke.
  const errors = page
    .locator('[class*="border-wont"]')
    .filter({ hasNotText: "could not reach the limit" })
    .filter({ hasNotText: "still too large to send" });

  const count = await errors.count();
  // Only read the text when there is something to read — asking an empty locator
  // for its content waits for an element that is never going to arrive.
  const detail = count > 0 ? ((await errors.first().textContent()) ?? "") : "";
  check(`${where}: no error banner on the page`, count === 0, detail.trim());
}

async function run(page: Page): Promise<void> {
  console.log("\nbrowser: a 300 DPI scan to a 200 KB portal limit");
  await page.goto(ORIGIN);

  await upload(page, ["scan-300dpi.pdf"]);
  await page.getByText("1 file", { exact: false }).first().waitFor();
  await assertContrast(page, "intake");

  await page.getByRole("tab", { name: "Uploading to a portal" }).click();
  await page.getByRole("button", { name: /200 KB/ }).click();

  const started = Date.now();
  await page.getByRole("button", { name: "Make it fit" }).click();

  // The result heading only appears once the worker has reported back.
  const summary = page.locator("p", { hasText: "→" }).first();
  await summary.waitFor({ timeout: 180_000 });
  const elapsed = Date.now() - started;
  await settle(page);

  const text = (await summary.textContent()) ?? "";
  console.log(`  result: ${text.trim()} in ${(elapsed / 1000).toFixed(1)}s`);

  check("the page reports a before and after size", text.includes("→"));
  check(
    "nothing was reported as unable to reach the limit",
    !(await page.getByText("could not reach the limit").isVisible()),
  );

  // The real assertion: save the file and measure the bytes that come out.
  const download = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Save" }).first().click();
  const saved = await download;
  const path = await saved.path();
  const bytes = readFileSync(path);

  console.log(`  downloaded ${saved.suggestedFilename()}: ${bytes.length} bytes`);
  check(
    "the downloaded file is genuinely under 200 KB",
    bytes.length <= 200_000,
    `${bytes.length} bytes`,
  );
  check(
    "the downloaded file is a valid PDF",
    bytes.subarray(0, 5).toString() === "%PDF-",
  );
  check("compression under a phone-ish budget of time", elapsed < 60_000, `${elapsed}ms`);
  await assertClean(page, "portal target");
  await assertContrast(page, "results");

  // Force rung 3, and force it somewhere it can actually succeed.
  //
  // flate-image.pdf holds one full-page Flate-encoded image. Rung 2 skips those on
  // purpose — re-encoding one risks inverting the colours — so rasterizing is the
  // only route to the target, and a single page comfortably reaches 200 KB. This
  // is the scenario that exercises pdf.js end to end; a text document with an
  // unreachable target only ever proves the refusal path.
  console.log("\nbrowser: rasterizing, the last resort");
  await page.goto(ORIGIN);
  await upload(page, ["flate-image.pdf"]);
  await page.getByRole("tab", { name: "Uploading to a portal" }).click();
  await page.getByRole("button", { name: /^200 KB/ }).click();
  await page.getByRole("button", { name: "Make it fit" }).click();
  await page.locator("p", { hasText: "→" }).first().waitFor({ timeout: 180_000 });
  await assertClean(page, "rasterize");

  check(
    "rasterizing actually ran and reached the target",
    (await page.getByText("converted to images").count()) > 0,
    (await page.getByText("could not reach the limit").count()) > 0
      ? "it refused instead — pdf.js is not working"
      : "no rasterize notice appeared",
  );
  check(
    "and the user is told their text is no longer selectable",
    (await page.getByText("no longer be selected or searched").count()) > 0,
  );

  const rasterDownload = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Save" }).first().click();
  const rasterBytes = readFileSync(await (await rasterDownload).path());
  console.log(`  2.9 MB Flate-image PDF rasterized to ${rasterBytes.length} bytes`);
  check(
    "the rasterized file is genuinely under 200 KB",
    rasterBytes.length <= 200_000,
    `${rasterBytes.length} bytes`,
  );
  check(
    "and is a valid PDF",
    rasterBytes.subarray(0, 5).toString() === "%PDF-",
  );

  console.log("\nbrowser: a pile of files batched for a 5 MB email cap");
  await page.goto(ORIGIN);
  const pile = [
    "scan-300dpi.pdf",
    "scan-heavy.pdf",
    "text.pdf",
    "many-pages.pdf",
  ];
  await upload(page, pile);

  // Confirm the page is holding every byte we handed it. Without this, files
  // lost on the way in read as "everything already fits" and the suite passes
  // while testing nothing.
  const listed = (await page.locator("h2", { hasText: "files" }).first().textContent()) ?? "";
  console.log(`  page holds: ${listed.trim()}`);
  check(
    `all ${pile.length} files reached the page`,
    listed.includes(`${pile.length} files`),
    listed,
  );
  check(
    "and the total size matches the fixtures on disk",
    listed.includes(formatMB(fixtureTotal(pile))),
    `expected ${formatMB(fixtureTotal(pile))} in "${listed.trim()}"`,
  );

  await page.getByRole("tab", { name: "Sending by email" }).click();
  await page.getByRole("button", { name: /^5 MB/ }).click();

  const plan = await page
    .locator("section", { hasText: "Make it fit" })
    .first()
    .textContent();
  console.log(`  plan: "${(plan ?? "").replace("Make it fit", "").trim()}"`);
  check(
    "a pile far over the cap is not mistaken for one that already fits",
    !/already fits in one email/i.test(plan ?? ""),
    plan ?? "",
  );

  await page.getByRole("button", { name: "Make it fit" }).click();
  await page
    .getByRole("heading", { name: /email(s)? to send/ })
    .waitFor({ timeout: 180_000 });

  const heading =
    (await page.getByRole("heading", { name: /email(s)? to send/ }).textContent()) ??
    "";
  console.log(`  ${heading.trim()}`);

  const wireSizes = await page.getByText("on the wire").allTextContents();
  console.log(`  batches: ${wireSizes.map((s) => s.trim()).join(", ")}`);

  check("at least one batch was produced", wireSizes.length > 0);

  // Every file that went in has to come back out. The worker stops the whole job
  // on an error, so a crash midway through shows up as a short results list —
  // which is exactly how a broken rasterizer hid behind passing assertions.
  const returned = (await page.locator("section", { hasText: "→" }).first().textContent()) ?? "";
  check(
    `all ${pile.length} files came back from the worker`,
    returned.includes(`${pile.length} files`),
    returned.trim(),
  );
  await assertClean(page, "email batching");
  check(
    "no file is reported as failing when the batches all worked",
    (await page.getByText("could not reach the limit").count()) === 0,
    (await page.locator("section", { hasText: "could not reach the limit" }).first().textContent().catch(() => "")) ?? "",
  );
  check(
    "every batch is reported under the 5 MB cap",
    wireSizes.every((label) => {
      const mb = /([\d.]+)\s*MB on the wire/.exec(label);
      return mb ? Number(mb[1]) <= 5 : true;
    }),
    wireSizes.join(" | "),
  );

  console.log("\nbrowser: a file that already fits is never touched");
  await page.goto(ORIGIN);
  await upload(page, ["tiny.pdf"]);
  await page.getByRole("tab", { name: "Uploading to a portal" }).click();
  await page.getByRole("button", { name: /200 KB/ }).click();
  const note = await page
    .locator("section", { hasText: "Make it fit" })
    .first()
    .textContent();
  check(
    "the interface says it will leave it alone",
    /already smaller is left untouched/i.test(note ?? ""),
    note ?? "",
  );

  const original = readFileSync(join(FIXTURES, "tiny.pdf"));
  await page.getByRole("button", { name: "Make it fit" }).click();
  const untouched = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Save" }).first().click();
  const out = readFileSync(await (await untouched).path());
  check(
    "and hands back the original bytes, unchanged",
    Buffer.compare(original, out) === 0,
    `${original.length} vs ${out.length}`,
  );
}

/**
 * Assemble the standalone build the way the Dockerfile does.
 *
 * `next build` leaves static assets outside the standalone output, so serving it
 * straight from the build directory yields a page with no CSS and no JavaScript.
 * Doing it here rather than by hand means the suite tests the same arrangement
 * that gets deployed, and cannot silently pass against stale files.
 */
function assembleStandalone(): void {
  if (!existsSync(".next/standalone/server.js")) {
    throw new Error("no standalone build — run `npm run build` first");
  }
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  if (existsSync("public")) {
    cpSync("public", ".next/standalone/public", { recursive: true });
  }
}

/**
 * WCAG contrast, computed from what the browser actually painted.
 *
 * A palette change is exactly the kind of edit that quietly drops a colour below
 * readable without anything failing, so this reads the real computed styles rather
 * than trusting the token values. The accent carries every primary action and the
 * two status colours carry the only two outcomes that matter, so all three are
 * checked against the surface they sit on.
 */
/**
 * Let transitions and the count animation finish before measuring anything.
 *
 * Both of the first failures this suite reported after the redesign were this: a
 * tab measured mid-colour-transition read 1.08:1, and the pile's result number read
 * "40 MB -> 18.9 MB, 75% smaller", which cannot both be true because the count was
 * still falling. Longer than the 150ms colour transition and the 900ms count.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(1_100);
}

async function assertContrast(page: Page, where: string): Promise<void> {
  await settle(page);
  // Passed as a source string on purpose. The test runner's transpiler wraps named
  // function expressions in a `__name` helper that does not exist in the page, so a
  // normal inline arrow body throws ReferenceError the moment it runs in the browser.
  const results = (await page.evaluate(`(() => {
    function luminance(color) {
      var parts = (color.match(/[\\d.]+/g) || ["0", "0", "0"]).map(Number);
      function channel(c) {
        var v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      }
      return 0.2126 * channel(parts[0]) + 0.7152 * channel(parts[1]) + 0.0722 * channel(parts[2]);
    }

    function ratio(fg, bg) {
      var a = luminance(fg), b = luminance(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    // Walk up for a painted background: a transparent button inherits the section
    // behind it, and that is what the eye actually compares against.
    function backdrop(el) {
      var node = el;
      while (node) {
        var bg = getComputedStyle(node).backgroundColor;
        if (bg && bg !== "transparent" && !/rgba?\\([^)]*,\\s*0\\)/.test(bg)) return bg;
        node = node.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    }

    var out = [];
    var nodes = document.querySelectorAll("button, a[href]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var style = getComputedStyle(el);
      out.push({
        label: (el.textContent || "").trim().slice(0, 28) || el.tagName,
        ratio: ratio(style.color, backdrop(el))
      });
    }
    return out;
  })()`)) as Array<{ label: string; ratio: number }>;

  const failing = results.filter((r) => r.ratio < 4.5);
  check(
    `${where}: every control clears WCAG AA (4.5:1)`,
    failing.length === 0,
    failing.map((f) => `"${f.label}" at ${f.ratio.toFixed(2)}:1`).join(", "),
  );
}

/**
 * The case that started the project, at the width it will actually be used.
 *
 * Everything in this product is premised on "42 documents, 37.6 MB" and until now
 * the browser had never seen more than four, at desktop width. Mobile-first is
 * written in DESIGN.md; this is where that claim either holds or does not.
 */
async function runPile(browser: Browser): Promise<void> {
  console.log("\nbrowser: 42 mixed files at phone width");

  if (!pileExists()) {
    console.log("  building the pile (first run only)...");
    await buildPile();
  }
  const names = readdirSync(PILE).sort();
  const total = names.reduce(
    (n, name) => n + readFileSync(join(PILE, name)).length,
    0,
  );

  // A mid-range Android, which is what this is for.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => {
    failures += 1;
    console.log(`  FAIL uncaught page error — ${err.message}`);
  });

  try {
    await page.goto(ORIGIN);
    await page.setInputFiles(
      'input[type="file"]',
      names.map((name) => join(PILE, name)),
    );

    const listed =
      (await page.locator("h2", { hasText: "files" }).first().textContent()) ?? "";
    console.log(
      `  ${names.length} files, ${(total / 1_000_000).toFixed(1)} MB — page holds: ${listed.trim()}`,
    );
    check(
      `all ${names.length} files reached the page`,
      listed.includes(`${names.length} files`),
      listed.trim(),
    );

    // Nothing may overflow sideways at 390px. A horizontal scrollbar on a phone is
    // the difference between usable and not.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("no horizontal scroll at 390px", overflow <= 0, `${overflow}px over`);

    await page.getByRole("tab", { name: "Sending by email" }).click();
    await page.getByRole("button", { name: /^5 MB/ }).click();

    // Every control has to be thumb-sized. DESIGN.md says 44px minimum.
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("button, input, select, a")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.height < 44) out.push(`${el.tagName}:${Math.round(r.height)}px`);
      }
      return out;
    });
    check("every visible control is at least 44px tall", small.length === 0, small.join(", "));

    const started = Date.now();
    await page.getByRole("button", { name: "Make it fit" }).click();
    await page
      .getByRole("heading", { name: /email(s)? to send/ })
      .waitFor({ timeout: 900_000 });
    const elapsed = Date.now() - started;
    await settle(page);

    const summary =
      (await page.locator("section", { hasText: "→" }).first().textContent()) ?? "";
    console.log(`  ${summary.replace(/\s+/g, " ").trim()} in ${(elapsed / 1000).toFixed(1)}s`);

    check(
      `all ${names.length} files came back from the worker`,
      summary.includes(`${names.length} files`),
      summary.replace(/\s+/g, " ").trim(),
    );

    // The counted number and the static percentage are computed from the same two
    // figures, so they must agree. When they disagree the count was read before it
    // landed, which is exactly how this suite first reported "40 MB -> 18.9 MB,
    // 75% smaller" as a pass.
    const counted = /→\s*([\d.]+)\s*MB/.exec(summary);
    const percent = /(\d+)%\s*smaller/.exec(summary);
    if (counted && percent) {
      const implied = Math.round(
        (1 - Number(counted[1]) / (total / 1_000_000)) * 100,
      );
      check(
        "the counted total agrees with the percentage shown",
        Math.abs(implied - Number(percent[1])) <= 1,
        `${counted[1]} MB implies ${implied}%, page says ${percent[1]}%`,
      );
    }
    await assertClean(page, "the pile");
    check(
      "no file is reported as failing when the batches all worked",
      (await page.getByText("could not reach the limit").count()) === 0,
    );

    const wire = await page.getByText("on the wire").allTextContents();
    console.log(`  batches: ${wire.map((w) => w.trim()).join(", ")}`);
    check("batches were produced", wire.length > 0);
    check(
      "every batch is under the 5 MB cap",
      wire.every((label) => {
        const mb = /([\d.]+)\s*MB on the wire/.exec(label);
        return mb ? Number(mb[1]) <= 5 : true;
      }),
      wire.join(" | "),
    );

    const after = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("still no horizontal scroll with results shown", after <= 0, `${after}px over`);

    // Not a pass/fail — a number worth knowing, since nobody had one.
    console.log(
      `  throughput: ${(total / 1_000_000 / (elapsed / 1000)).toFixed(1)} MB/s ` +
        `across ${names.length} files`,
    );
  } finally {
    await context.close();
  }
}

/**
 * The polish must not be load-bearing.
 *
 * Motion is gated on prefers-reduced-motion and Save-Data, which means a real
 * share of users never sees it. The rule that makes that safe is that no
 * information exists only inside an animation, and this is what proves it: the
 * same job, forced static, has to reach the same measured numbers.
 */
async function runReducedMotion(browser: Browser): Promise<void> {
  console.log("\nbrowser: reduced motion reaches the same numbers");
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (err) => {
    failures += 1;
    console.log(`  FAIL uncaught page error - ${err.message}`);
  });

  try {
    await page.goto(ORIGIN);
    await page.setInputFiles(
      'input[type="file"]',
      [join(FIXTURES, "scan-300dpi.pdf")],
    );
    await page.getByRole("tab", { name: "Uploading to a portal" }).click();
    await page.getByRole("button", { name: /^200 KB/ }).click();
    await page.getByRole("button", { name: "Make it fit" }).click();

    const summary = page.locator("p", { hasText: "→" }).first();
    await summary.waitFor({ timeout: 180_000 });
    await settle(page);

    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: "Save" }).first().click();
    const bytes = readFileSync(await (await download).path());

    console.log(`  static run produced ${bytes.length} bytes`);
    check(
      "a statically-rendered run still reaches the target",
      bytes.length <= 200_000,
      `${bytes.length} bytes`,
    );
    // The counting number must have settled on its real value, not been left
    // mid-animation at whatever it started from.
    const text = (await summary.textContent()) ?? "";
    check(
      "the result number shows the final figure, not the starting one",
      !text.includes("5.3 MB →  5.3 MB") && text.includes("→"),
      text.trim(),
    );
    await assertClean(page, "reduced motion");
  } finally {
    await context.close();
  }
}

/** The canvas colour the page actually paints, for theme comparison. */
async function canvasColour(browser: Browser, scheme: "light" | "dark"): Promise<string> {
  const context = await browser.newContext({ colorScheme: scheme });
  const page = await context.newPage();
  try {
    await page.goto(ORIGIN);
    return await page.evaluate(
      `getComputedStyle(document.body).backgroundColor`,
    );
  } finally {
    await context.close();
  }
}

/** First channel of an rgb() string, as a rough brightness proxy. */
function firstChannel(colour: string): number {
  const m = /rgba?\(\s*(\d+)/.exec(colour);
  return m ? Number(m[1]) : -1;
}

/**
 * Both themes, and proof that they are actually two themes.
 *
 * The version of this check that only asserted "the dark canvas is dark" passed
 * while light mode did not exist at all: a nested dark `@theme` had been hoisted out
 * of its media query by Tailwind, so every visitor got the dark palette and the page
 * was perfectly consistent about it. Comparing the two is what catches that.
 */
async function runThemes(browser: Browser): Promise<void> {
  console.log("\nbrowser: both themes");

  const light = await canvasColour(browser, "light");
  const dark = await canvasColour(browser, "dark");
  console.log(`  light canvas: ${light}`);
  console.log(`  dark canvas:  ${dark}`);

  check("the light canvas is light", firstChannel(light) > 200, light);
  check("the dark canvas is dark", firstChannel(dark) < 60, dark);
  check(
    "the two themes are genuinely different",
    light !== dark,
    "both rendered the same canvas, so one of them is not being applied",
  );

  await runDarkDetail(browser);
}

async function runDarkDetail(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  try {
    await page.goto(ORIGIN);
    await page.setInputFiles(
      'input[type="file"]',
      [join(FIXTURES, "photo.jpg")],
    );
    await page.getByRole("tab", { name: "Uploading to a portal" }).click();
    await page.getByRole("button", { name: /^100 KB/ }).click();

    await assertContrast(page, "dark");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("dark mode has no horizontal scroll at 390px", overflow <= 0, `${overflow}px`);

  } finally {
    await context.close();
  }
}

/**
 * The archive, all the way to disk.
 *
 * Written because somebody finished a real job, pressed Save, and got four separate
 * files where they were expecting one bundle. Loose is the default and the button
 * said so, so nothing was broken — but "nothing was broken" was a guess until this
 * existed, and the guess covered a path no test had ever walked. `zipBatch` being
 * correct in Node says nothing about whether the browser hands the bytes over.
 *
 * So this asserts the whole way down: the default really is loose, choosing the
 * archive really collapses the batch to one attachment, and the thing that lands is
 * a ZIP that opens and still contains every file that went into it.
 */
async function runZip(browser: Browser): Promise<void> {
  console.log("\nbrowser: choosing the ZIP actually delivers a ZIP");

  // Deliberately a pile that already fits. That was the owner's actual situation —
  // "1.8 MB -> 1.8 MB", nothing compressed, four files saved instead of a bundle —
  // so it is the case worth nailing down rather than a contrived one.
  const names = ["photo-small.jpg", "text.pdf", "signature.png", "tiny.pdf"];
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (err) => {
    failures += 1;
    console.log(`  FAIL uncaught page error — ${err.message}`);
  });

  try {
    await page.goto(ORIGIN);
    await upload(page, names);
    await page.getByRole("tab", { name: "Sending by email" }).click();
    await page.getByRole("button", { name: /^5 MB/ }).click();
    await page.getByRole("button", { name: "Make it fit" }).click();
    await page
      .getByRole("heading", { name: /email(s)? to send/ })
      .waitFor({ timeout: 180_000 });
    await settle(page);
    await assertClean(page, "the zip run");

    // Everything here is already inside a 5 MB cap, so this is also the "already
    // fits" path: one email, and the files handed back untouched.
    const parts = await page.getByText("on the wire").count();
    check("the four files need only one email", parts === 1, `${parts} parts`);

    // The other half of what looked like a bug. A pile that already fits comes back
    // the same size on purpose, so there is no percentage to show — re-encoding a
    // file that already meets the limit spends quality to buy nothing.
    check(
      "nothing was compressed, because nothing needed to be",
      (await page.getByText("% smaller").count()) === 0,
    );

    const save = page.getByRole("button", { name: /^Save / });
    check(
      "loose is what you get unless you say otherwise",
      (await save.first().textContent())?.includes(`Save ${names.length} files`) ===
        true,
      (await save.first().textContent()) ?? "",
    );

    await page.getByRole("radio", { name: "One ZIP per email" }).click();
    await page.waitForTimeout(200);

    const label = (await save.first().textContent())?.trim() ?? "";
    console.log(`  the button now offers: ${label}`);
    check(
      "the button names the archive it is about to write",
      /Save 01 of 01\.zip/.test(label),
      label,
    );

    const pending = page.waitForEvent("download", { timeout: 30_000 });
    await save.first().click();
    const download = await pending;
    const bytes = readFileSync(await download.path());

    check(
      "one attachment lands, named as a part",
      download.suggestedFilename() === "01 of 01.zip",
      download.suggestedFilename(),
    );
    check(
      "and it is genuinely a ZIP",
      bytes.subarray(0, 2).toString() === "PK",
      `starts with ${JSON.stringify(bytes.subarray(0, 4).toString("latin1"))}`,
    );

    // A ZIP that opens is the point. A ZIP that opens and is missing file three is
    // worse than no ZIP at all, because nobody finds out until the recipient does.
    const entries = unzipSync(new Uint8Array(bytes));
    const inside = Object.keys(entries).sort();
    console.log(`  ${bytes.length} bytes containing: ${inside.join(", ")}`);
    check(
      "with every file still inside it, under the name it arrived with",
      inside.length === names.length && names.every((n) => inside.includes(n)),
      inside.join(", "),
    );
    check(
      "and none of them empty",
      Object.values(entries).every((b) => b.length > 0),
    );
  } finally {
    await context.close();
  }
}

/**
 * The landing page, and the two ways it could quietly go wrong.
 *
 * The first is arithmetic drift. Every figure down there is computed by running the
 * real packer over an imaginary folder, precisely so that a page cannot end up
 * advertising numbers the software no longer produces. That only holds if something
 * checks the rendered text against the module, which is what this does.
 *
 * The second is the page eating its own product. The drop zone is the first thing on
 * the screen and the argument for it is underneath, and the instant somebody has
 * files loaded the argument is over — a tool with a sales pitch stapled under it is
 * a worse tool. So: it is there when the page is empty, and gone the moment it is
 * not.
 */
async function runLanding(browser: Browser): Promise<void> {
  console.log("\nbrowser: the landing page");

  // Phone-sized, because that is who reads it, and because the sequence is the one
  // part of the product that pins a full viewport and can overflow if it is wrong.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => {
    failures += 1;
    console.log(`  FAIL uncaught page error — ${err.message}`);
  });

  try {
    await page.goto(ORIGIN);
    await settle(page);

    check(
      "the drop zone is above the argument for it",
      (await page.locator("#drop").boundingBox())!.y <
        (await page.getByText("One job, finished.").boundingBox())!.y,
    );

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("no horizontal scroll at 390px", overflow <= 0, `${overflow}px over`);

    // Scrolled by wheel rather than by scrollTo: smooth scrolling intercepts the
    // wheel and interpolates it, so a wheel is what a real visitor's scroll looks
    // like by the time the sequence sees it.
    await page.mouse.move(195, 500);
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(90);
    }
    await settle(page);

    // Scoped to the sequence: the aside above it also says "on the wire", in the
    // sentence about why a 4.7 MB email bounces, and an unscoped match counts it.
    const sequence = page.locator(
      'section[aria-label="What happens to a folder of documents"]',
    );
    const wire = (await sequence.getByText("on the wire").allTextContents()).map(
      (t) => t.trim(),
    );
    console.log(`  the sequence ends on: ${wire.join(", ")}`);
    check(
      "the sequence reaches its packed state",
      wire.length === STORY.parts.length,
      `${wire.length} parts shown, ${STORY.parts.length} expected`,
    );
    // The figures on the page are the packer's, not a copy of them that drifted.
    check(
      "and every weight on it is the one the packer computed",
      STORY.parts.every((part) =>
        wire.some((text) => text.includes(formatBytes(part.encodedBytes))),
      ),
      `page: ${wire.join(" | ")}`,
    );

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await settle(page);
    check(
      "the measured claim carries the figure the suite actually produces",
      (await page.getByText(formatBytes(MEASURED.after)).count()) > 0,
      formatBytes(MEASURED.after),
    );

    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("button, input, select, a")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.height < 44) out.push(`${el.tagName}:${Math.round(r.height)}px`);
      }
      return out;
    });
    check(
      "every control on it is at least 44px tall",
      small.length === 0,
      small.join(", "),
    );

    await page.goto(ORIGIN);
    await upload(page, ["text.pdf"]);
    await page.getByText("1 file", { exact: false }).first().waitFor();
    check(
      "and all of it gets out of the way once there are files to work on",
      (await page.getByText("One job, finished.").count()) === 0,
    );
    await assertClean(page, "the landing");
  } finally {
    await context.close();
  }

  // The sequence is scroll-driven, so for anybody who has asked for less movement
  // there is no sequence at all — which means the same facts have to be sitting
  // there already, spelled out, with no scrolling required to reach them.
  console.log("\nbrowser: the landing page without motion");
  const still = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page2 = await still.newPage();
  page2.on("pageerror", (err) => {
    failures += 1;
    console.log(`  FAIL uncaught page error — ${err.message}`);
  });
  try {
    await page2.goto(ORIGIN);
    await settle(page2);
    const wire = (
      await page2
        .locator('section[aria-label="What happens to a folder of documents"]')
        .getByText("on the wire")
        .allTextContents()
    ).map((t) => t.trim());
    check(
      "the same parts are on the page with nothing to scroll",
      wire.length === STORY.parts.length &&
        STORY.parts.every((part) =>
          wire.some((text) => text.includes(formatBytes(part.encodedBytes))),
        ),
      wire.join(" | "),
    );
    check(
      "and the before and after of each file is stated, not animated",
      (await page2.getByText(formatBytes(STORY.files[0].before)).count()) > 0 &&
        (await page2.getByText(formatBytes(STORY.files[0].after)).count()) > 0,
    );
    const overflow = await page2.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("still no horizontal scroll", overflow <= 0, `${overflow}px over`);
  } finally {
    await still.close();
  }
}

/**
 * A document too large to send even on its own.
 *
 * The interface used to say "still too large to send even alone. Try a smaller
 * limit, or split the document" and then offer no way to split the document, which
 * is a refusal dressed as advice. `test:split` covers the dividing itself. This
 * covers the part that test cannot: that the worker reaches for it at the right
 * moment, that the user is told it happened, and that what lands on disk opens.
 *
 * Driven through the custom limit box rather than a preset, because a six-page text
 * document is the fastest honest way to reach this state — text barely compresses,
 * so the ladder genuinely runs out, and it runs out in seconds rather than by
 * rasterizing a hundred pages to find out.
 */
async function runSplit(browser: Browser): Promise<void> {
  console.log("\nbrowser: a document that cannot travel whole is divided by page");

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (err) => {
    failures += 1;
    console.log(`  FAIL uncaught page error — ${err.message}`);
  });

  try {
    await page.goto(ORIGIN);
    await upload(page, ["text.pdf"]);
    await page.getByRole("tab", { name: "Sending by email" }).click();
    await page.getByLabel("Or type the limit your form gives").fill("10");
    await page.getByRole("button", { name: "Make it fit" }).click();
    await page
      .getByRole("heading", { name: /email(s)? to send/ })
      .waitFor({ timeout: 180_000 });
    await settle(page);

    check(
      "the user is told the document was divided",
      (await page.getByText("divided by page").count()) > 0,
      (await page.getByText("still too large to send").count()) > 0
        ? "it refused instead of dividing"
        : "no notice appeared",
    );
    check(
      "and told that each piece opens on its own",
      (await page.getByText("nothing for the recipient to join").count()) > 0,
    );

    const names = await page.locator("li", { hasText: /\(pages \d/ }).allTextContents();
    console.log(`  pieces: ${names.map((n) => n.trim().split("\n")[0]).join(" | ")}`);
    check(
      "the pieces are named by page range",
      names.length >= 2,
      `${names.length} found`,
    );

    // The arithmetic that dividing quietly breaks. Every piece carries the whole
    // document's original size, because that is what it was cut from — summed
    // blindly, a 8.7 KB file reports as 17 KB before a byte was saved.
    const summary =
      (await page.locator("section", { hasText: "→" }).first().textContent()) ?? "";
    console.log(`  summary: ${summary.replace(/\s+/g, " ").trim()}`);
    const before = /([\d.]+)\s*KB/.exec(summary);
    const original = fixtureTotal(["text.pdf"]) / 1000;
    check(
      "the starting total counts the original once, not once per piece",
      before !== null && Math.abs(Number(before[1]) - original) < 1,
      `page says ${before?.[1]} KB, the file is ${original.toFixed(1)} KB`,
    );

    await assertClean(page, "the split");

    const pending = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /^Save / }).first().click();
    const bytes = readFileSync(await (await pending).path());
    check(
      "and a piece downloads as a PDF that opens by itself",
      bytes.subarray(0, 5).toString() === "%PDF-",
      `${bytes.length} bytes starting ${JSON.stringify(bytes.subarray(0, 5).toString("latin1"))}`,
    );

    // The other half of the rule: a portal wants one document, so the same file
    // against the same impossible number must refuse rather than hand back three.
    await page.goto(ORIGIN);
    await upload(page, ["text.pdf"]);
    await page.getByRole("tab", { name: "Uploading to a portal" }).click();
    await page.getByLabel("Or type the limit your form gives").fill("3");
    await page.getByRole("button", { name: "Make it fit" }).click();
    await page.locator("p", { hasText: "→" }).first().waitFor({ timeout: 180_000 });
    await settle(page);
    check(
      "a portal upload is never divided — it refuses instead",
      (await page.getByText("divided by page").count()) === 0 &&
        (await page.getByText("could not reach the limit").count()) > 0,
    );
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  assembleStandalone();

  const server: ChildProcess = spawn("node", [".next/standalone/server.js"], {
    env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1" },
    stdio: "ignore",
  });

  let browser: Browser | null = null;
  try {
    await waitForServer();
    browser = await chromium.launch({
      executablePath: "/opt/pw-browsers/chromium",
    });
    const page = await browser.newPage();

    page.on("pageerror", (err) => {
      failures += 1;
      console.log(`  FAIL uncaught page error — ${err.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`  [console] ${msg.text()}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        failures += 1;
        console.log(`  FAIL ${res.status()} for ${res.url()}`);
      }
    });

    await run(page);
    await runReducedMotion(browser);
    await runThemes(browser);
    await runLanding(browser);
    await runZip(browser);
    await runSplit(browser);
    await runPile(browser);
  } finally {
    await browser?.close();
    server.kill();
  }

  console.log(
    failures === 0
      ? "\nAll browser checks passed.\n"
      : `\n${failures} check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
