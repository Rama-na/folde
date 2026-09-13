/**
 * Single source of truth for the product name.
 *
 * The name is still subject to trademark and domain clearance, so it is read from
 * here everywhere rather than typed into copy. Renaming the product should be this
 * file plus `package.json`, and nothing else — which is the only reason the last
 * rename cost ten minutes.
 *
 * A note for whoever reads this next, because the choice has a cost worth knowing:
 * "ReadyPDF" is descriptive, and descriptive marks are the hard ones to register and
 * the easy ones to collide with. It also says PDF, while the product has handled
 * JPEG and PNG since the beginning and a passport photograph is half of what the
 * portal case is for. Neither is a reason not to use it; both are reasons to run the
 * trademark register and the app stores before paying for a domain.
 */
export const BRAND = {
  name: "ReadyPDF",
  tagline: "Your files, under the limit.",
  /** Used in page titles: "ReadyPDF — compress for email". */
  separator: "—",
} as const;
