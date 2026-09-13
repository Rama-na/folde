# Snug — design language

## Feeling

People arrive here stressed. They are minutes from a portal deadline, or they have
been told for the third time that their email bounced. Many are uploading Aadhaar,
PAN, salary slips — documents they are nervous about handing to a website.

So the product should feel **calm and certain**. Not clinical, not clever, not
"powered by AI". The emotional payload of the whole product is one moment: the number
turns green and it definitely fits.

Reference points: the quiet confidence of a well-made utility. Not Adobe. Not an SEO
tools site with eleven ad slots.

## Canvas

Cool, not warm. The first build of this was cream, burnt ochre and espresso ink —
which is the single most repeated palette in machine-generated design work, and read
exactly that way. It also put the brand in the same colour family as every competitor
in the category: Adobe, iLovePDF, Smallpdf and PDF24 are all red or orange.

Cobalt reads as infrastructure rather than a tools site, which is the right note for
somebody uploading a PAN card. More usefully it leaves green alone.

| Token | Light | Dark | Role |
|---|---|---|---|
| `canvas` | `#f5f6f8` | `#0b0e14` | page ground, cool bone |
| `surface` | `#ffffff` | `#141922` | cards, the file list |
| `edge` | `#e2e5ea` | `#252c39` | hairlines — never a shadow where a line will do |
| `ink` | `#0f1419` | `#eef1f6` | body text, cool near-black |
| `ink-soft` | `#5b6472` | `#94a0b3` | secondary text, file metadata |
| `accent` | `#2347d9` | `#6f8dff` | the single brand voltage |
| `accent-ink` | `#ffffff` | `#0b0e14` | text on accent |
| `accent-wash` | `#eef1fe` | `#18203a` | the plan, the chosen preset, a packed part |
| `fits` | `#0f7a3d` | `#4ade80` | a size that has been **measured** |
| `wont` | `#c02617` | `#ff7a6b` | an honest refusal |

One accent colour. If a second colour appears it is carrying meaning (`fits`,
`wont`), never decoration — a green brand would blur the only moment that matters.

**`fits` and `wont` are load-bearing token names.** `scripts/test-browser.ts` finds
crash banners with `[class*="border-wont"]`. Rename either and the suite's crash
detector silently matches nothing and passes forever. It caught a real worker crash
once.

Dark mode overrides these variables on `:root` inside a real `@media` query, **not**
in a second `@theme` block. Tailwind v4 hoists `@theme` out of any media wrapper, so
a nested dark theme is not conditional — it simply emits later and wins. The first
version of this file did that, and light mode did not exist for anyone.

## Type

**Geist and Geist Mono**, self-hosted and subset to latin by `next/font`.

The rule used to be "no webfont", on the grounds that a 200 KB font to render a page
about saving 200 KB is absurd. That reasoning still holds, so the font is bought
rather than assumed: latin subset only, and `adjustFontFallback` metric-matches the
system stack so a slow swap costs no layout shift. On Save-Data the fallback renders
and the page is fine.

- Display: 28–42px, weight 600, letter-spacing -0.02em
- Body: 15–16px, weight 400, line-height 1.55
- **Every file size uses `.tabular`**, which is Geist Mono with `tnum`. Sizes sit in
  columns and recompute in place while a job runs; drawn tabular figures hold those
  columns still in a way a synthesised system font cannot.

## Motion language

Motion is not a layer of polish here. It has one job, and everything that does not do
that job is cut.

**Documents are the hero. Every animation communicates organisation, transformation
or sending.** Nothing animates to signal that it exists, has arrived, or is nice.
Concretely, what is allowed to move and why:

| What moves | Which of the three | Why it earns it |
|---|---|---|
| The result number counting down | transformation | The motion *is* the information — "40 MB became 9.9 MB" is the whole payoff |
| Batches entering in sequence | sending | Three emails arriving one after another reads as three things; a block reads as one |
| The drop zone under a drag | — | Feedback on a real pointer state, not decoration |
| Landing cards straightening | organisation | The untidy folder becoming a list |
| Landing sizes falling | transformation | Each file pushed only as far as needed |
| Landing parts closing around rows | sending | The boundary of one message |

Everything else is a 150ms CSS transition on a state change.

Things that were considered and are **not** here: parallax, particle fields, aurora
or gradient backgrounds, magnetic buttons, cursor followers, marquees, anything that
loops, and section bands that rise into view. The last one was built and removed —
a section sliding up 16px communicates that a section exists.

**Never show a progress bar that does not track real progress.** A fake bar during a
60-second compression is a lie the user can feel.

### The adaptive gate

`lib/use-motion-budget.ts` returns `full` or `reduced` from `prefers-reduced-motion`,
Save-Data, and a 2G-class connection.

The hard rule that makes the gate safe: **no information may exist only inside an
animation.** Under `reduced`, counts snap to their final value, staggers are instant,
and the scroll sequence is replaced by its own end state with every figure spelled
out. The browser suite asserts both paths reach identical numbers.

Two consequences that are easy to get wrong and were:

- **Nothing may be invisible until a script runs.** Entering from `opacity: 0` means
  the server ships markup nobody can read until an observer fires. On a static export
  over patchy data, "until" is sometimes "never".
- **A scroll-linked range must stay inside 0…1.** Motion hands transforms that read
  straight from scroll progress to the browser's native animation engine, where the
  input range becomes keyframe offsets. Anything outside 0…1 throws during mount, and
  the error names neither the component nor the transform.

Smooth scrolling (Lenis, MIT) is part of the gate, not a default: it exists so the
scroll-scrubbed sequence reads as one movement rather than a flipbook, and it is
never constructed under `reduced`.

## Layout

- **Mobile-first, always.** Design the 390px view first. Minimum touch target 44px,
  enforced by the pile scenario in `test:browser`, which found 43 that were not.
- **Sizes are the hero.** The biggest number on any screen is a file size.
- A size that has been **measured** looks different from one still being computed.
  Never let an in-progress number look settled.
- Hairlines over shadows. One shadow is permitted in the whole product: the drag-over
  state of the drop zone.
- Radius lock: **12px** on cards and controls, **18px** on the drop zone, and nothing
  fully round. Mixed radii was one of the tells in the first build.
- **The drop zone is the first thing on the page.** The case for the product lives
  below it and disappears entirely the moment a file is loaded — somebody arriving
  twenty minutes before a portal closes should not have to scroll past an argument.
- No row of three equal cards. Where a section has parts, they are asymmetric,
  because they are asymmetric in the product.
