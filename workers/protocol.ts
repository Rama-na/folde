import type { Rung } from "@/modules/shrink/types";

/**
 * The contract between the page and the worker.
 *
 * Kept in its own module so both sides import the same types and a change to the
 * message shape cannot compile on one side and not the other.
 */

export interface WorkerFile {
  id: string;
  name: string;
  bytes: ArrayBuffer;
}

export type WorkerRequest =
  | {
      type: "shrink";
      jobId: string;
      files: WorkerFile[];
      /** Byte target per file id. A null target means leave that file alone. */
      targets: Array<[string, number | null]>;
      /**
       * The largest a single attachment can be, for a mail job.
       *
       * Null for a portal upload, which is how the worker knows not to divide
       * anything: a form asking for one document is not helped by three.
       */
      splitBelow?: number | null;
    }
  | { type: "cancel"; jobId: string };

export interface FileOutcome {
  id: string;
  name: string;
  originalSize: number;
  /** Measured length of the bytes below. Never an estimate. */
  size: number;
  bytes: ArrayBuffer;
  rung: Rung;
  ok: boolean;
  textPreserved: boolean;
  shortfall?: string;
  /**
   * Set when this outcome is one piece of a document that had to be divided to
   * travel at all. The user has to be told this happened — they are about to send
   * somebody three files where they chose one.
   */
  split?: {
    /** The name of the document these pieces came from. */
    source: string;
    part: number;
    of: number;
    fromPage: number;
    toPage: number;
  };
}

export type WorkerResponse =
  | {
      type: "progress";
      jobId: string;
      /** Files finished so far, out of the total. */
      done: number;
      total: number;
      /** The file being worked on right now, for the status line. */
      current: string;
    }
  | { type: "file"; jobId: string; outcome: FileOutcome }
  | { type: "done"; jobId: string }
  | { type: "error"; jobId: string; message: string };
