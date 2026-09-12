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
