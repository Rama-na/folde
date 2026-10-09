/**
 * Put pdf.js's worker somewhere the browser can actually fetch it.
 *
 * `new URL("pdfjs-dist/...", import.meta.url)` looks like it should work and does
 * not: a bare package specifier inside `new URL` is not resolved by the bundler, so
 * the request 404s. pdf.js then quietly falls back to its "fake worker" mode and
 * runs the entire renderer inline on the calling thread — which does not fail, it
 * just becomes slow enough to look like a hang.
 *
 * Copying the file into public/ and pointing at it by absolute path is the boring
 * arrangement that works. The copy is gitignored, so it has to be made by the build.
 *
 * Wired into `prebuild`, `prebuild:static` AND `prebuild:server`, because npm keys
 * its pre-hooks to the exact script name: `prebuild` runs before `build` and before
 * nothing else. The deploy command is `npm run build:static`, so for as long as that
 * was the only hook, every deployed build shipped without this file. It does not
 * fail — pdf.js 404s, falls back to its inline "fake worker" and runs the whole
 * renderer on the main thread, which is indistinguishable from the app hanging on a
 * mid-range phone. `scripts/test-static.ts` now asserts the file is in the export.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const entry = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const source = join(dirname(entry), "pdf.worker.min.mjs");
const target = join(process.cwd(), "public", "pdf.worker.min.mjs");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`pdf.js worker -> ${target}`);
