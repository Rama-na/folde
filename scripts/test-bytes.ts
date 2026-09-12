/**
 * The budget arithmetic that makes email targets actually work.
 *
 * These are the cheapest tests in the project and they guard the single most
 * consequential number in it: how many bytes of files fit in a message that must
 * stay under a stated cap.
 */
import {
  BASE64_EXPANSION,
  MB,
  encodedMessageSize,
  formatBytes,
  rawAttachmentBudget,
} from "../lib/bytes";

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nbytes: budget is the exact inverse of the encoder");
for (const cap of [5 * MB, 10 * MB, 20 * MB, 25 * MB]) {
  for (const count of [1, 5, 12, 40]) {
    const budget = rawAttachmentBudget(cap, count);
    const encoded = encodedMessageSize(budget, count);
    check(
      `${formatBytes(cap)} cap, ${count} files: ${formatBytes(budget)} of files encodes to ${formatBytes(encoded)}`,
      encoded <= cap,
      `encoded ${encoded} > cap ${cap}`,
    );
  }
}

console.log("\nbytes: the naive reading of a cap overflows it");
{
  // This is the bug the whole correction exists to prevent: filling a 5 MB message
  // with 4.7 MB of files, the way every "target slightly under the limit" tool does.
  const cap = 5 * MB;
  const naive = 4.7 * MB;
  const encoded = encodedMessageSize(naive, 12);
  check(
    `4.7 MB of files in a 5 MB cap really weighs ${formatBytes(encoded)} — over`,
    encoded > cap,
    "the correction would be pointless if this passed",
  );

  const corrected = rawAttachmentBudget(cap, 12);
  check(
    `corrected budget is ${formatBytes(corrected)}, comfortably under`,
    encodedMessageSize(corrected, 12) <= cap,
  );
  check(
    "corrected budget is meaningfully smaller than the naive one",
    corrected < naive * 0.85,
    `${corrected} vs ${naive}`,
  );
}

console.log("\nbytes: degenerate caps");
check(
  "a cap smaller than the envelope overhead yields no budget, not a negative one",
  rawAttachmentBudget(1000, 4) === 0,
);
check(
  "a large attachment count can exhaust a small cap",
  rawAttachmentBudget(10_000, 200) === 0,
);
check(
  "expansion factor is the base64 ratio plus line endings",
  BASE64_EXPANSION > 1.36 && BASE64_EXPANSION < 1.37,
  String(BASE64_EXPANSION),
);

console.log("\nbytes: formatting never rounds up past a limit");
check('199_950 B reads as "199.9 KB"', formatBytes(199_950) === "199.9 KB");
check('999_999 B reads as "999.9 KB"', formatBytes(999_999) === "999.9 KB");
check('200_000 B reads as "200 KB"', formatBytes(200_000) === "200 KB");
check('512 B reads as "512 B"', formatBytes(512) === "512 B");

console.log(
  failures === 0
    ? "\nAll byte-budget checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
