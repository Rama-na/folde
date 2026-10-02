import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
const PORT = 3390, ORIGIN = `http://127.0.0.1:${PORT}`, OUT = process.argv[2];
const FIX = join(process.cwd(), "tests", "fixtures");

async function main() {
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
  const server = spawn("node", [".next/standalone/server.js"], { env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(ORIGIN)).ok) break; } catch {} await new Promise(r => setTimeout(r, 400)); }
    const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

    await page.goto(ORIGIN); await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/m1-empty.png` });

    await page.setInputFiles('input[type="file"]', [join(FIX, "scan-300dpi.pdf"), join(FIX, "text.pdf")]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/m2-limit.png` });

    await page.getByRole("button", { name: /^5 MB/ }).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/m3-chosen.png` });

    await page.getByRole("button", { name: "Make it fit" }).click();
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${OUT}/m4-working.png` });

    await page.getByRole("heading", { name: /email(s)? to send/ }).waitFor({ timeout: 180000 });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${OUT}/m5-done.png` });

    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log("horizontal overflow:", over);
    await ctx.close();

    const d = await browser.newContext({ viewport: { width: 1180, height: 900 } });
    const p2 = await d.newPage();
    await p2.goto(ORIGIN);
    await p2.setInputFiles('input[type="file"]', [join(FIX, "scan-300dpi.pdf"), join(FIX, "text.pdf")]);
    await p2.getByRole("button", { name: /^5 MB/ }).click();
    await p2.waitForTimeout(900);
    await p2.screenshot({ path: `${OUT}/d1-desktop.png` });
    await d.close();
    await browser.close();
  } finally { server.kill(); }
}
main();
