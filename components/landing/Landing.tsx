"use client";

import {
  ArrowUp,
  DeviceMobile,
  EnvelopeSimple,
  UploadSimple,
} from "@phosphor-icons/react";
import { formatBytes } from "@/lib/bytes";
import { BRAND } from "@/lib/brand";
import {
  MAIL_BUDGETS,
  MEASURED,
  PORTAL_DOCUMENT,
  PORTAL_PHOTO,
  STORY,
} from "@/lib/story";
import { NeonReveal } from "@/components/motion/NeonReveal";
import { Sequence } from "@/components/landing/Sequence";
import { SmoothScroll } from "@/components/landing/SmoothScroll";

/**
 * Everything below the drop zone.
 *
 * The drop zone stays first on purpose. Somebody who arrives twenty minutes before a
 * portal closes should not have to scroll past an argument to reach the thing that
 * helps them, so none of this is above it and all of it disappears the moment a file
 * is added.
 *
 * What is here is the case for trusting it, in the order somebody actually asks:
 * what does it do to my files, has anyone checked, why did my email bounce in the
 * first place, where do my documents go, and what is it not going to do.
 *
 * ## What was wrong with the first version
 *
 * Every band was a 672px box, centred, stacked, with the same eyebrow → heading →
 * prose shape and the same 112px gap. On a 1280px screen that is a narrow ribbon
 * with three hundred pixels of void either side — and because the page above it is
 * 1024px wide, the content visibly *narrowed* after the hero, which reads as a
 * mistake rather than a choice. Worse, with every section the same width, the same
 * ground and the same weight, nothing on the page was more important than anything
 * else, including the one claim the whole product rests on.
 *
 * So there are now three measures rather than one — the full container, a prose
 * column inside it, and one band that breaks out to the full width of the window —
 * and the bands compose differently from each other. The rule is unchanged: a
 * difference on this page has to mean a difference in the product.
 */
export function Landing() {
  return (
    <div className="mt-4">
      <SmoothScroll />
      <Sequence />
      <Measured />
      <TheRealBudget />
      <TwoJobs />
      <OnYourDevice />
      <NotThis />
      <BackToTop />
    </div>
  );
}

/**
 * A band of the page. Deliberately not animated.
 *
 * This did rise into view on scroll, and it was the only motion down here that was
 * not the sequence explaining something. Two reasons it went:
 *
 * The stated rule for this page is that movement communicates organisation,
 * transformation or sending, and a section sliding up 16 pixels communicates that a
 * section exists. That is decoration, and the brief was explicit about not having
 * any.
 *
 * The other reason is sharper. Entering from `opacity: 0` means the server ships
 * markup that is invisible until a script runs and an observer fires. On the
 * audience this is built for — mid-range phones, patchy data, a static export served
 * from a CDN — "until the script runs" is sometimes "never", and the failure mode is
 * a landing page that renders nothing at all.
 *
 * `max-w-5xl` matches the working surface above, so the page is one column width
 * from the wordmark to the footer. `tone="surface"` breaks a band out to the full
 * window on a lighter ground — the page's only change of ground besides the stage,
 * and deliberately a quiet one: `surface` against `canvas` is a hairline of
 * difference in either theme, which is enough to end a run of identical sections
 * without turning into a stripe.
 */
function Band({
  children,
  tone = "canvas",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "canvas" | "surface";
  className?: string;
}) {
  if (tone === "surface") {
    return (
      <section
        className={`mt-20 w-full border-y border-edge bg-surface py-14 sm:mt-28 sm:py-20 ${className}`}
      >
        <div className="mx-auto w-full max-w-5xl px-5">{children}</div>
      </section>
    );
  }
  return (
    <section
      className={`mx-auto mt-20 w-full max-w-5xl px-5 sm:mt-28 ${className}`}
    >
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-accent">{children}</p>;
}

/**
 * One heading size for the whole page, so the only thing larger than a section
 * heading is the measured number.
 *
 * Worth being strict about: half the sections had an inline size and half used this
 * helper, and two different section headings on one page reads as a mistake rather
 * than as a hierarchy.
 */
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl lg:text-[2.5rem] lg:leading-[1.08]">
      {children}
    </h2>
  );
}

/**
 * The number, with where it came from.
 *
 * A figure on a landing page is worth nothing without its provenance, so the
 * provenance sits beside it rather than under it: on a wide screen the claim and
 * the receipt are read in one movement.
 *
 * These are read from `lib/story.ts`, which holds what the committed corpus actually
 * produced under `npm run test:browser` — a suite that fails the build if any batch
 * comes out over the cap.
 *
 * This is the one thing on the page allowed to be large. It was previously the same
 * size as four other sections, in the same box, a third of the way down, which made
 * the strongest asset the product has indistinguishable from a feature blurb.
 */
function Measured() {
  return (
    <Band className="mt-14 sm:mt-20">
      {/*
        The one panel on the site that is lit rather than printed. The bar crosses
        the claim just before the eye settles on it, which is the reading being
        taken — the same thing the paragraph beside it says in words.

        The eyebrow stays a direct child of the panel. `assertNeonClears` finds it by
        text, takes its `parentElement` as the lit ground, and scores every run of
        text underneath that element against it — so wrapping it in a column would
        hand the check a transparent background and half the words, and it would go
        on passing while measuring almost nothing.
      */}
      <NeonReveal className="p-6 text-stage-ink sm:p-10">
        <p className="text-sm font-medium text-stage-accent">
          Measured, not estimated
        </p>

        <div className="mt-5 grid gap-7 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-start lg:gap-14">
          <div>
            <p className="tabular">
              <span className="block text-lg font-medium text-stage-soft">
                {formatBytes(MEASURED.before)}{" "}
                <span aria-hidden className="text-stage-soft/60">
                  →
                </span>
              </span>
              <span className="mt-1 block text-[3.25rem] font-semibold leading-none tracking-tight text-stage-fits sm:text-6xl lg:text-7xl">
                {formatBytes(MEASURED.after)}
              </span>
            </p>
            <p className="tabular mt-4 text-sm text-stage-soft">
              {MEASURED.files} files · under {formatBytes(STORY.cap)} ·{" "}
              {MEASURED.emails} emails
            </p>
          </div>

          <div className="space-y-3 leading-relaxed text-stage-soft">
            <p>
              Scans, forms and camera photographs, brought under a{" "}
              {formatBytes(STORY.cap)} attachment limit and packed into{" "}
              {MEASURED.emails} emails. That run happens on every change to this
              codebase, in a real browser at phone width, and the build fails if a
              single batch comes back over the limit.
            </p>
            <p>
              Which is the whole promise. Nothing here reports a size it has not
              weighed: the output bytes are counted, checked against your number,
              and only then shown to you. If a file cannot reach the limit, it says
              so and tells you the closest it got.
            </p>
          </div>
        </div>
      </NeonReveal>
    </Band>
  );
}

/**
 * Why a 4.7 MB email bounces off a 5 MB limit.
 *
 * The one genuinely surprising fact this product knows, and the reason most people
 * end up here having already tried. It gets the page's only change of ground,
 * because it is the only section that is news rather than reassurance.
 *
 * One wide statement and one narrow table, rather than the row of equal cards that
 * every other page in this category runs.
 */
function TheRealBudget() {
  return (
    <Band tone="surface">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-14">
        <div>
          <Eyebrow>The part nobody tells you</Eyebrow>
          <div className="mt-3">
            <Heading>
              A {formatBytes(STORY.cap)} limit is not {formatBytes(STORY.cap)} of
              files.
            </Heading>
          </div>
          <div className="mt-5 max-w-prose space-y-3 leading-relaxed text-ink-soft">
            <p>
              Attachments travel encoded, not raw. The encoding adds about a third
              on top, and then headers and boundaries take a little more. Your mail
              server measures the result — so the files themselves have to come in
              well under the number you were given.
            </p>
            <p>
              This is why a carefully-trimmed email bounces with no useful
              explanation, and why compressing to exactly the limit is the one
              thing guaranteed not to work. {BRAND.name} budgets after the
              inflation, every time.
            </p>
          </div>
        </div>

        {/*
          The table is the evidence, so it is the one element here with an edge
          around it. Numbers rather than prose, in the mono face, because the point
          is that these are two different quantities and the gap between them is
          bigger than anybody expects.
        */}
        <div className="overflow-hidden rounded-[12px] border border-edge bg-canvas lg:self-start">
          <p className="border-b border-edge px-4 py-2.5 text-xs font-medium text-ink-soft">
            What the limit really carries
          </p>
          <ul className="divide-y divide-edge">
            {MAIL_BUDGETS.map((budget) => (
              <li
                key={budget.id}
                className="flex items-baseline justify-between gap-3 px-4 py-3"
              >
                <span className="tabular text-sm text-ink-soft">
                  {formatBytes(budget.cap)}
                </span>
                <span aria-hidden className="text-ink-soft/50">
                  →
                </span>
                <span className="tabular text-base font-semibold">
                  {formatBytes(budget.carries)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Band>
  );
}

/**
 * The two jobs, which are genuinely two different pieces of arithmetic.
 *
 * Not a feature grid — and until this pass, not what the comment above it claimed
 * either. It said the two were "asymmetric on the page because they are asymmetric
 * in the product" while the CSS underneath read `1fr 1fr` and gave them identical
 * cards: the exact row-of-equal-boxes this page is supposed to avoid, with a
 * paragraph insisting otherwise.
 *
 * They are different shapes now because they are different problems. A portal is one
 * file against one hard number, so it is one panel with the number in it. Mail is a
 * pile of consequences — what bounces, what a filter quarantines, what happens to a
 * document too big to send even alone — so it is a column of separate statements
 * with hairlines between them.
 */
function TwoJobs() {
  return (
    <Band>
      <Eyebrow>Two jobs</Eyebrow>
      <div className="mt-3">
        <Heading>
          Both of them are the same question, asked by different software.
        </Heading>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
        <div className="rounded-[12px] border border-edge bg-surface p-5 sm:p-6">
          <UploadSimple
            size={20}
            weight="regular"
            className="text-accent"
            aria-hidden
          />
          <h3 className="mt-3 font-semibold">A form that rejects your upload</h3>
          <p className="tabular mt-4 flex items-baseline gap-2 text-2xl font-semibold tracking-tight">
            {formatBytes(PORTAL_DOCUMENT.bytes)}
            <span className="text-sm font-normal text-ink-soft">
              or {formatBytes(PORTAL_PHOTO.bytes)} for a photograph
            </span>
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            UPSC, SSC, RRB, IBPS, state portals, university admissions — and
            almost never an error message that says which number applies. Pick it,
            or type in the one your form gives.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Photographs come back as JPEG, named to match, and never scaled below
            what those forms accept. A file that hits the byte target and is too
            small to submit has solved nothing.
          </p>
        </div>

        <div className="lg:pt-1">
          <EnvelopeSimple
            size={20}
            weight="regular"
            className="text-accent"
            aria-hidden
          />
          <h3 className="mt-3 font-semibold">An inbox that bounces your reply</h3>
          <dl className="mt-4 divide-y divide-edge border-y border-edge">
            {[
              [
                "Split the way the server counts",
                "A pile of documents becomes messages that will actually arrive, each weighed encoded, each one complete on its own.",
              ],
              [
                "Loose attachments, not a ZIP",
                "A lot of corporate and government mail drops ZIPs outright. Never multi-part archives — those look like malware delivery to a filter and get quarantined accordingly.",
              ],
              [
                "Too big to send even alone",
                "A document that cannot travel whole is divided by page into whole PDFs that each open on their own. Nothing for anybody to reassemble.",
              ],
            ].map(([term, detail]) => (
              <div key={term} className="py-3.5">
                <dt className="text-sm font-medium">{term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Band>
  );
}

/**
 * The privacy promise, with no box around it.
 *
 * It used to sit in the same bordered card as the feature sections, which quietly
 * filed the one unconditional thing this product says alongside "merge into one
 * PDF". A promise is not a feature. It gets the bare canvas and the room instead.
 */
function OnYourDevice() {
  return (
    <Band>
      <DeviceMobile
        size={24}
        weight="regular"
        className="text-accent"
        aria-hidden
      />
      <div className="mt-4">
        <Heading>Your documents do not leave your device.</Heading>
      </div>
      <div className="mt-6 grid gap-x-14 gap-y-3 leading-relaxed text-ink-soft lg:grid-cols-2">
        <p>
          The compression runs in your browser, on your phone or laptop, in a
          background thread. Nothing is uploaded, so there is no server holding
          your Aadhaar, PAN or salary slips — not briefly, not encrypted, not at
          all.
        </p>
        <p>
          There is no account and nothing is saved. Close the tab and the work is
          gone, which is deliberate: browser storage on a shared or family phone is
          the wrong place for somebody&apos;s identity documents.
        </p>
      </div>
    </Band>
  );
}

/**
 * What it will not do, said before anybody has to find out.
 *
 * A page that lists capabilities it does not have is the worst kind of dishonest,
 * and the same page can afford to say what it is not for — the audience arriving
 * here has been burned by exactly that, on the sites they tried first.
 */
function NotThis() {
  return (
    <Band>
      <Heading>The usual tools are here. The limit is the point.</Heading>
      <div className="mt-5 grid gap-x-14 gap-y-3 leading-relaxed text-ink-soft lg:grid-cols-2">
        <p>
          Merge, reorder, rotate, take out pages, photos into a PDF and pages back
          out as photos, a password on or off. You will not find them in a grid of
          twenty-four tiles, because you should not have to pick a tool before the
          site has seen your files. Drop them first and it offers the ones that
          apply: six PDFs can be merged, one page cannot be split.
        </p>
        <p>
          What none of the other sites will do is tell you, before you submit
          anything, whether the file is genuinely under your limit, and what to do
          when it cannot get there. That is still the front door here, and
          everything else sits underneath it.
        </p>
      </div>
    </Band>
  );
}

function BackToTop() {
  return (
    <div className="mx-auto mt-16 w-full max-w-5xl px-5 sm:mt-20">
      <a
        href="#drop"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] bg-accent px-5 font-medium text-accent-ink transition-transform duration-150 hover:opacity-90 active:scale-[0.98]"
      >
        <ArrowUp size={16} weight="bold" aria-hidden />
        Start with your files
      </a>
    </div>
  );
}
