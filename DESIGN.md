# Snug — design language

## Feeling

People arrive here stressed. They are minutes from a portal deadline, or they have
been told for the third time that their email bounced. Many are uploading Aadhaar,
PAN, salary slips — documents they are nervous about handing to a website.

So the product should feel **calm, warm and certain**. Not clinical, not clever, not
"powered by AI". The emotional payload of the whole product is one moment: the number
turns green and it definitely fits.

Reference points: the quiet confidence of a well-made utility. Not Adobe. Not an SEO
tools site with eleven ad slots.

## Canvas

Warm, not grey. Grey reads as enterprise software; warm reads as trustworthy.

| Token | Light | Role |
|---|---|---|
| `--canvas` | `#fdfcfa` | page ground, warm off-white |
| `--surface` | `#ffffff` | cards, the file list |
| `--edge` | `#e8e3dc` | hairlines — never a shadow where a line will do |
| `--ink` | `#1a1714` | body text, warm near-black |
| `--ink-soft` | `#6b635a` | secondary text, file metadata |
| `--accent` | `#c2650a` | the single brand voltage — amber, warm, confident |
| `--accent-ink` | `#ffffff` | text on accent |
| `--fits` | `#2f7d32` | "it fits" — used ONLY for a verified size result |
| `--wont` | `#a8321f` | "cannot hit this target" — honest refusal |

Dark mode mirrors this with the same roles: `#141210` canvas, `#1e1b18` surface,
`#f5f1ec` ink, and the accent lifted to `#e8873a` for contrast on dark.

One accent colour. If a second colour appears, it is carrying meaning (`--fits`,
`--wont`), never decoration.

## Type

System stack. No webfont. The audience is largely on mid-range Android over patchy
mobile data, and a 200 KB font file to render a page about saving 200 KB is absurd.

```
font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```

- Display: 28–36px, weight 600, letter-spacing -0.02em
- Body: 15–16px, weight 400, line-height 1.55
- **File sizes always use `font-variant-numeric: tabular-nums`.** Sizes sit in columns
  and jump as they recompute; proportional digits make that jitter unreadable.

## Rules

- **Mobile-first, always.** Design the 390px view first. Minimum touch target 44px.
- **Sizes are the hero.** The biggest number on any screen is a file size. It is the
  thing the user came for.
- A size that has been **measured** looks different from one still being computed.
  Never let an in-progress number look settled.
- Hairlines over shadows. One shadow is permitted in the whole product: the drag-over
  state of the drop zone.
- Radius: 10px on cards and buttons, 14px on the drop zone. Nothing fully round.
- Motion: 150ms ease-out on state changes, and nothing else. No decorative animation
  while the user is waiting on a deadline.
- **Never show a progress bar that does not track real progress.** A fake bar during a
  60-second compression is a lie the user can feel.
