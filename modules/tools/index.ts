/**
 * The tools.
 *
 * Everything here operates on documents the user already has in hand, entirely on
 * their device, and hands back either measured bytes or a sentence saying why not.
 *
 * The rule that keeps this from turning into a PDF tools site — see CLAUDE.md — is
 * that the front door stays the size limit, and these are reached through
 * `offeredTools`, which shows only what applies to the files actually dropped.
 */
export * from "./types";
export * from "./offer";
export { analyse } from "./analyse";
export { mergePdfs, type MergeInput } from "./merge";
export { rebuildPdf, extractPages, parseRanges, open } from "./pages";
export { imagesToPdf, pdfToImages, type ImageInput, type PageFit, type PageImage } from "./images";
export { protectPdf, unlockPdf, isProtected } from "./lock";
