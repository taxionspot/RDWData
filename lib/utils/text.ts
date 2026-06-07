/**
 * Customer-facing text helpers.
 *
 * The product owner has banned the long dash characters (em-dash and en-dash,
 * plus the related figure/horizontal bars) from ALL customer-facing copy. The
 * AI models in particular love the em-dash, so we strip it from every AI output
 * and from any localized string that might still contain one. A plain hyphen is
 * allowed and used as the replacement.
 */
const BANNED_DASHES = /[‒–—―−]/g;

/** Replace every banned long dash with a plain hyphen. */
export function stripBannedDashes(value: string): string {
  return value.replace(BANNED_DASHES, "-");
}

/** Sanitize a single string or an array of strings. */
export function sanitizeStrings<T extends string | string[]>(value: T): T {
  if (Array.isArray(value)) return value.map(stripBannedDashes) as T;
  return stripBannedDashes(value) as T;
}
