/**
 * Single source of truth for the product name.
 *
 * The name is still subject to trademark / domain clearance, so it is read
 * from here everywhere rather than typed into copy. Renaming the product
 * should be this file plus `package.json`, and nothing else.
 */
export const BRAND = {
  name: "Snug",
  tagline: "Your files, under the limit.",
  /** Used in page titles: "Snug — compress for email". */
  separator: "—",
} as const;
