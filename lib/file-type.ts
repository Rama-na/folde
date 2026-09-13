/**
 * What a file actually is, read from its bytes.
 *
 * Not from its extension. A camera roll is full of files whose name lies — a
 * `.jpg` that is really HEIC because the phone renamed it, a `.pdf` a scanner app
 * wrote as a JPEG, a `document` with no extension at all shared through WhatsApp.
 * Dispatching on the name would send a perfectly good photograph to the PDF parser
 * and tell its owner their file was damaged.
 */

export type FileKind = "pdf" | "jpeg" | "png" | "heic" | "unknown";

export interface DetectedType {
  kind: FileKind;
  /** The media type to hand a decoder, or null when we cannot say. */
  mime: string | null;
}

const MIME: Record<Exclude<FileKind, "unknown">, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
};

export function detectType(bytes: Uint8Array): DetectedType {
  const kind = sniff(bytes);
  return { kind, mime: kind === "unknown" ? null : MIME[kind] };
}

export function isImage(kind: FileKind): boolean {
  return kind === "jpeg" || kind === "png" || kind === "heic";
}

function sniff(b: Uint8Array): FileKind {
  // %PDF- — the header can sit a little way in, since some writers emit a BOM or
  // stray bytes first and every reader tolerates it.
  const leader = b.subarray(0, 1024);
  if (indexOfAscii(leader, "%PDF-") !== -1) return "pdf";

  // SOI marker. Every JPEG starts FF D8 FF, whatever is in the APP segments after.
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";

  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "png";
  }

  // HEIC is an ISO base-media container: a four-byte length, then "ftyp", then a
  // brand. Matching the brand rather than just "ftyp" keeps MP4 video out.
  if (asciiAt(b, 4, "ftyp")) {
    const brand = asciiSlice(b, 8, 12);
    if (
      brand === "heic" ||
      brand === "heix" ||
      brand === "hevc" ||
      brand === "heim" ||
      brand === "heis" ||
      brand === "mif1" ||
      brand === "msf1"
    ) {
      return "heic";
    }
  }

  return "unknown";
}

function asciiAt(b: Uint8Array, offset: number, text: string): boolean {
  if (b.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (b[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function asciiSlice(b: Uint8Array, from: number, to: number): string {
  if (b.length < to) return "";
  let out = "";
  for (let i = from; i < to; i++) out += String.fromCharCode(b[i]);
  return out;
}

function indexOfAscii(b: Uint8Array, text: string): number {
  for (let i = 0; i + text.length <= b.length; i++) {
    if (asciiAt(b, i, text)) return i;
  }
  return -1;
}

/**
 * The name a shrunk file should carry.
 *
 * A re-encoded image is always JPEG — Indian portals specify it explicitly, and a
 * PNG that quietly kept its name would be rejected at the upload form for being the
 * wrong format. Renaming it here means the user sees the change before they submit
 * it rather than after.
 *
 * `untouched` is what keeps that rule honest. A PNG already under the limit is
 * handed back byte for byte, because re-encoding a file that already fits destroys
 * quality for nothing — and a file that is still PNG inside must not be called
 * `.jpg`. It was, briefly: the rename was keyed on what came in rather than on what
 * went out, so the one path that deliberately does not convert was also the one path
 * that lied about its own format. Portals that sniff content reject that outright,
 * and the ones that do not are worse, because the mismatch surfaces later and
 * somewhere else.
 */
export function outputName(
  name: string,
  kind: FileKind,
  untouched: boolean,
): string {
  if (kind === "pdf" || kind === "unknown" || untouched) return name;

  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (ext === "jpg" || ext === "jpeg") return name;
  return `${stem}.jpg`;
}
