"use client";

import { FileDoc, LinkSimple, PaperPlaneTilt, type Icon } from "@phosphor-icons/react";

/**
 * What is being built, named before it exists.
 *
 * Every one of these is a real decision already written down — the Gmail route and
 * the account it needs are in ARCHITECTURE.md, the two halves of PDF→Word and why
 * the browser one can only be a text draft are in README. None of them is a guess
 * about what might be nice.
 *
 * The reason to show them at all is that the page has to make sense with them in
 * it. A product that grows a paid send button, a converter and a share link next
 * quarter and shows no sign of it today gets redesigned twice: once now and once
 * when they land. Saying where they go reserves the space, and it answers the
 * question somebody has after their third hand-attached email, at the moment they
 * have it.
 *
 * Statements, not controls. CLAUDE.md forbids placeholder buttons and it is right
 * to: a button that does nothing teaches people the interface lies. There is
 * nothing here to press, nothing to sign up to, and nothing that pretends the
 * feature is one click away.
 */

interface Planned {
  icon: Icon;
  label: string;
  detail: string;
}

const PLANNED: Planned[] = [
  {
    icon: PaperPlaneTilt,
    label: "Have them sent for you",
    detail:
      "Name a recipient; the parts go out as however many emails it takes, from your own Gmail. The one feature that needs an account, because it is the one that cannot happen on your device.",
  },
  {
    icon: FileDoc,
    label: "PDF to Word",
    detail:
      "On the device it can honestly be a text draft. The libraries that keep real layout are server-side, and the one built for browsers is 78 MB — a joke in a product about saving 200 KB.",
  },
  {
    icon: LinkSimple,
    label: "A link instead of an attachment",
    detail:
      "For a file no amount of compression will get under the cap. It means the document leaves your device, so it arrives with a screen that says so first.",
  },
];

export function Roadmap() {
  return (
    <section aria-labelledby="coming-next" className="pt-2">
      <h2 id="coming-next" className="text-sm font-semibold text-ink-soft">
        Being built next
      </h2>
      <ul className="mt-3 space-y-3">
        {PLANNED.map(({ icon: Glyph, label, detail }) => (
          <li key={label} className="flex items-start gap-3">
            <Glyph
              size={17}
              weight="regular"
              aria-hidden
              className="mt-0.5 shrink-0 text-ink-soft"
            />
            <div className="min-w-0">
              <h3 className="text-sm font-medium">{label}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                {detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        Everything that works today runs on your device and is free. None of it is
        moving behind a login.
      </p>
    </section>
  );
}
