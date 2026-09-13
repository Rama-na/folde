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
 */
function Band({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`mx-auto mt-20 w-full max-w-2xl px-5 sm:mt-28 ${className}`}
    >
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-accent">{children}</p>;
}

/**
 * The number, with where it came from.
 *
 * A figure on a landing page is worth nothing without its provenance, so the
 * provenance is the second half of the sentence. These are read from
 * `lib/story.ts`, which holds what the committed corpus actually produced under
 * `npm run test:browser` — a suite that fails the build if any batch comes out over
 * the cap.
 */
function Measured() {
  return (
    <Band>
      <Eyebrow>Measured, not estimated</Eyebrow>
      <p className="tabular mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xl font-semibold tracking-tight sm:text-4xl">
        <span className="text-ink-soft">{formatBytes(MEASURED.before)}</span>
        <span aria-hidden className="text-ink-soft/50">
          →
        </span>
        <span className="text-fits">{formatBytes(MEASURED.after)}</span>
      </p>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        {MEASURED.files} files — scans, forms and camera photographs — brought
        under a {formatBytes(STORY.cap)} attachment limit and packed into{" "}
        {MEASURED.emails} emails. That run happens on every change to this
        codebase, in a real browser at phone width, and the build fails if a
        single batch comes back over the limit.
      </p>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        Which is the whole promise. Nothing here reports a size it has not
        weighed: the output bytes are counted, checked against your number, and
        only then shown to you. If a file cannot reach the limit, it says so and
        tells you the closest it got.
      </p>
    </Band>
  );
}

/**
 * Why a 4.7 MB email bounces off a 5 MB limit.
 *
 * The one genuinely surprising fact this product knows, and the reason most people
 * end up here having already tried. One wide statement and one narrow table, rather
 * than the row of equal cards that every other page in this category runs.
 */
function TheRealBudget() {
  return (
    <Band>
      <Eyebrow>The part nobody tells you</Eyebrow>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        A {formatBytes(STORY.cap)} limit is not{" "}
        {formatBytes(STORY.cap)} of files.
      </h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] sm:gap-8">
        <div className="space-y-3 leading-relaxed text-ink-soft">
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
        <div className="overflow-hidden rounded-[12px] border border-edge bg-surface">
          <p className="border-b border-edge px-4 py-2.5 text-xs font-medium text-ink-soft">
            What the limit really carries
          </p>
          <ul className="divide-y divide-edge">
            {MAIL_BUDGETS.map((budget) => (
              <li
                key={budget.id}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5"
              >
                <span className="tabular text-sm text-ink-soft">
                  {formatBytes(budget.cap)}
                </span>
                <span aria-hidden className="text-ink-soft/50">
                  →
                </span>
                <span className="tabular text-sm font-medium">
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
 * Not a feature grid. There are two, they are asymmetric on the page because they
 * are asymmetric in the product, and each one names the failure it removes rather
 * than the capability it has.
 */
function TwoJobs() {
  return (
    <Band>
      <Eyebrow>Two jobs</Eyebrow>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        Both of them are the same question, asked by different software.
      </h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[12px] border border-edge bg-surface p-5">
          <UploadSimple size={20} weight="regular" className="text-accent" aria-hidden />
          <h3 className="mt-3 font-semibold">A form that rejects your upload</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            UPSC, SSC, RRB, IBPS, state portals, university admissions. Usually{" "}
            {formatBytes(PORTAL_DOCUMENT.bytes)}, sometimes{" "}
            {formatBytes(PORTAL_PHOTO.bytes)} for a photograph, and almost never
            an error message that says which. Pick the number, or type in the one
            your form gives.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Photographs come back as JPEG, named to match, and never scaled below
            what those forms accept — a file that hits the byte target and is too
            small to submit has solved nothing.
          </p>
        </div>
        <div className="rounded-[12px] border border-edge bg-surface p-5">
          <EnvelopeSimple size={20} weight="regular" className="text-accent" aria-hidden />
          <h3 className="mt-3 font-semibold">An inbox that bounces your reply</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            A pile of documents split into messages that will actually arrive,
            each weighed the way the server weighs it, each one complete on its
            own.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Loose attachments by default, because a lot of corporate mail drops
            ZIPs. Never multi-part archives — those look like malware delivery to
            a filter, and get quarantined accordingly.
          </p>
        </div>
      </div>
    </Band>
  );
}

function OnYourDevice() {
  return (
    <Band>
      <div className="rounded-[12px] border border-edge bg-surface p-5 sm:p-8">
        <DeviceMobile size={22} weight="regular" className="text-accent" aria-hidden />
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          Your documents do not leave your device.
        </h2>
        <div className="mt-4 grid gap-x-8 gap-y-3 leading-relaxed text-ink-soft sm:grid-cols-2">
          <p>
            The compression runs in your browser, on your phone or laptop, in a
            background thread. Nothing is uploaded, so there is no server holding
            your Aadhaar, PAN or salary slips — not briefly, not encrypted, not
            at all.
          </p>
          <p>
            There is no account and nothing is saved. Close the tab and the work
            is gone, which is deliberate: browser storage on a shared or family
            phone is the wrong place for somebody&apos;s identity documents.
          </p>
        </div>
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
      <Eyebrow>What this is not</Eyebrow>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        One job, finished.
      </h2>
      <p className="mt-4 max-w-prose leading-relaxed text-ink-soft">
        No editor, no signing, no annotation, no converting documents into other
        formats. There are a dozen sites for all of that and several are good.
      </p>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
        What none of them will do is tell you, before you submit anything,
        whether the file is genuinely under your limit — and what to do when it
        cannot get there. That is the entire product, and adding the rest would
        only make it harder to trust the part that matters.
      </p>
    </Band>
  );
}

function BackToTop() {
  return (
    <div className="mx-auto mt-20 w-full max-w-2xl px-5 sm:mt-28">
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
