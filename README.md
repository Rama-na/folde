# Snug

**Your files, under the limit.**

You name a size limit. Snug guarantees the files land under it.

Two shapes of the same job:

- **Portal uploads** — a form that rejects anything over 200 KB and gives no useful
  error. UPSC, SSC, RRB, IBPS, Aadhaar services, NEET, JEE, state e-service portals.
- **Email attachments** — a pile of documents that has to reach someone whose mail
  system caps attachments at 5 MB.

It is not a PDF tools site. There is no editor, no signing, no annotation, no
PDF→Word. Those are the crowded part of the market; this is the part nobody does.

Everything runs in the browser. Documents are never uploaded.

## The two things that make it work

**A "5 MB limit" is not 5 MB of files.** Mail servers measure the encoded MIME
message, and base64 inflates every attachment by about 37% before headers. A 5 MB
cap is really about 3.5 MB of files; Gmail's 25 MB is about 17.8 MB. Tools that
target the nominal number produce a "4.7 MB" email that bounces — on the wire it
weighs 6.4 MB. `lib/bytes.ts` budgets against what the server actually measures.

**Split archives don't arrive.** A run of `.zip.001`, `.zip.002` attachments is a
malware-delivery signature: Gmail's outbound filter and most corporate inbound
filters delay or quarantine them, and a missing part is discovered only when
reassembly fails. Plenty of government and enterprise systems reject `.zip` outright.
So Snug never produces split volumes, and attaches files loosely by default. Every
batch is complete and openable on its own.

## What it takes

PDFs, JPEGs and PNGs — detected from the bytes, not the extension, because phones and
scanner apps routinely write a file whose name does not match it. Images come back as
JPEG (what portals specify) with their name changed to match, never upscaled, and
never shrunk below a pixel floor — a photo that hits 50 KB and is rejected for being
under 200x230 has solved nothing.

HEIC is detected and attempted. Safari decodes it so it works on an iPhone; Chrome
does not, and there it says which iPhone setting fixes it rather than shipping a
multi-megabyte decoder for a case iOS mostly avoids anyway.

## How the shrinking works

A ladder, climbed no further than the target requires:

| Rung | What it does | Cost |
|---|---|---|
| `passthrough` | Already under target — original bytes, untouched | none |
| `lossless` | Object streams, dead objects, metadata | nothing visible |
| `downsample` | Re-encodes embedded JPEGs; text and vectors untouched | some image detail |
| `rasterize` | Renders pages to images | selectable text, permanently |

A search along a single effort curve finds the gentlest setting that still fits.
**Every candidate is really encoded and really measured** — the ladder never reports
a size it has not verified, and when it cannot reach a target it says so in a
sentence rather than returning something too big.

Rung 2 does the real work: a 300 DPI scan reaches the 200 KB portal limit at 96%
smaller with its text still selectable. Images in filters other than JPEG are skipped
rather than risked — a `/Decode` array or a CMYK JPEG would come back inverted, and a
larger file beats a negative of someone's Aadhaar card.

## Layout

```
app/            pages and route handlers
components/     presentational only
modules/
  shrink/       the ladder, the effort curve, the target search
  pack/         batching, budget arithmetic, how hard to shrink
  deliver/      zip, download, Web Share
lib/            brand, presets, byte arithmetic
workers/        the document worker — all heavy work happens here
scripts/        tests and build helpers
tests/fixtures/ generated corpus (npm run fixtures)
```

`lib/presets.ts` is the single source of truth for every size target.

## Running it

```sh
npm install
npm run dev
```

## Deploying it

Snug has no server: no API routes, nothing reads the environment at runtime, and
all the work happens in the browser. `npm run build:static` produces a 3.5 MB
folder of plain files that belongs on a CDN rather than in a container.

See [DEPLOY.md](DEPLOY.md). Short version: Cloudflare Pages, build command
`npm run build:static`, output directory `out`, no environment variables.

## Tests

No jest, no vitest — `tsx` scripts, matching the sibling Thinnai repo.

```sh
npm run test         # bytes, packing, images, and the PDF ladder under Node
npm run test:browser # the server build, driven in Chromium
npm run test:static  # the static export, served as plain files
npm run test:all     # all of it, both build targets
```

`test:browser` ends with the case that started the project: 42 mixed files, 40 MB, at
390px phone width. It currently reaches 9.9 MB in three emails — 4.9, 4.9 and 3.6 MB
on the wire — in about 27 seconds. The pile is generated on first run
(`npm run fixtures:pile`) and gitignored.

`npm run test:browser` is not optional extra coverage. The Node suite says nothing
about the OffscreenCanvas codec, the Web Worker, or pdf.js — and all three have
already shipped bugs that a green Node run happily reported as fine.

## Licensing note

This project uses permissively licensed libraries only: `pdf-lib` (MIT),
`pdfjs-dist` (Apache-2.0), `fflate` (MIT), `sharp` (Apache-2.0).

**Ghostscript and MuPDF are AGPL.** Both compress PDFs very well and both are
tempting. Shipping either as browser WASM is distribution, and running either
server-side as a service triggers AGPL source obligations. Do not add either, in any
form, without a decision to buy a commercial licence from Artifex.

## Not built yet

Sending batches directly via Resend, with delivery receipts. Share links via R2.
Both mean documents reaching a server, so both arrive together with the interface
that says so — see `.env.example`.
