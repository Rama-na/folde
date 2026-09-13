/**
 * What a tool hands back.
 *
 * Always a measured result or a sentence explaining why there isn't one — never a
 * throw for something the user did, and never a size that was not taken from the
 * bytes being returned. That is the same contract `modules/shrink` works to, and it
 * is the reason this product can be trusted with a deadline: every number on screen
 * came off real output, and every failure says what went wrong in words.
 */
export type ToolResult =
  | { ok: true; bytes: Uint8Array; size: number }
  | { ok: false; reason: string };

export function produced(bytes: Uint8Array): ToolResult {
  return { ok: true, bytes, size: bytes.length };
}

export function refused(reason: string): ToolResult {
  return { ok: false, reason };
}

/** Quarter turns, the only rotations a PDF page understands. */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * One page of the document being built, named by where it came from.
 *
 * Reordering, rotating and deleting pages look like three tools and are one
 * operation: a list of source pages, in the order they should appear, each with a
 * turn. Deleting is omitting. Reordering is ordering. There is no separate code path
 * for any of them, which is why there is no way for them to disagree.
 */
export interface PagePlan {
  /** 1-based page number in the source document. */
  from: number;
  rotate?: Rotation;
}
