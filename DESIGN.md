# ReadyPDF — design language

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
| `stage` | `#080b11` | `#111825` | the one inverted panel, on the measured claim |
| `stage-ink` / `-soft` / `-edge` | — | — | text and hairlines on that panel |
| `stage-accent` / `-fits` | `#6f8dff` / `#4ade80` | same | accent and green **at the value a dark ground requires** |

The stage exists because a glow is light added to darkness: on `canvas` the neon pass
reads as a smudge. It keeps the dark theme's accent and green in both themes because
the panel is dark in both — cobalt on that ground is 2.8:1 and the light green is
3.6:1, so neither passes. Still one accent; the same accent at a legible value. Used
once, because a second inverted panel makes it a style rather than an emphasis.

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
| The neon pass over the measured claim | transformation | A reading being taken — a scanner head crossing a page, lighting what it has read |
| The phone action bar rising on arrival | feedback | It is a new control appearing under the thumb; 24px and 250ms, once |
| The step rail filling | feedback | The only answer on screen to "how much of this is left" |
| The chosen limit sliding between tiles | organisation | A mark that travels says "this instead of that"; two borders fading says nothing |
| The tab underline sliding | organisation | Same move, same reason, one level up |
| The limits fading when the tab changes | transformation | Four numbers changing in place reads as four typos, not as a different question |

Everything else is a 150ms CSS transition on a state change.

Things that were considered and are **not** here: parallax, particle fields, aurora
or gradient backgrounds, magnetic buttons, cursor followers, marquees, anything that
loops, and section bands that rise into view. The last one was built and removed —
a section sliding up 16px communicates that a section exists.

The neon pass (`components/motion/NeonReveal.tsx`) is the closest thing here to an
effect for its own sake, and it is allowed on one condition: it is a **measuring
pass**, not a sweep. It crosses the claim about measurement at the moment that claim
is made, and what is behind it is lit because it has been read. Move it somewhere it
does not mean that and it is decoration, and it goes. It runs once, never on a loop,
and it is not built at all under a reduced-motion or Save-Data budget.

**A reveal is a way of hiding something first**, which makes it the only effect on
the site that can leave the page worse than it found it — an observer that never
fires, a tab restored mid-sweep, and the claim sits under a wash nobody can read. So
the overlays are removed from the tree when the pass completes rather than left at
zero opacity, and the suite asserts both that and the contrast of what was lit.

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
- **A phone gets one step at a time and one action, pinned.** Most of this product is
  used in a phone browser, and a phone was getting the desktop page stacked: drop
  zone, tabs, four limit cards, a custom input, a plan, a progress card and a file
  list, all the same weight, with the button that does the work wherever the column
  put it. Steps are *derived* from what has happened — files or no files, working or
  not, finished or not — so there is no wizard to get out of step with reality.
  Desktop keeps the two-column surface; it has the room and the thumb is not a
  constraint.
- **The drop zone shrinks once it has done its job.** A 270px hero asking for files
  you have already given it held the top of a desktop screen and pushed the size
  picker most of the way down the viewport. With files loaded it is a 44px "Add
  more files" row, still a full drop target.
- **The right column carries something at every step, or it is not a column.** Three
  files is three rows, and under them the aside emptied out for a thousand pixels
  while the page read as one narrow strip on a wide screen. The base64 explainer now
  stays below the file list rather than being swapped out for it — "why is my 4.7 MB
  email bouncing" is a live question *while* choosing between 5 and 25 MB, not only
  before anything is loaded.
- **One element, two positions — never two elements.** The action bar is fixed on a
  phone and inline on desktop, and it is the same button. Two buttons with one name
  in one document is ambiguous for a screen reader and for anything else reading the
  page, and it is a second thing to keep in sync.
- No row of three equal cards. Where a section has parts, they are asymmetric,
  because they are asymmetric in the product.
- **A card is for hierarchy, not for grouping.** The target picker was four bordered
  boxes stacked down the screen — a tab bar, a paragraph, four identical 110px cards
  and a custom input — every one of them the same white rectangle on a near-white
  page, so nothing looked more important than anything else. It is one panel now,
  divided by hairlines, and the limits are 64px tiles. A list of four equivalent
  choices has no hierarchy, so it gets no boxes.
- **One thing per screen is allowed to be the point.** On the results screen that is
  the measured size, at `2.75rem`. The size it started at is context and sits above
  it at body size with the arrow. Before and after at the same scale made the arrow
  the centre of the composition, and at 390px wrapped it to the end of the first
  line, pointing at nothing.
- **A fixed bar must never trap a control.** Enforced in `test:browser`: at the very
  bottom of the page, where nothing can be scrolled out from under it, no other
  control may overlap the bar.
- **A fixed bar is opaque.** It was `bg-canvas/85` with a backdrop blur, and in a
  screenshot the tool list underneath showed through as ghost text directly behind
  "Make it fit". Frosted glass only reads as glass when there is something worth
  seeing through it. Solid bar, eight pixels of gradient above it, so the column
  visibly runs under rather than being smeared into it.
- **A fixed bar has no bottom margin.** `space-y-*` in Tailwind v4 is a
  `margin-block-end` on every child but the last, and a bottom margin on a
  bottom-anchored fixed element lifts it clear of the screen edge. The bar sat 24px
  high for a whole session with `position: fixed; bottom: 0` computing exactly as
  written. `test:browser` now asserts the bar is flush.
- **Say what the button will do, next to the button.** The plan sentence — "2 emails
  instead of 3" — used to be a card further up the column, which on a phone put it
  underneath the fixed bar at the exact moment it appeared. It is the bar's own
  caption now, and still a `role="status"`, because it is a description of that
  button rather than a fact about the page.

## Naming what does not exist yet

Three features are coming that change this page: sending on the user's behalf,
PDF→Word, and a share link. The page has to make sense with them in it, or it gets
redesigned twice.

- **They are named in exactly two places**, and both are places somebody is already
  thinking about them: `components/Roadmap.tsx`, last in the column, under everything
  that works; and the note after the batches on the results screen, where somebody
  has just been told to attach three emails by hand.
- **Statements, never controls.** CLAUDE.md forbids placeholder buttons and it is
  right to — a button that does nothing teaches people the interface lies.
- **Not in the target picker.** Two things were tried there and taken back out. A
  third tab, "Send it for me", left that tab selected at the top while "Make it fit ·
  under 10 MB" stayed live at the bottom: a destination the product cannot reach is
  not a destination. A disclosure row under the limits only repeated the roadmap two
  screens below. The picker answers one question.
