# Snug — engineering rules

## What this is

Snug has one job: **you name a size limit, Snug guarantees the files land under it.**

Two shapes of the same job:

- **Portal uploads** — a government or institutional form that rejects anything over
  200 KB. One file, a hard cap, and a rejection with no useful error message.
- **Email attachments** — a pile of documents that has to reach someone whose mail
  system caps attachments at 5 MB.

It is **not** a PDF tools site. There is no editor, no signing, no annotation, no
PDF→Word. Those are the crowded part of the market and they are deferred until the
wedge is proven. If a change would be at home on iLovePDF, it does not belong here yet.

## Correctness rules

These are the product. Breaking one is a bug even if the UI looks fine.

- **Never compress a file that already meets the target.** Emit the original bytes
  untouched. Re-encoding a 40 KB file to hit a 200 KB cap destroys quality for nothing.
- **Never report an estimated output size.** Measure the real bytes of the real output
  and assert `≤ target` before showing a number. Estimates are how users discover at
  the portal that the file was never small enough.
- **Never fail silently.** If the target cannot be met even at the bottom rung, say so
  and show the closest achievable size. Guessing is worse than refusing.
- **Mail targets are budgeted after base64 inflation, not at the nominal cap.** Mail
  servers measure the encoded MIME message: a 5 MB cap is ~3.6 MB of actual files.
  Use `lib/bytes.ts`; never compare raw file sizes against a mail cap directly.
- **Never produce split-volume archives.** No `.zip.001` / `.zip.002`. Sequential split
  archives are a malware-delivery signature and get quarantined by Gmail's outbound
  filter and most corporate inbound filters. Every output Snug produces opens on its own.
- **Prefer loose attachments over ZIP.** Many government and enterprise mail systems
  block `.zip` outright. ZIP is opt-in, never the default.
- **Climb the compression ladder no further than needed.** Rasterizing a PDF destroys
  text selection and searchability; it is a last resort and requires an explicit,
  visible warning — never applied silently.

## Privacy

- Browser-side by default. Nothing leaves the device unless the user chose a feature
  that requires it (sending via Snug, share links, or a file too large for device RAM).
- **Never upload document contents without the UI saying so, in that moment.** Not in a
  privacy policy — on the screen, before it happens.
- No account required to do the work.

## Architecture

- TypeScript strict. No `any` in `modules/`.
- Business logic lives in `modules/`, never in components. Components are
  presentational; if a component computes a size, that belongs in a module.
- Heavy processing goes in a Web Worker (`workers/`). The main thread must stay
  responsive with 40+ files queued.
- `lib/presets.ts` is the single source of truth for every size target. Do not hardcode
  a byte number anywhere else.
- `lib/brand.ts` holds the product name. Do not type "Snug" into copy.
- Licensing: this project uses **permissively licensed** libraries only (`pdf-lib` MIT,
  `pdfjs-dist` Apache-2.0, `fflate` MIT, `sharp` Apache-2.0). Ghostscript and MuPDF are
  AGPL — do not add either, in any form including WASM, without an explicit decision
  from the owner to buy a commercial licence from Artifex.

## Testing

- Tests are `tsx` scripts under `scripts/test-*.ts`, wired to npm scripts. Do not
  introduce jest or vitest — this matches the sibling Thinnai repo.
- Every operation in `modules/shrink` and `modules/pack` has a test.
- The shrink tests run the committed fixture corpus in `tests/fixtures/` against every
  preset, and assert the target was met or honestly refused.

## Quality

- No placeholder buttons. No demo-only functionality. No hardcoded sample documents.
- Handle large files, mobile browsers, cancellation, and failure — a phone running out
  of memory on file 38 of 42 is a normal case, not an edge case.
- Always show a real file size before download.
