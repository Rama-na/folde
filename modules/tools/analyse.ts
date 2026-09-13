import { detectType } from "@/lib/file-type";
import { open } from "./pages";
import type { AnalysedFile } from "./offer";

/**
 * Everything the chooser needs to know about one file, read from its bytes.
 *
 * Cheap on purpose. A PDF is opened for its page count and nothing else — no
 * rendering, no text extraction, no images touched — because this runs on every file
 * the moment it is dropped, and forty of them arriving at once must not make the
 * interface think.
 *
 * The kind comes from the bytes and never the extension. A scanner app writing PNG
 * data into a `.jpg`, or a phone writing HEIC into one, is routine, and dispatching
 * on the name is how a tool tells somebody their perfectly good file is broken.
 */
export async function analyse(
  file: { id: string; name: string; bytes: Uint8Array },
): Promise<AnalysedFile> {
  const { kind } = detectType(file.bytes);
  const base = {
    id: file.id,
    name: file.name,
    size: file.bytes.length,
    kind,
  };

  if (kind !== "pdf") return base;

  const opened = await open(file.bytes);
  if (opened.ok) return { ...base, pages: opened.pages };

  // A locked document is not a broken one, and the difference decides what this
  // person is offered next: a password box, or an apology.
  return { ...base, locked: /password-protected/.test(opened.reason) };
}
