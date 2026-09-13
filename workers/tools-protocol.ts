import type { PagePlan, PageFit } from "@/modules/tools";

/**
 * The contract between the page and the tools worker.
 *
 * A second worker rather than more messages on the first. The document worker exists
 * to run one long compression job and report its progress; the tools run short,
 * unrelated operations that must not queue behind a forty-file shrink. Keeping them
 * apart also keeps either protocol readable, which the first one stopped being the
 * moment it grew a second purpose.
 */

export interface ToolFile {
  name: string;
  bytes: ArrayBuffer;
}

export type ToolOp =
  | { kind: "merge"; files: ToolFile[] }
  | { kind: "rebuild"; file: ToolFile; plan: PagePlan[] }
  | { kind: "extract"; file: ToolFile; ranges: string }
  | { kind: "images-to-pdf"; files: ToolFile[]; fit: PageFit }
  | { kind: "pdf-to-images"; file: ToolFile }
  | { kind: "protect"; files: ToolFile[]; password: string }
  | { kind: "unlock"; file: ToolFile; password: string }
  /** Small renders of every page, for the organise grid to show real pages. */
  | { kind: "thumbnails"; file: ToolFile };

export type ToolRequest =
  | { type: "run"; jobId: string; op: ToolOp }
  | { type: "cancel"; jobId: string };

export interface ToolOutput {
  name: string;
  bytes: ArrayBuffer;
  /** Measured length of `bytes`. Never an estimate. */
  size: number;
}

export type ToolResponse =
  | {
      type: "progress";
      jobId: string;
      done: number;
      total: number;
      current: string;
    }
  /** Streamed rather than collected: a long document is hundreds of megabytes. */
  | { type: "output"; jobId: string; output: ToolOutput }
  | { type: "thumbnail"; jobId: string; page: number; of: number; bytes: ArrayBuffer }
  | {
      type: "done";
      jobId: string;
      /** Files that could not be used, named. Never silently dropped. */
      skipped?: { name: string; reason: string }[];
    }
  | { type: "error"; jobId: string; message: string };
