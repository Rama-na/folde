/**
 * The image ladder.
 *
 * Same contract as the PDF suite, because it is the same promise: a reported size is
 * the real length of the real bytes, `ok` means it actually fits, and a target that
 * cannot be reached is refused in words rather than approximated.
 *
 * Two rules are specific to photographs and both matter at a portal. Output is always
 * JPEG, because that is what the forms specify. And there is a floor on pixel
 * dimensions, because a form that caps a photo at 50 KB usually also rejects anything
 * under 200x230 — a file that hits the byte target and is refused for being too small
 * has solved nothing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { formatBytes, KB, MB } from "../lib/bytes";
import { detectType, outputName } from "../lib/file-type";
import { shrinkFile, shrinkImage } from "../modules/shrink";
import { MIN_LONG_EDGE_PX } from "../modules/shrink/effort";
import { nodeCodec } from "../modules/shrink/codec-node";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function main(): Promise<void> {
  console.log("\nimage: type is read from the bytes, not the name");
  {
    const photo = new Uint8Array(readFileSync(join(FIXTURES, "photo.jpg")));
    const pdf = new Uint8Array(readFileSync(join(FIXTURES, "scan-300dpi.pdf")));
    const png = new Uint8Array(readFileSync(join(FIXTURES, "signature.png")));

    check("a JPEG is recognised", detectType(photo).kind === "jpeg");
    check("a PNG is recognised", detectType(png).kind === "png");
    check("a PDF is recognised", detectType(pdf).kind === "pdf");
    check(
      "nonsense is recognised as nothing",
      detectType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])).kind === "unknown",
    );

    // The case that made content sniffing necessary: phones and scanner apps write
    // files whose extension does not match. Dispatching on the name would send this
    // photograph to the PDF parser and report it as damaged.
    const misnamed = await shrinkFile(photo, 200 * KB, { codec: nodeCodec });
    check(
      "a photo named .pdf is still handled as a photo",
      misnamed.kind === "jpeg" && misnamed.ok,
      `kind=${misnamed.kind} ok=${misnamed.ok}`,
    );
  }

  console.log("\nimage: portal targets");
  const targets = [
    { label: "100 KB", bytes: 100 * KB },
    { label: "200 KB", bytes: 200 * KB },
    { label: "500 KB", bytes: 500 * KB },
  ];

  for (const name of ["photo.jpg", "photo-small.jpg", "signature.png"]) {
    const source = new Uint8Array(readFileSync(join(FIXTURES, name)));
    const { mime } = detectType(source);
    const before = await sharp(Buffer.from(source)).metadata();

    for (const target of targets) {
      const started = Date.now();
      const result = await shrinkImage(source, target.bytes, mime!, {
        codec: nodeCodec,
      });
      const ms = Date.now() - started;

      const out = await sharp(Buffer.from(result.bytes)).metadata();
      console.log(
        `  ${name.padEnd(17)}${target.label.padEnd(9)}${result.rung.padEnd(13)}` +
          `${formatBytes(result.size).padStart(10)}  ${result.ok ? "fits" : "  no"}  ` +
          `${out.width}x${out.height}  ${ms}ms`,
      );

      const where = `${name} @ ${target.label}`;
      check(
        `${where}: reported size matches the bytes returned`,
        result.size === result.bytes.length,
      );
      check(
        `${where}: ok implies at or under target`,
        !result.ok || result.size <= target.bytes,
        `${result.size} > ${target.bytes}`,
      );
      check(
        `${where}: failure is explained`,
        result.ok || (result.shortfall ?? "").length > 20,
      );

      if (result.rung === "passthrough") {
        check(
          `${where}: an image that already fits is returned untouched`,
          result.bytes.length === source.length,
        );
      } else {
        check(`${where}: output is a JPEG`, isJpeg(result.bytes));
        check(
          `${where}: never upscaled`,
          (out.width ?? 0) <= (before.width ?? 0) &&
            (out.height ?? 0) <= (before.height ?? 0),
          `${out.width}x${out.height} from ${before.width}x${before.height}`,
        );
        check(
          `${where}: long edge stays above the floor`,
          Math.max(out.width ?? 0, out.height ?? 0) >= MIN_LONG_EDGE_PX ||
            Math.max(before.width ?? 0, before.height ?? 0) < MIN_LONG_EDGE_PX,
          `long edge ${Math.max(out.width ?? 0, out.height ?? 0)}`,
        );
      }
    }
  }

  console.log("\nimage: specific behaviours");

  // A PNG comes back as a JPEG, so its name has to change. A file that kept .png
  // would be rejected at the upload form for being the wrong format.
  {
    const png = new Uint8Array(readFileSync(join(FIXTURES, "signature.png")));
    const result = await shrinkFile(png, 20 * KB, { codec: nodeCodec });
    check(
      "a PNG is converted to JPEG",
      isJpeg(result.bytes) || result.rung === "passthrough",
    );
    check(
      "and its name changes to match",
      outputName("signature.png", result.kind) === "signature.jpg",
      outputName("signature.png", result.kind),
    );
    check(
      "while a PDF keeps its name",
      outputName("scan.pdf", "pdf") === "scan.pdf",
    );
  }

  // The rule that matters most: a signature already under the limit must not be
  // re-encoded to hit it.
  {
    const png = new Uint8Array(readFileSync(join(FIXTURES, "signature.png")));
    const result = await shrinkImage(png, 1 * MB, "image/png", {
      codec: nodeCodec,
    });
    check(
      "an image already under the limit is never touched",
      result.rung === "passthrough" &&
        Buffer.compare(Buffer.from(png), Buffer.from(result.bytes)) === 0,
      `rung ${result.rung}`,
    );
  }

  // An impossible target is refused with the pixel dimensions named, so the user
  // can see why rather than being told to try again.
  {
    const photo = new Uint8Array(readFileSync(join(FIXTURES, "photo.jpg")));
    const result = await shrinkImage(photo, 1200, "image/jpeg", {
      codec: nodeCodec,
    });
    check(
      "an impossible target is refused, not approximated",
      !result.ok && result.size > 1200,
      `ok=${result.ok} size=${result.size}`,
    );
    check(
      "and the refusal explains the pixel floor",
      /pixels/.test(result.shortfall ?? ""),
      result.shortfall ?? "",
    );
    console.log(`  refusal: "${result.shortfall}"`);
  }

  // A file that is neither a PDF nor an image gets a sentence naming what it takes.
  {
    const junk = new Uint8Array(Buffer.from("this is a text file, not a document"));
    const result = await shrinkFile(junk, 100 * KB, { codec: nodeCodec });
    check(
      "an unsupported file is refused in plain language",
      !result.ok && /PDFs, JPEGs and PNGs/.test(result.shortfall ?? ""),
      result.shortfall ?? "",
    );
  }

  // HEIC names the fix rather than failing vaguely. Node's sharp build has no HEIC
  // support, which is exactly the situation a Chrome user is in.
  {
    const heic = new Uint8Array(64);
    heic.set([0x00, 0x00, 0x00, 0x18], 0);
    heic.set(Buffer.from("ftypheic"), 4);
    check("HEIC is detected from its brand", detectType(heic).kind === "heic");

    // The target has to be below the file's own size, or it passes through
    // untouched and correctly never reaches a decoder at all.
    const result = await shrinkImage(heic, 16, "image/heic", {
      codec: nodeCodec,
    });
    check(
      "and an unreadable HEIC names the setting that fixes it",
      !result.ok && /Most Compatible/.test(result.shortfall ?? ""),
      result.shortfall ?? "",
    );
  }

  console.log(
    failures === 0
      ? "\nAll image checks passed.\n"
      : `\n${failures} check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
