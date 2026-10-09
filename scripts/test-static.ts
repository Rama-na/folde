/**
 * The app, served as plain static files with no Node process behind it.
 *
 * ReadyPDF has no API routes, reads no environment at runtime, and does all its work in
 * the browser. If that is true then it does not need a server at all, and the right
 * home for it is a CDN rather than a container. This is the check that settles it:
 * the same journeys as `test:browser`, driven against the exported `out/` directory.
 *
 * The parts most likely to break under static export are the ones that were hardest
 * to get working in the first place - the Web Worker, and pdf.js loading its own
 * nested worker from a path - so those are what this exercises.
 *
 * Run `npm run build:static` first.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const PORT = 3321;
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

async function main(): Promise<void> {
  if (!existsSync(join(process.cwd(), "out", "index.html"))) {
    throw new Error("no static export — run `npm run build:static` first");
  }

  /*
   * Everything the bundle asks for by absolute path has to be in the export.
   *
   * pdf.js's worker is the one that matters and the one that went missing: it is
   * copied into public/ by a prebuild hook, it is gitignored, and npm keys its
   * hooks to the exact script name — so `prebuild` ran for `npm run build` and not
   * for `npm run build:static`, which is the command the deploy uses. Every
   * deployed build shipped without it for weeks. Nothing failed. pdf.js 404s, falls
   * back to running the renderer inline on the calling thread, and the app simply
   * becomes slow enough to look like it has hung.
   *
   * Checked against the chunks rather than against a hardcoded list, so a second
   * asset referenced this way is covered the day it is added.
   */
  const chunks = join(process.cwd(), "out", "_next", "static", "chunks");
  const referenced = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) {
        for (const m of readFileSync(full, "utf8").matchAll(
          /"\/((?:[\w.-]+\/)*[\w.-]+\.(?:mjs|wasm|js))"/g,
        )) {
          referenced.add(m[1]);
        }
      }
    }
  };
  if (existsSync(chunks)) walk(chunks);
  const missing = [...referenced].filter(
    (ref) => !existsSync(join(process.cwd(), "out", ref)),
  );
  check(
    "every asset the bundle fetches by path is in the export",
    missing.length === 0,
    missing.join(", "),
  );

  const server = spawn("npx", ["--yes", "serve", "out", "-l", String(PORT)], {
    stdio: "ignore",
  });

  try {
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(ORIGIN)).ok) break;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    const browser = await chromium.launch({
      executablePath: "/opt/pw-browsers/chromium",
    });
    const page = await browser.newPage();
    page.on("pageerror", (err) => {
      failures += 1;
      console.log(`  FAIL uncaught page error — ${err.message}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        failures += 1;
        console.log(`  FAIL ${res.status()} for ${res.url()}`);
      }
    });

    console.log("\nstatic: a 300 DPI scan to 200 KB, via the Web Worker");
    await page.goto(ORIGIN);
    await page.setInputFiles('input[type="file"]', [
      join(FIXTURES, "scan-300dpi.pdf"),
    ]);
    await page.getByRole("tab", { name: "Uploading to a portal" }).click();
    await page.getByRole("button", { name: /^200 KB/ }).click();
    await page.getByRole("button", { name: "Make it fit" }).click();
    await page.locator("p", { hasText: "→" }).first().waitFor({ timeout: 180_000 });
    await page.waitForTimeout(1_200);

    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: "Save" }).first().click();
    const bytes = readFileSync(await (await download).path());
    console.log(`  downloaded ${bytes.length} bytes`);
    check(
      "the worker ran and the file is genuinely under 200 KB",
      bytes.length <= 200_000,
      `${bytes.length} bytes`,
    );
    check("and is a valid PDF", bytes.subarray(0, 5).toString() === "%PDF-");

    console.log("\nstatic: rasterizing, via pdf.js and its nested worker");
    await page.goto(ORIGIN);
    await page.setInputFiles('input[type="file"]', [
      join(FIXTURES, "flate-image.pdf"),
    ]);
    await page.getByRole("tab", { name: "Uploading to a portal" }).click();
    await page.getByRole("button", { name: /^200 KB/ }).click();
    await page.getByRole("button", { name: "Make it fit" }).click();
    await page.locator("p", { hasText: "→" }).first().waitFor({ timeout: 180_000 });
    check(
      "rasterizing ran from a static host",
      (await page.getByText("converted to images").count()) > 0,
      "pdf.js could not load its worker without a Node server",
    );

    console.log("\nstatic: 42 files at phone width");
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const phone = await context.newPage();
    await phone.goto(ORIGIN);

    const names = readdirSync(PILE).sort();
    await phone.setInputFiles(
      'input[type="file"]',
      names.map((n) => join(PILE, n)),
    );
    await phone.getByRole("tab", { name: "Sending by email" }).click();
    await phone.getByRole("button", { name: /^5 MB/ }).click();

    const started = Date.now();
    await phone.getByRole("button", { name: "Make it fit" }).click();
    await phone
      .getByRole("heading", { name: /email(s)? to send/ })
      .waitFor({ timeout: 900_000 });
    await phone.waitForTimeout(1_200);

    const summary =
      (await phone.locator("section", { hasText: "→" }).first().textContent()) ?? "";
    console.log(
      `  ${summary.replace(/\s+/g, " ").trim()} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    check(
      `all ${names.length} files came back`,
      summary.includes(`${names.length} files`),
      summary.replace(/\s+/g, " ").trim(),
    );

    const wire = await phone.getByText("on the wire").allTextContents();
    console.log(`  batches: ${wire.map((w) => w.trim()).join(", ")}`);
    check(
      "every batch is under the 5 MB cap",
      wire.every((label) => {
        const mb = /([\d.]+)\s*MB on the wire/.exec(label);
        return mb ? Number(mb[1]) <= 5 : true;
      }),
      wire.join(" | "),
    );

    await context.close();
    await browser.close();
  } finally {
    server.kill();
  }

  console.log(
    failures === 0
      ? "\nStatic export works end to end. No server needed.\n"
      : `\n${failures} check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
