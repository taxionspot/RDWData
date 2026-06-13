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
