/**
 * The packer.
 *
 * The load-bearing assertion is the first one: every batch, weighed the way a mail
 * server weighs it, comes in under the cap. Everything else here guards a rule that
 * is easy to break by accident — no file split across batches, nothing silently
 * dropped, and the same input always producing the same plan.
 */
import { MB, formatBytes } from "../lib/bytes";
import {
  type PackItem,
  minimumBatches,
  planBatches,
  weigh,
} from "../modules/pack";
import { largestSendableFile } from "../modules/pack";
import { planDelivery } from "../modules/pack/strategy";

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Deterministic PRNG so a failing case can be reproduced exactly. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function corpus(count: number, seed: number, maxSize: number): PackItem[] {
  const rand = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    id: `f${i}`,
    name: `Document-${String(i + 1).padStart(2, "0")}.pdf`,
    size: Math.max(1_000, Math.round(rand() * maxSize)),
  }));
}

function totalSize(items: readonly PackItem[]): number {
  return items.reduce((n, i) => n + i.size, 0);
}

console.log("\npack: her actual case — 42 documents, 37.6 MB, a 5 MB cap");
{
  // The problem that started the project. Sizes vary the way a real folder does.
  const files = corpus(42, 7, 1_800_000);
  const cap = 5 * MB;
  const plan = planBatches(files, { cap });

  const packed = plan.batches.flatMap((b) => b.items);
  console.log(
    `  ${files.length} files, ${formatBytes(totalSize(files))} -> ` +
      `${plan.batches.length} emails`,
  );
  for (const batch of plan.batches) {
    console.log(
      `    part ${String(batch.index).padStart(2, "0")}: ` +
        `${String(batch.items.length).padStart(2)} files, ` +
        `${formatBytes(batch.rawBytes).padStart(9)} of files, ` +
        `${formatBytes(batch.encodedBytes).padStart(9)} on the wire`,
    );
  }

  check(
    "every batch is under the cap as the mail server weighs it",
    plan.batches.every((b) => b.encodedBytes <= cap),
  );
  check(
    "no file is lost",
    packed.length + plan.oversized.length === files.length,
    `${packed.length} + ${plan.oversized.length} vs ${files.length}`,
  );
  check(
    "no file is duplicated",
    new Set(packed.map((i) => i.id)).size === packed.length,
  );
  check(
    "no file is split across batches",
    packed.every((item) =>
      files.some((f) => f.id === item.id && f.size === item.size),
    ),
    "a partial file appeared in a batch",
  );
  check(
    "batch count is at or near the theoretical minimum",
    plan.batches.length <= minimumBatches(files, cap) + 1,
    `${plan.batches.length} vs minimum ${minimumBatches(files, cap)}`,
  );
}

console.log("\npack: the naive budget would have overflowed");
{
  // Filling each batch to the nominal cap — the way a tool that ignores base64
  // does — produces batches that bounce. This pins that our arithmetic differs.
  const files = corpus(20, 13, 900_000);
  const cap = 5 * MB;
  const plan = planBatches(files, { cap });

  const naiveFit = plan.batches.every((b) => b.rawBytes <= cap);
  check(
    "raw sizes look fine under a naive reading",
    naiveFit,
    "fixture no longer exercises the difference",
  );
  check(
    "but the encoded weight is what we actually budgeted against",
    plan.batches.every((b) => b.encodedBytes > b.rawBytes),
  );
  const worst = Math.max(...plan.batches.map((b) => b.encodedBytes));
  console.log(
    `  heaviest batch: ${formatBytes(worst)} on the wire, cap ${formatBytes(cap)}`,
  );
}

console.log("\npack: a file too big for any batch");
{
  const files: PackItem[] = [
    { id: "a", name: "small.pdf", size: 200_000 },
    { id: "b", name: "enormous.pdf", size: 9 * MB },
    { id: "c", name: "also-small.pdf", size: 300_000 },
  ];
  const plan = planBatches(files, { cap: 5 * MB });

  check(
    "the oversized file is reported, not dropped",
    plan.oversized.length === 1 && plan.oversized[0].id === "b",
  );
  check(
    "the rest are still packed",
    plan.batches.flatMap((b) => b.items).length === 2,
  );
  check(
    "no batch contains the oversized file",
    !plan.batches.some((b) => b.items.some((i) => i.id === "b")),
  );
}

console.log("\npack: zipping trades filter risk for one part's overhead");
{
  const files = corpus(30, 21, 400_000);
  const cap = 5 * MB;
  const loose = planBatches(files, { cap });
  const zipped = planBatches(files, { cap, zip: true });

  check(
    "zipped batches still respect the cap",
    zipped.batches.every((b) => b.encodedBytes <= cap),
  );
  check(
    "zipping never needs more batches than attaching loosely",
    zipped.batches.length <= loose.batches.length,
    `${zipped.batches.length} vs ${loose.batches.length}`,
  );
  check("loose is the default", loose.zipped === false);
  console.log(
    `  30 files: ${loose.batches.length} loose batches, ${zipped.batches.length} zipped`,
  );
}

console.log("\npack: determinism and edges");
{
  const files = corpus(25, 99, 700_000);
  const a = planBatches(files, { cap: 5 * MB });
  const b = planBatches(files, { cap: 5 * MB });
  check(
    "the same input always produces the same plan",
    JSON.stringify(a) === JSON.stringify(b),
  );

  const empty = planBatches([], { cap: 5 * MB });
  check("no files means no batches", empty.batches.length === 0);

  const single = planBatches([{ id: "x", name: "x.pdf", size: 1000 }], {
    cap: 5 * MB,
  });
  check(
    "one small file means one batch",
    single.batches.length === 1 && single.batches[0].items.length === 1,
  );
  check(
    "an empty set weighs nothing",
    weigh([], false) === 0 && weigh([], true) === 0,
  );
}

console.log("\npack: the cap is respected across many random piles");
{
  let worstOver = 0;
  for (let seed = 0; seed < 60; seed++) {
    const cap = [5 * MB, 10 * MB, 20 * MB, 25 * MB][seed % 4];
    const files = corpus(5 + (seed % 45), seed + 1000, 2_500_000);
    const plan = planBatches(files, { cap, zip: seed % 3 === 0 });
    for (const batch of plan.batches) {
      if (batch.encodedBytes > cap) {
        worstOver = Math.max(worstOver, batch.encodedBytes - cap);
      }
    }
    const packed = plan.batches.flatMap((b) => b.items).length;
    if (packed + plan.oversized.length !== files.length) {
      failures += 1;
      console.log(`  FAIL seed ${seed}: files went missing`);
      break;
    }
  }
  check(
    "60 random piles, no batch ever exceeds its cap",
    worstOver === 0,
    `worst overflow ${worstOver} bytes`,
  );
}

console.log("\npack: deciding how hard to shrink");
{
  // Already fits in one email: the strategy must ask for no compression at all.
  const small: PackItem[] = [
    { id: "a", name: "a.pdf", size: 300_000 },
    { id: "b", name: "b.pdf", size: 400_000 },
  ];
  const relaxed = planDelivery(small, { cap: 5 * MB });
  check(
    "a pile that already fits is left completely alone",
    [...relaxed.targets.values()].every((t) => t === null),
  );
  check("and says so plainly", /nothing needs compressing/i.test(relaxed.reason));

  // Her case: 42 files well over the cap. Compression should buy back emails.
  const files = corpus(42, 7, 1_800_000);
  const strategy = planDelivery(files, { cap: 5 * MB });
  check(
    "a heavy pile is given targets",
    [...strategy.targets.values()].some((t) => t !== null),
  );
  check(
    "aiming for fewer emails than doing nothing",
    strategy.targetBatches < strategy.batchesIfUntouched,
    `${strategy.targetBatches} vs ${strategy.batchesIfUntouched}`,
  );
  check(
    "no target asks for less than a fifth of the original",
    files.every((f) => {
      const t = strategy.targets.get(f.id);
      return t === null || t === undefined || t >= f.size * 0.2;
    }),
  );
  console.log(
    `  42 files: ${strategy.batchesIfUntouched} emails untouched -> ` +
      `aiming for ${strategy.targetBatches}`,
  );
  console.log(`  reason: "${strategy.reason}"`);

  // A target that could only be met by destroying the documents is refused: we
  // would rather send another email than hand back something unreadable.
  const huge = corpus(10, 5, 20 * MB);
  const cautious = planDelivery(huge, { cap: 5 * MB });
  check(
    "an impossible squeeze is declined rather than attempted",
    huge.every((f) => {
      const t = cautious.targets.get(f.id);
      return t === null || t === undefined || t >= f.size * 0.2;
    }),
  );

  // The guarantee does not come from the estimate: packing measured results is
  // what keeps batches under the cap even when the estimate was optimistic.
  const achieved = files.map((f) => {
    const t = strategy.targets.get(f.id);
    // Pretend the ladder undershot every target by a little.
    return { ...f, size: t === null || t === undefined ? f.size : Math.round(t * 0.95) };
  });
  const finalPlan = planBatches(achieved, { cap: 5 * MB });
  check(
    "re-packing measured sizes still respects the cap",
    finalPlan.batches.every((b) => b.encodedBytes <= 5 * MB),
  );
  console.log(
    `  after shrinking: ${finalPlan.batches.length} emails ` +
      `(${formatBytes(achieved.reduce((n, i) => n + i.size, 0))} total)`,
  );
}

console.log("\npack: files too big to send alone still get compressed");
{
  // The bug this pins: a file over the cap is excluded from the batches, because
  // it fits in none of them. Counting only what got packed made a 19.6 MB pile
  // read as "already fits in one email" — and the files that most needed
  // shrinking were the very ones left out of the decision.
  const pile: PackItem[] = [
    { id: "big", name: "scan-heavy.pdf", size: 14_200_000 },
    { id: "mid", name: "scan.pdf", size: 5_400_000 },
    { id: "s1", name: "text.pdf", size: 8_800 },
    { id: "s2", name: "notes.pdf", size: 161_800 },
  ];
  const cap = 5 * MB;
  const before = planBatches(pile, { cap });
  check(
    "the two large files are indeed unpackable as they stand",
    before.oversized.length === 2,
    `${before.oversized.length} oversized`,
  );

  const strategy = planDelivery(pile, { cap });
  check(
    "19.6 MB over a 5 MB cap is not called a single email",
    !/already fits in one email/i.test(strategy.reason),
    strategy.reason,
  );
  check(
    "the oversized files are given real targets",
    strategy.targets.get("big") !== null && strategy.targets.get("mid") !== null,
  );

  // Every target must be small enough to travel as a lone attachment, or the
  // file still cannot be sent however the batching falls out.
  const solo = largestSendableFile(cap);
  check(
    "no target exceeds what a lone attachment can weigh",
    [...strategy.targets.values()].every((t) => t === null || t <= solo),
    `solo budget ${formatBytes(solo)}`,
  );

  // And the plan has to actually work once the ladder hits those targets.
  const achieved = pile.map((f) => {
    const t = strategy.targets.get(f.id);
    return { ...f, size: t === null || t === undefined ? f.size : t };
  });
  const after = planBatches(achieved, { cap });
  check(
    "nothing is stranded once the targets are met",
    after.oversized.length === 0,
    `${after.oversized.length} still oversized`,
  );
  check(
    "and every batch is under the cap",
    after.batches.every((b) => b.encodedBytes <= cap),
  );
  console.log(
    `  ${formatBytes(pile.reduce((n, i) => n + i.size, 0))} over a 5 MB cap -> ` +
      `${after.batches.length} email(s); reason: "${strategy.reason}"`,
  );
}

console.log("\npack: small files are not given targets they cannot meet");
{
  // A 161 KB text document inside a 19 MB pile contributes under one percent of
  // the problem. Giving it a proportional target means it fails — and a results
  // screen that opens with a failure about a file that was never a problem is
  // worse than the handful of kilobytes it was chasing.
  const pile: PackItem[] = [
    { id: "heavy", name: "scan-heavy.pdf", size: 14_200_000 },
    { id: "scan", name: "scan-300dpi.pdf", size: 5_400_000 },
    { id: "text", name: "text.pdf", size: 8_800 },
    { id: "notes", name: "many-pages.pdf", size: 161_800 },
  ];
  const strategy = planDelivery(pile, { cap: 5 * MB });

  check(
    "the tiny text file is left alone",
    strategy.targets.get("text") === null,
    String(strategy.targets.get("text")),
  );
  check(
    "so is the 161 KB one — under 1% of the pile",
    strategy.targets.get("notes") === null,
    String(strategy.targets.get("notes")),
  );
  check(
    "while the two large scans still get targets",
    strategy.targets.get("heavy") !== null && strategy.targets.get("scan") !== null,
  );

  // Leaving them alone must not cost an extra email.
  const achieved = pile.map((f) => {
    const t = strategy.targets.get(f.id);
    return { ...f, size: t === null || t === undefined ? f.size : t };
  });
  const plan = planBatches(achieved, { cap: 5 * MB });
  check(
    "and the batch count is unaffected",
    plan.batches.length === strategy.targetBatches,
    `${plan.batches.length} vs planned ${strategy.targetBatches}`,
  );
  console.log(
    `  targets: ${pile.map((f) => `${f.name}=${strategy.targets.get(f.id) ?? "untouched"}`).join(", ")}`,
  );
}

console.log(
  failures === 0
    ? "\nAll packing checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
