import { KB, MB } from "./bytes";

/**
 * Every size target in the product. Nothing else may hardcode a byte number.
 *
 * Two modes, because the arithmetic differs:
 *
 *  - `upload` — a form checks the file sitting on disk. The target is the target.
 *  - `mail`   — a server checks the encoded MIME message, which is ~37% larger than
 *               the files it carries. The stated cap is NOT the file budget; see
 *               `rawAttachmentBudget` in ./bytes.
 *
 * The portal figures below are the common published values, not guarantees. Portals
 * change limits without notice and some enforce a stricter one than they document,
 * which is exactly why `custom` exists and why every result is verified against real
 * output bytes rather than trusted from this table.
 */

export type PresetMode = "upload" | "mail";

export interface Preset {
  id: string;
  label: string;
  /** The stated limit. For `mail`, the cap on the message, not on the files. */
  bytes: number;
  mode: PresetMode;
  /** Shown under the label — who enforces this, so the user can recognise theirs. */
  note: string;
}

export const UPLOAD_PRESETS: readonly Preset[] = [
  {
    id: "upload-100kb",
    label: "100 KB",
    bytes: 100 * KB,
    mode: "upload",
    note: "SSC photographs, several state recruitment portals",
  },
  {
    id: "upload-200kb",
    label: "200 KB",
    bytes: 200 * KB,
    mode: "upload",
    note: "UPSC, SSC, RRB, IBPS — the most common document limit",
  },
  {
    id: "upload-500kb",
    label: "500 KB",
    bytes: 500 * KB,
    mode: "upload",
    note: "Aadhaar-linked services and most state e-service portals",
  },
  {
    id: "upload-1mb",
    label: "1 MB",
    bytes: 1 * MB,
    mode: "upload",
    note: "NEET, and university admission portals",
  },
  {
    id: "upload-2mb",
    label: "2 MB",
    bytes: 2 * MB,
    mode: "upload",
    note: "JEE, scholarship portals, certificate verification",
  },
];

export const MAIL_PRESETS: readonly Preset[] = [
  {
    id: "mail-5mb",
    label: "5 MB",
    bytes: 5 * MB,
    mode: "mail",
    note: "Strict corporate and government mail servers",
  },
  {
    id: "mail-10mb",
    label: "10 MB",
    bytes: 10 * MB,
    mode: "mail",
    note: "A common middle setting for company mail",
  },
  {
    id: "mail-20mb",
    label: "20 MB",
    bytes: 20 * MB,
    mode: "mail",
    note: "Outlook.com and many Exchange defaults",
  },
  {
    id: "mail-25mb",
    label: "25 MB",
    bytes: 25 * MB,
    mode: "mail",
    note: "Gmail, Yahoo Mail",
  },
];

export const ALL_PRESETS: readonly Preset[] = [
  ...UPLOAD_PRESETS,
  ...MAIL_PRESETS,
];

export function presetById(id: string): Preset | undefined {
  return ALL_PRESETS.find((p) => p.id === id);
}

/** A limit the user typed in, for a portal whose figure we do not carry. */
export function customPreset(bytes: number, mode: PresetMode): Preset {
  return {
    id: "custom",
    label: "Custom",
    bytes,
    mode,
    note: "The limit you entered",
  };
}
