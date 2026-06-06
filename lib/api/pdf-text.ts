/**
 * pdf-lib's StandardFonts (Helvetica/Helvetica-Bold) use WinAnsi (cp1252)
 * encoding and THROW when asked to draw a character they cannot encode.
 *
 * AI-generated summaries and RDW descriptions regularly contain typographic
 * characters - curly quotes, ellipsis, en/em dashes, bullets, arrows, emoji,
 * zero-width spaces - any of which would crash PDF report generation (HTTP 500
 * on download). This normalizes such text to a WinAnsi-safe subset: the common
 * typographic characters are mapped to ASCII and anything outside the Latin-1
 * range is dropped as a final safety net.
 *
 * Code points are built via String.fromCharCode so this source stays pure ASCII.
 */
function cls(...codes: number[]): RegExp {
  return new RegExp("[" + String.fromCharCode(...codes) + "]", "g");
}

export function sanitizeWinAnsi(text: string): string {
  if (!text) return text;
  return text
    .replace(cls(0x2018, 0x2019, 0x201a, 0x201b, 0x2032), "'")
    .replace(cls(0x201c, 0x201d, 0x201e, 0x201f, 0x2033), '"')
    .replace(cls(0x2013, 0x2014, 0x2015, 0x2212), "-")
    .replace(cls(0x2022, 0x2023, 0x25cf, 0x25e6), "-")
    .replace(new RegExp(String.fromCharCode(0x2026), "g"), "...")
    .replace(cls(0x00a0, 0x2007, 0x2009, 0x200a, 0x202f), " ")
    .replace(new RegExp(String.fromCharCode(0x20ac), "g"), "EUR")
    .replace(cls(0x200b, 0x200c, 0x200d, 0xfeff), "")
    .replace(new RegExp("[^\\u0000-\\u00ff]", "g"), "");
}
