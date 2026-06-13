// Hard guarantee that en-dash (–) and em-dash (—) never reach the UI,
// PDF or email. Em-dash becomes a comma (connective), en-dash a hyphen (ranges).
// Kept as unicode escapes so the forbidden characters never appear in source.

export function sanitizeText(value: string): string {
  if (typeof value !== "string") return value;
  return value
    .replace(/\s*—\s*/g, ", ")
    .replace(/–/g, "-")
    .replace(/[ \t]{2,}/g, " ");
}

export function sanitizeList(values: string[]): string[] {
  return Array.isArray(values) ? values.map(sanitizeText) : values;
}

/**
 * Recursively strips dashes from every string in a value (object, array or
 * primitive). Used on cached AI payloads so entries written before the
 * sanitizer existed are still cleaned when served.
 */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return sanitizeText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeDeep(item)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeDeep(val);
    }
    return out as unknown as T;
  }
  return value;
}
