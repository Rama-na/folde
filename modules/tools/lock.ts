import { open } from "./pages";
import { produced, refused, type ToolResult } from "./types";

/**
 * Put a password on a PDF, or take one off.
 *
 * Possible at all only since moving to `@cantoo/pdf-lib` — upstream `pdf-lib` has
 * never supported encryption, which is why this was not among the tools before.
 *
 * A word about what this is and is not. Locking a document means the reader asks for
 * a password before showing it, and it is genuine AES-256 rather than the "owner
 * password" theatre that most free tools apply — that kind sets a flag politely
 * asking readers not to print, and every reader ignores it. This one cannot be read
 * without the password.
 *
 * Which is also the warning. Nothing here stores it, because nothing here stores
 * anything, so a forgotten password means a document nobody can open again. The
 * interface has to say that before the button, not after.
 */
export async function protectPdf(
  source: Uint8Array,
  password: string,
): Promise<ToolResult> {
  if (password.length < 4) {
    return refused("Use at least four characters, or there is little point.");
  }

  const opened = await open(source);
  if (!opened.ok) return refused(opened.reason);

  opened.doc.encrypt({
    userPassword: password,
    // The same password both ways on purpose. A separate owner password exists to
    // restrict printing and copying for people who *can* already open the file, and
    // every reader treats those restrictions as advisory. Offering it would be
    // selling a lock that does not lock.
    ownerPassword: password,
  });

  return produced(await opened.doc.save({ useObjectStreams: false }));
}

/** Take the password off, given the password. */
export async function unlockPdf(
  source: Uint8Array,
  password: string,
): Promise<ToolResult> {
  const opened = await open(source, password);
  if (!opened.ok) return refused(opened.reason);

  // Saving a document opened with its password writes it out without one: the
  // decrypted objects are what got loaded, and nothing re-applies the handler.
  return produced(await opened.doc.save({ useObjectStreams: true }));
}

/** Whether this PDF will ask for a password before it opens. */
export async function isProtected(source: Uint8Array): Promise<boolean> {
  const opened = await open(source);
  return !opened.ok && /password-protected/.test(opened.reason);
}
