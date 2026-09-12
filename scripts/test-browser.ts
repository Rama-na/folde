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
import { chromium, type Browser, type Page } from "playwright-core";
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

  await page.getByRole("tab", { name: "Uploading to a portal" }).click();
  await page.getByRole("button", { name: /200 KB/ }).click();

  const started = Date.now();
  await page.getByRole("button", { name: "Make it fit" }).click();

  // The result heading only appears once the worker has reported back.
  const summary = page.locator("p", { hasText: "→" }).first();
  await summary.waitFor({ timeout: 180_000 });
  const elapsed = Date.now() - started;

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

    const summary =
      (await page.locator("section", { hasText: "→" }).first().textContent()) ?? "";
    console.log(`  ${summary.replace(/\s+/g, " ").trim()} in ${(elapsed / 1000).toFixed(1)}s`);

    check(
      `all ${names.length} files came back from the worker`,
      summary.includes(`${names.length} files`),
      summary.replace(/\s+/g, " ").trim(),
    );
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
