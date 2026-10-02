/**
 * Structured logging, shaped so the wrong thing is hard to log.
 *
 * This is not a nicer `console.log`. It exists because of what this product holds:
 * somebody's Aadhaar, their PAN, a salary slip, an offer letter. The usual instinct
 * when debugging a stuck job is to log the filename, and in this product a filename
 * is personal data — `Aadhaar front.jpeg` and `offer-letter-infosys.pdf` each say
 * something about a person before anybody opens them.
 *
 * So the rule, and it is a rule rather than a guideline:
 *
 *   A log line may carry sizes, counts, durations, outcomes and opaque ids.
 *   It may not carry document bytes, a filename, or an email address.
 *
 * `describeName` and `describeEmail` exist so that the times you genuinely need to
 * say something about a name or an address have an answer that is safe, rather than
 * a developer reaching for the raw value because nothing else was to hand.
 */

export type Level = "debug" | "info" | "warn" | "error";

/**
 * Values a log line is allowed to carry.
 *
 * Deliberately not `unknown`. Typing this loosely is how a whole object with a
 * `name` on it ends up in a log line six months from now.
 */
export type Detail = string | number | boolean | null;

export interface Fields {
  /** Follows one person's run without knowing who they are. */
  jobId?: string;
  [key: string]: Detail | undefined;
}

const SILENT: Level[] = ["debug"];

/**
 * True in a browser build that has been minified, which is the closest thing to a
 * production signal available on both sides of the wire.
 */
function inProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function emit(level: Level, event: string, fields: Fields = {}): void {
  if (inProduction() && SILENT.includes(level)) return;

  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...fields,
  });

  // Workers collects stdout and stderr separately, and an error that arrives on
  // stdout is an error nobody is paged for.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Fields) => emit("debug", event, fields),
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};

/**
 * What can be said about a filename without saying the filename.
 *
 * "pdf/24" is enough to reproduce a parsing bug and tells you nothing about whose
 * document it was.
 */
export function describeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "none";
  return `${extension.slice(0, 8)}/${name.length}`;
}

/**
 * What can be said about an address without saying the address.
 *
 * The domain is usually the whole question — whether a bounce is one recipient or
 * every customer at one company — and the local part is the identifying half.
 */
export function describeEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 0) return "malformed";
  return `*@${address.slice(at + 1).toLowerCase()}`;
}

/**
 * An opaque, stable handle for something that must be countable but not readable.
 *
 * Used for the recipient column in the sent log: two sends to the same person match,
 * and nothing in the database says who that person is. Not a security boundary —
 * an address has far too little entropy to resist a dictionary attack — which is
 * precisely why the address itself is never stored alongside it.
 */
export async function opaqueHandle(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
