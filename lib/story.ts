import { planBatches, type Batch, type PackItem } from "@/modules/pack";
import { planDelivery } from "@/modules/pack/strategy";
import { MB, rawAttachmentBudget } from "./bytes";
import { MAIL_PRESETS, UPLOAD_PRESETS } from "./presets";

/**
 * The folder the landing page walks through.
 *
 * Six documents, because that is the most a phone screen can hold and still let
 * somebody read a filename. The names are the ones people actually have: a camera
 * roll, a scanner app, and two files somebody renamed by hand at 1am.
 *
 * The sizes here are the only invented numbers on the page. Everything downstream of
 * them — how many emails this needs, how hard each file gets pushed, what each
 * message weighs on the wire — is computed by running the real packer and the real
 * strategy over them, at module load, the same code the app runs on your files.
 *
 * That is deliberate and it is not decoration. A landing page that quotes numbers
 * its own product did not produce is how a marketing claim quietly drifts away from
 * the software, and this one cannot: if the arithmetic in `modules/pack` changes,
 * the illustration changes with it or the tests fail.
 */
const FOLDER: readonly { name: string; size: number }[] = [
  { name: "IMG-20240117-WA0031.jpg", size: 3.1 * MB },
  { name: "Scan_20240116_110248.pdf", size: 4.2 * MB },
  { name: "Aadhaar front.jpeg", size: 2.4 * MB },
  { name: "salary slip jan.pdf", size: 1.1 * MB },
  { name: "IMG-20240117-WA0034.jpg", size: 2.8 * MB },
  { name: "PAN card.pdf", size: 0.9 * MB },
];

export interface StoryFile {
  id: string;
  name: string;
  /** As it sits in the folder. */
  before: number;
  /** What the strategy asks the ladder to reach, or `before` if it is left alone. */
  after: number;
  /** 1-based part this file ends up in. */
  part: number;
}

export interface Story {
  /** The stated mail limit this is told against. */
  cap: number;
  files: readonly StoryFile[];
  totalBefore: number;
  totalAfter: number;
  /** Messages needed if nothing were compressed. */
  partsUntouched: number;
  /** Messages needed after the strategy has had its say. */
  parts: readonly Batch[];
}

export const STORY: Story = buildStory();

function buildStory(): Story {
  // The strictest of the mail presets — the corporate and government servers, which
  // are the ones people actually get bounced by. Never a byte number typed in here.
  const cap = MAIL_PRESETS[0].bytes;

  const items: PackItem[] = FOLDER.map((f, i) => ({
    id: `story-${i}`,
    name: f.name,
    size: Math.round(f.size),
  }));

  const untouched = planBatches(items, { cap });
  const strategy = planDelivery(items, { cap });

  const shrunk: PackItem[] = items.map((item) => ({
    ...item,
    // A null target is the strategy saying this one is already carrying its weight.
    size: strategy.targets.get(item.id) ?? item.size,
  }));
  const packed = planBatches(shrunk, { cap });

  const partOf = new Map<string, number>();
  for (const batch of packed.batches) {
    for (const item of batch.items) partOf.set(item.id, batch.index);
  }

  return {
    cap,
    files: items.map((item, i) => ({
      id: item.id,
      name: item.name,
      before: item.size,
      after: shrunk[i].size,
      part: partOf.get(item.id) ?? 1,
    })),
    totalBefore: items.reduce((n, i) => n + i.size, 0),
    totalAfter: shrunk.reduce((n, i) => n + i.size, 0),
    partsUntouched: untouched.batches.length + untouched.oversized.length,
    parts: packed.batches,
  };
}

/**
 * What the committed fixture corpus actually does, measured.
 *
 * Not a claim — a reading. `npm run test:browser` drives these 42 files through a
 * real browser at 390px on every change, and fails the build if the batches come out
 * over the cap. The figures below are what it printed; the test is what keeps them
 * true. The throughput is deliberately absent, because it is the one number here
 * that depends on whose phone is holding it.
 */
export const MEASURED = {
  files: 42,
  before: 40 * MB,
  after: 9.9 * MB,
  emails: 3,
} as const;

/**
 * What each stated mail limit is actually worth in files.
 *
 * The single most useful thing this product knows, and the one nobody else puts on a
 * page: a mail server weighs the encoded message, so the number in the bounce
 * notice is not the number you have to get under. Computed from `lib/bytes`, for one
 * attachment — the most generous case. Every attachment after the first takes a
 * little more off, which is why a batch of twenty is tighter than this table looks.
 */
export const MAIL_BUDGETS: readonly {
  id: string;
  cap: number;
  carries: number;
  note: string;
}[] = MAIL_PRESETS.map((preset) => ({
  id: preset.id,
  cap: preset.bytes,
  carries: rawAttachmentBudget(preset.bytes, 1),
  note: preset.note,
}));

/**
 * The two portal limits worth naming on a page.
 *
 * Read out of the preset table rather than typed, because `lib/presets.ts` is the
 * only place a byte number is allowed to live — including in copy. A limit quoted in
 * a sentence and a limit offered as a button have to be the same limit, and the only
 * way to guarantee that is for both of them to be the same line of code.
 */
export const PORTAL_DOCUMENT =
  UPLOAD_PRESETS.find((p) => p.id === "upload-200kb") ?? UPLOAD_PRESETS[0];
export const PORTAL_PHOTO =
  UPLOAD_PRESETS.find((p) => p.id === "upload-100kb") ?? UPLOAD_PRESETS[0];
