"use client";

import {
  CaretRight,
  FilePdf,
  Images,
  Lock,
  LockOpen,
  Scissors,
  SquaresFour,
  StackSimple,
  type Icon,
} from "@phosphor-icons/react";
import type { AnalysedFile, Offer, ToolId } from "@/modules/tools";
import { offeredTools } from "@/modules/tools";

const ICONS: Record<ToolId, Icon> = {
  fit: StackSimple,
  merge: StackSimple,
  organise: SquaresFour,
  extract: Scissors,
  "to-images": Images,
  "from-images": FilePdf,
  protect: Lock,
  unlock: LockOpen,
};

/**
 * What else these particular files could become.
 *
 * Sits below the size picker, never above it. Fitting a limit is the job people
 * arrived for and it stays one glance from the drop zone; this is the answer to
 * "while I am here", and it is deliberately quieter than the thing above it.
 *
 * The list is short because `offeredTools` has already thrown out everything that
 * does not apply to these files. That is the whole trick, and it is why this is a
 * list of three or four real sentences instead of a grid of twenty-four icons.
 */
export function ToolOffers({
  files,
  onChoose,
}: {
  files: readonly AnalysedFile[];
  onChoose: (tool: ToolId) => void;
}) {
  // "fit" lives above this, in the target picker. Showing it twice would make the
  // page argue with itself about what the main thing is.
  const offers = offeredTools(files).filter((o) => o.id !== "fit" && o.id !== "unlock");
  if (offers.length === 0) return null;

  return (
    <section aria-labelledby="other-tools">
      <h2
        id="other-tools"
        className="text-sm font-semibold"
      >
        Or do something else with {files.length === 1 ? "it" : "them"}
      </h2>
      <ul className="mt-3 overflow-hidden rounded-[12px] border border-edge bg-surface">
        {offers.map((offer) => (
          <li key={offer.id} className="border-b border-edge last:border-b-0">
            <ToolButton offer={offer} onChoose={onChoose} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ToolButton({
  offer,
  onChoose,
}: {
  offer: Offer;
  onChoose: (tool: ToolId) => void;
}) {
  const Glyph = ICONS[offer.id];
  return (
    <button
      type="button"
      onClick={() => onChoose(offer.id)}
      className="flex min-h-[44px] w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-accent-wash"
    >
      <Glyph
        size={18}
        weight="regular"
        aria-hidden
        className="shrink-0 text-accent"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{offer.label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-ink-soft">
          {offer.detail}
        </span>
      </span>
      <CaretRight size={15} weight="bold" aria-hidden className="shrink-0 text-ink-soft" />
    </button>
  );
}

/**
 * A locked document, said before anything else on the page.
 *
 * This one does go above the size picker, because until it is open nothing else
 * offered can touch it — including the thing this product is for. Leaving it in the
 * quiet list below would mean somebody picks a size limit, waits, and is then told
 * their file was never readable.
 */
export function LockedNotice({
  files,
  onChoose,
}: {
  files: readonly AnalysedFile[];
  onChoose: (tool: ToolId) => void;
}) {
  const locked = files.filter((f) => f.locked);
  if (locked.length === 0) return null;

  return (
    <section className="rounded-[12px] border border-wont/40 bg-wont/5 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Lock size={16} weight="fill" aria-hidden className="text-wont" />
        {locked.length === 1
          ? `${locked[0].name} needs a password`
          : `${locked.length} of these need a password`}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        Nothing can read {locked.length === 1 ? "it" : "them"} until the password is
        off, including compressing {locked.length === 1 ? "it" : "them"}.
      </p>
      <button
        type="button"
        onClick={() => onChoose("unlock")}
        className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-[12px] bg-accent px-4 text-sm font-medium text-accent-ink transition-transform duration-150 hover:opacity-90 active:scale-[0.98]"
      >
        <LockOpen size={15} weight="bold" aria-hidden />
        Unlock
      </button>
    </section>
  );
}
