/**
 * Byte arithmetic — including the correction that makes email targets actually work.
 *
 * The headline rule (see CLAUDE.md): a mail server's "5 MB attachment limit" is not
 * 5 MB of files. The server measures the encoded MIME message, and base64 inflates
 * every attachment by roughly 37% before headers are counted. Sizing a batch at the
 * nominal cap is how tools produce a "4.7 MB" email that bounces off a 5 MB limit.
 */

/**
 * Sizes are decimal throughout: 1 MB = 1,000,000 bytes.
 *
 * Providers disagree — some enforce 5 * 1024 * 1024, some 5,000,000. Decimal is the
 * smaller of the two, so budgeting in decimal is the conservative reading of any
 * stated cap. It also matches how macOS, Android and most upload forms report sizes.
 */
export const KB = 1_000;
export const MB = 1_000_000;

/**
 * base64 encodes 3 bytes into 4 characters (×4/3), and MIME wraps the result at 76
 * characters with a 2-byte line ending (×78/76). 1.3333… × 1.0263… ≈ 1.3684.
 */
export const BASE64_EXPANSION = (4 / 3) * (78 / 76);

/**
 * Per-attachment MIME part overhead: the multipart boundary, Content-Type,
 * Content-Disposition (which carries the filename, so long names cost more),
 * and Content-Transfer-Encoding. Rounded up generously — being 300 bytes
 * pessimistic costs nothing, being 300 bytes optimistic costs a bounce.
 */
export const MIME_PART_OVERHEAD = 320;

/** Envelope headers, the text body part, and the closing boundary. */
export const MIME_MESSAGE_OVERHEAD = 2_048;

/**
 * A final margin on top of the arithmetic above, because mail systems vary in what
 * they count and some apply their limit after adding their own headers (a scanner
 * banner, a compliance footer, a DKIM signature).
 */
export const MAIL_SAFETY_MARGIN = 0.02;

/**
 * Size of the MIME message that carries `rawTotal` bytes across `attachments` files.
 *
 * This is the number the receiving mail server compares against its limit — not the
 * sum of the file sizes the user sees in their file manager.
 */
export function encodedMessageSize(rawTotal: number, attachments: number): number {
  return Math.ceil(
    rawTotal * BASE64_EXPANSION +
      attachments * MIME_PART_OVERHEAD +
      MIME_MESSAGE_OVERHEAD,
  );
}

/**
 * How many bytes of actual files fit in a message that must stay under `cap`.
 *
 * The exact inverse of {@link encodedMessageSize}, minus the safety margin. Returns 0
 * when the overhead alone exceeds the cap, which is a real case for a tiny limit and
 * a large attachment count — the caller must handle it rather than producing a
 * negative budget.
 */
export function rawAttachmentBudget(cap: number, attachments: number): number {
  const forPayload =
    cap - MIME_MESSAGE_OVERHEAD - attachments * MIME_PART_OVERHEAD;
  if (forPayload <= 0) return 0;
  const raw = forPayload / BASE64_EXPANSION;
  return Math.max(0, Math.floor(raw * (1 - MAIL_SAFETY_MARGIN)));
}

/**
 * Format a byte count for display.
 *
 * Deliberately never rounds up across a unit boundary in a way that hides an
 * overage: 199_950 bytes reads as "199.9 KB", not "200 KB", because the whole
 * product is about whether a number is under a limit.
 */
export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${truncate1(bytes / KB)} KB`;
  return `${truncate1(bytes / MB)} MB`;
}

function truncate1(n: number): string {
  const t = Math.floor(n * 10) / 10;
  return Number.isInteger(t) ? String(t) : t.toFixed(1);
}
