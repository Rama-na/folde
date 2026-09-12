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
import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

const PORT = 3311;
const ORIGIN = `http://127.0.0.1:${PORT}`;
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
