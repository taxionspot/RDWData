import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont, type PDFImage } from "pdf-lib";
import { formatDisplayPlate } from "@/lib/rdw/normalize";
import { getVehicleImageUrl } from "@/lib/utils/imagin";

type AiInsights = {
  summary: string;
  positives: string[];
  risks: string[];
  recommendation: string;
  purchaseVerdict: "BUY" | "CONSIDER" | "CAUTION" | "AVOID";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  recommendations: string[];
};

type AiValuation = {
  currency: "EUR";
  estimatedValueNow: number;
  estimatedValueMin: number;
  estimatedValueMax: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  factors: string[];
  explanation: string;
};

type ReportArgs = {
  plate: string;
  locale: "nl" | "en";
  generatedAt: Date;
  data: Record<string, unknown>;
  aiInsights?: AiInsights | null;
  aiValuation?: AiValuation | null;
};

type Row = Record<string, unknown>;
type Locale = "nl" | "en";
type ChipTone = "ok" | "warn" | "bad" | "neutral";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_RESERVE = 58;
const COVER_HEADER_HEIGHT = 96;
const SLIM_HEADER_HEIGHT = 40;

const COLORS = {
  navy: rgb(0.05, 0.09, 0.17),
  blue: rgb(0.15, 0.39, 0.93),
  blueSoft: rgb(0.93, 0.95, 1),
  text: rgb(0.12, 0.16, 0.23),
  textSoft: rgb(0.38, 0.45, 0.55),
  line: rgb(0.88, 0.91, 0.95),
  cardBg: rgb(0.975, 0.982, 0.995),
  white: rgb(1, 1, 1),
  green: rgb(0.09, 0.52, 0.3),
  greenBg: rgb(0.89, 0.96, 0.92),
  amber: rgb(0.72, 0.46, 0.05),
  amberBg: rgb(0.99, 0.95, 0.85),
  red: rgb(0.74, 0.13, 0.18),
  redBg: rgb(0.99, 0.91, 0.91),
  neutralBg: rgb(0.93, 0.95, 0.97),
  plateYellow: rgb(0.98, 0.8, 0.1),
  plateBlue: rgb(0, 0.2, 0.6)
};

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" ? (value as Row) : {};
}

function sanitize(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[^\x20-\x7E\xA1-\xFF€\n]/g, "");
}

function s(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return sanitize(String(value));
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "" && value !== "-";
}

function boolLabel(value: unknown, locale: Locale): string {
  if (value === true) return locale === "nl" ? "Ja" : "Yes";
  if (value === false) return locale === "nl" ? "Nee" : "No";
  return "-";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function fmtCurrency(value: unknown, locale: Locale): string {
  const num = toNumber(value);
  if (num === null) return "-";
  return `€ ${Math.round(num).toLocaleString(locale === "nl" ? "nl-NL" : "en-US")}`;
}

function fmtNumber(value: unknown, locale: Locale, suffix = ""): string {
  const num = toNumber(value);
  if (num === null) return "-";
  return `${Math.round(num).toLocaleString(locale === "nl" ? "nl-NL" : "en-US")}${suffix}`;
}

function fmtDate(value: unknown): string {
  if (!present(value)) return "-";
  const raw = String(value);
  let y = "";
  let m = "";
  let d = "";
  if (/^\d{8}$/.test(raw)) {
    y = raw.slice(0, 4);
    m = raw.slice(4, 6);
    d = raw.slice(6, 8);
  } else if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    y = raw.slice(0, 4);
    m = raw.slice(5, 7);
    d = raw.slice(8, 10);
  } else {
    return sanitize(raw);
  }
  return `${d}-${m}-${y}`;
}

function verdictLabel(verdict: AiInsights["purchaseVerdict"] | undefined, locale: Locale): string {
  if (!verdict) return "-";
  if (locale === "en") return verdict;
  const map: Record<AiInsights["purchaseVerdict"], string> = {
    BUY: "Kopen",
    CONSIDER: "Overwegen",
    CAUTION: "Voorzichtig",
    AVOID: "Afraden"
  };
  return map[verdict];
}

function riskLabel(level: AiInsights["riskLevel"] | undefined, locale: Locale): string {
  if (!level) return "-";
  if (locale === "en") return level;
  const map: Record<AiInsights["riskLevel"], string> = { LOW: "Laag", MEDIUM: "Gemiddeld", HIGH: "Hoog" };
  return map[level];
}

function confidenceLabel(level: string | null | undefined, locale: Locale): string {
  if (!level) return "-";
  if (locale === "en") return String(level);
  const map: Record<string, string> = { LOW: "Laag", MEDIUM: "Gemiddeld", HIGH: "Hoog" };
  return map[String(level).toUpperCase()] ?? sanitize(String(level));
}

function verdictColor(verdict: AiInsights["purchaseVerdict"] | undefined) {
  if (verdict === "BUY") return COLORS.green;
  if (verdict === "CONSIDER") return COLORS.blue;
  if (verdict === "CAUTION") return COLORS.amber;
  if (verdict === "AVOID") return COLORS.red;
  return COLORS.textSoft;
}

function riskColor(level: AiInsights["riskLevel"] | undefined) {
  if (level === "LOW") return COLORS.green;
  if (level === "MEDIUM") return COLORS.amber;
  if (level === "HIGH") return COLORS.red;
  return COLORS.textSoft;
}

function chipColors(tone: ChipTone): { bg: ReturnType<typeof rgb>; fg: ReturnType<typeof rgb> } {
  if (tone === "ok") return { bg: COLORS.greenBg, fg: COLORS.green };
  if (tone === "warn") return { bg: COLORS.amberBg, fg: COLORS.amber };
  if (tone === "bad") return { bg: COLORS.redBg, fg: COLORS.red };
  return { bg: COLORS.neutralBg, fg: COLORS.textSoft };
}

function splitText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = sanitize(text ?? "");
  if (!safe) return [""];
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      line = word;
      continue;
    }
    let current = "";
    for (const ch of word) {
      const next = current + ch;
      if (font.widthOfTextAtSize(next, size) > maxWidth) {
        if (current) lines.push(current);
        current = ch;
      } else {
        current = next;
      }
    }
    line = current;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [safe];
}

class PdfLayout {
  private doc: PDFDocument;
  private bold: PDFFont;
  private regular: PDFFont;
  private args: ReportArgs;
  private sectionIndex = 0;
  public page: PDFPage;
  public y: number;

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont, args: ReportArgs) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.args = args;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.drawCoverHeader();
    this.y = PAGE_HEIGHT - COVER_HEADER_HEIGHT - 20;
  }

  private drawPlateBadge(x: number, y: number, height: number) {
    const plateText = formatDisplayPlate(this.args.plate) || this.args.plate;
    const textSize = 15;
    const textWidth = this.bold.widthOfTextAtSize(plateText, textSize);
    const stripWidth = 16;
    const badgeWidth = stripWidth + textWidth + 24;
    const left = x - badgeWidth;

    this.page.drawRectangle({ x: left, y, width: badgeWidth, height, color: COLORS.plateYellow });
    this.page.drawRectangle({ x: left, y, width: stripWidth, height, color: COLORS.plateBlue });
    this.page.drawText("NL", {
      x: left + 3,
      y: y + height / 2 - 3,
      font: this.bold,
      size: 7,
      color: COLORS.white
    });
    this.page.drawText(plateText, {
      x: left + stripWidth + 12,
      y: y + height / 2 - textSize / 2 + 1.5,
      font: this.bold,
      size: textSize,
      color: rgb(0.08, 0.08, 0.08)
    });
  }

  private drawCoverHeader() {
    const { locale, generatedAt } = this.args;
    this.page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - COVER_HEADER_HEIGHT,
      width: PAGE_WIDTH,
      height: COVER_HEADER_HEIGHT,
      color: COLORS.navy
    });
    this.page.drawText("Kentekenrapport", {
      x: MARGIN,
      y: PAGE_HEIGHT - 42,
      font: this.bold,
      size: 23,
      color: COLORS.white
    });
    this.page.drawText(locale === "nl" ? "Volledig voertuigrapport" : "Complete vehicle report", {
      x: MARGIN,
      y: PAGE_HEIGHT - 62,
      font: this.regular,
      size: 11,
      color: rgb(0.72, 0.8, 0.95)
    });
    this.page.drawText(
      `${locale === "nl" ? "Gegenereerd op" : "Generated on"} ${generatedAt.toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB")}`,
      {
        x: MARGIN,
        y: PAGE_HEIGHT - 78,
        font: this.regular,
        size: 9,
        color: rgb(0.6, 0.68, 0.82)
      }
    );
    this.drawPlateBadge(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 66, 34);
  }

  private drawSlimHeader() {
    const { locale } = this.args;
    this.page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - SLIM_HEADER_HEIGHT,
      width: PAGE_WIDTH,
      height: SLIM_HEADER_HEIGHT,
      color: COLORS.navy
    });
    this.page.drawText("Kentekenrapport", {
      x: MARGIN,
      y: PAGE_HEIGHT - 26,
      font: this.bold,
      size: 12,
      color: COLORS.white
    });
    this.page.drawText(
      `${locale === "nl" ? "Kenteken" : "Plate"} ${formatDisplayPlate(this.args.plate) || this.args.plate}`,
      {
        x: PAGE_WIDTH - MARGIN - 130,
        y: PAGE_HEIGHT - 26,
        font: this.regular,
        size: 10,
        color: rgb(0.75, 0.82, 0.95)
      }
    );
  }

  private addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.drawSlimHeader();
    this.y = PAGE_HEIGHT - SLIM_HEADER_HEIGHT - 24;
  }

  ensureHeight(height: number) {
    if (this.y - height < FOOTER_RESERVE) this.addPage();
  }

  space(height: number) {
    this.y -= height;
  }

  section(title: string) {
    this.sectionIndex += 1;
    this.ensureHeight(70);
    this.y -= 10;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 16,
      width: 3.5,
      height: 15,
      color: COLORS.blue
    });
    this.page.drawText(`${this.sectionIndex}. ${sanitize(title)}`, {
      x: MARGIN + 11,
      y: this.y - 13,
      font: this.bold,
      size: 12.5,
      color: COLORS.navy
    });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 23 },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y - 23 },
      thickness: 0.7,
      color: COLORS.line
    });
    this.y -= 34;
  }

  paragraph(text: string, options?: { size?: number; color?: ReturnType<typeof rgb>; font?: PDFFont }) {
    const size = options?.size ?? 9.5;
    const font = options?.font ?? this.regular;
    const lines = splitText(text, font, size, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureHeight(size + 5);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y - size,
        font,
        size,
        color: options?.color ?? COLORS.text
      });
      this.y -= size + 4;
    }
    this.y -= 4;
  }

  note(text: string, tone: ChipTone = "neutral") {
    const { bg, fg } = chipColors(tone);
    const size = 9.5;
    const lines = splitText(text, this.regular, size, CONTENT_WIDTH - 24);
    const height = lines.length * (size + 4) + 12;
    this.ensureHeight(height + 4);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - height,
      width: CONTENT_WIDTH,
      height,
      color: bg
    });
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - height,
      width: 3,
      height,
      color: fg
    });
    lines.forEach((line, index) => {
      this.page.drawText(line, {
        x: MARGIN + 12,
        y: this.y - 15 - index * (size + 4),
        font: this.regular,
        size,
        color: COLORS.text
      });
    });
    this.y -= height + 8;
  }

  bullets(items: string[], bulletColor?: ReturnType<typeof rgb>) {
    const size = 9.5;
    for (const item of items) {
      const lines = splitText(item, this.regular, size, CONTENT_WIDTH - 16);
      this.ensureHeight(lines.length * (size + 4) + 2);
      this.page.drawCircle({
        x: MARGIN + 4,
        y: this.y - size + 2.5,
        size: 1.7,
        color: bulletColor ?? COLORS.blue
      });
      lines.forEach((line, index) => {
        this.page.drawText(line, {
          x: MARGIN + 14,
          y: this.y - size - index * (size + 4),
          font: this.regular,
          size,
          color: COLORS.text
        });
      });
      this.y -= lines.length * (size + 4) + 3;
    }
    this.y -= 4;
  }

  // Two-column grid of small label-above-value cells.
  specGrid(pairs: Array<[string, string]>) {
    const filtered = pairs.filter(([, value]) => value !== "-");
    const colWidth = (CONTENT_WIDTH - 16) / 2;
    const cellHeight = 32;
    for (let i = 0; i < filtered.length; i += 2) {
      this.ensureHeight(cellHeight + 4);
      const rowPairs = filtered.slice(i, i + 2);
      rowPairs.forEach(([label, value], col) => {
        const x = MARGIN + col * (colWidth + 16);
        this.page.drawText(sanitize(label).toUpperCase(), {
          x,
          y: this.y - 9,
          font: this.bold,
          size: 6.8,
          color: COLORS.textSoft
        });
        const valueLine = splitText(value, this.regular, 10, colWidth)[0] ?? "-";
        this.page.drawText(valueLine, {
          x,
          y: this.y - 23,
          font: this.regular,
          size: 10,
          color: COLORS.text
        });
        this.page.drawLine({
          start: { x, y: this.y - cellHeight + 2 },
          end: { x: x + colWidth, y: this.y - cellHeight + 2 },
          thickness: 0.5,
          color: COLORS.line
        });
      });
      this.y -= cellHeight + 2;
    }
    this.y -= 6;
  }

  chips(items: Array<{ label: string; tone: ChipTone }>) {
    const size = 8.5;
    const chipHeight = 18;
    const gap = 6;
    let x = MARGIN;
    this.ensureHeight(chipHeight + 6);
    for (const item of items) {
      const label = sanitize(item.label);
      const width = this.bold.widthOfTextAtSize(label, size) + 16;
      if (x + width > MARGIN + CONTENT_WIDTH) {
        this.y -= chipHeight + gap;
        this.ensureHeight(chipHeight + 6);
        x = MARGIN;
      }
      const { bg, fg } = chipColors(item.tone);
      this.page.drawRectangle({ x, y: this.y - chipHeight, width, height: chipHeight, color: bg });
      this.page.drawText(label, {
        x: x + 8,
        y: this.y - chipHeight + 5.5,
        font: this.bold,
        size,
        color: fg
      });
      x += width + gap;
    }
    this.y -= chipHeight + 12;
  }

  cardRow(cards: Array<{ title: string; value: string; sub?: string; accent?: ReturnType<typeof rgb> }>) {
    if (cards.length === 0) return;
    const gap = 10;
    const cardWidth = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;
    const cardHeight = 58;
    this.ensureHeight(cardHeight + 8);
    cards.forEach((card, index) => {
      const x = MARGIN + index * (cardWidth + gap);
      this.page.drawRectangle({
        x,
        y: this.y - cardHeight,
        width: cardWidth,
        height: cardHeight,
        color: COLORS.cardBg,
        borderColor: COLORS.line,
        borderWidth: 0.8
      });
      this.page.drawRectangle({
        x,
        y: this.y - cardHeight,
        width: cardWidth,
        height: 3,
        color: card.accent ?? COLORS.blue
      });
      this.page.drawText(sanitize(card.title).toUpperCase(), {
        x: x + 10,
        y: this.y - 17,
        font: this.bold,
        size: 6.8,
        color: COLORS.textSoft
      });
      const valueLine = splitText(card.value, this.bold, 13, cardWidth - 20)[0] ?? "-";
      this.page.drawText(valueLine, {
        x: x + 10,
        y: this.y - 34,
        font: this.bold,
        size: 13,
        color: card.accent ?? COLORS.navy
      });
      if (card.sub) {
        const subLine = splitText(card.sub, this.regular, 7.5, cardWidth - 20)[0] ?? "";
        this.page.drawText(subLine, {
          x: x + 10,
          y: this.y - 48,
          font: this.regular,
          size: 7.5,
          color: COLORS.textSoft
        });
      }
    });
    this.y -= cardHeight + 10;
  }

  table(headers: string[], rows: string[][], relWidths?: number[]) {
    const rel = relWidths ?? headers.map(() => 1 / headers.length);
    const widths = rel.map((w) => w * CONTENT_WIDTH);
    const adjust = CONTENT_WIDTH - widths.reduce((a, b) => a + b, 0);
    widths[widths.length - 1] += adjust;

    const drawRow = (cols: string[], kind: "header" | "even" | "odd") => {
      const font = kind === "header" ? this.bold : this.regular;
      const wrapped = cols.map((col, idx) => splitText(col, font, 8.5, widths[idx] - 12));
      const maxLines = Math.max(...wrapped.map((w) => w.length), 1);
      const h = maxLines * 11 + 9;
      this.ensureHeight(h + 2);
      const bg = kind === "header" ? COLORS.blueSoft : kind === "even" ? COLORS.white : COLORS.cardBg;
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - h,
        width: CONTENT_WIDTH,
        height: h,
        color: bg
      });
      this.page.drawLine({
        start: { x: MARGIN, y: this.y - h },
        end: { x: MARGIN + CONTENT_WIDTH, y: this.y - h },
        thickness: 0.5,
        color: COLORS.line
      });
      let x = MARGIN;
      for (let c = 0; c < widths.length; c += 1) {
        wrapped[c].forEach((line, i) => {
          this.page.drawText(line, {
            x: x + 6,
            y: this.y - 12 - i * 11,
            font,
            size: 8.5,
            color: kind === "header" ? COLORS.navy : COLORS.text
          });
        });
        x += widths[c];
      }
      this.y -= h;
    };

    drawRow(headers, "header");
    rows.forEach((r, index) => drawRow(r.slice(0, headers.length), index % 2 === 0 ? "even" : "odd"));
    this.y -= 10;
  }

  valueBar(min: number, now: number, max: number, locale: Locale) {
    const barHeight = 46;
    this.ensureHeight(barHeight + 8);
    const barWidth = CONTENT_WIDTH - 20;
    const barX = MARGIN + 10;
    const barY = this.y - 26;
    const rangeMin = min * 0.92;
    const rangeMax = max * 1.08;
    const diff = rangeMax - rangeMin || 1;
    const pos = (value: number) => barX + Math.max(0, Math.min(barWidth, ((value - rangeMin) / diff) * barWidth));

    this.page.drawLine({
      start: { x: barX, y: barY },
      end: { x: barX + barWidth, y: barY },
      thickness: 6,
      color: COLORS.neutralBg
    });
    this.page.drawLine({
      start: { x: pos(min), y: barY },
      end: { x: pos(max), y: barY },
      thickness: 6,
      color: COLORS.blue
    });
    const px = pos(now);
    this.page.drawCircle({ x: px, y: barY, size: 5, color: COLORS.navy });

    const nowLabel = fmtCurrency(now, locale);
    const nowWidth = this.bold.widthOfTextAtSize(nowLabel, 9.5);
    this.page.drawText(nowLabel, {
      x: Math.max(barX, Math.min(barX + barWidth - nowWidth, px - nowWidth / 2)),
      y: barY + 10,
      font: this.bold,
      size: 9.5,
      color: COLORS.navy
    });
    this.page.drawText(fmtCurrency(min, locale), {
      x: pos(min),
      y: barY - 16,
      font: this.regular,
      size: 8,
      color: COLORS.textSoft
    });
    const maxLabel = fmtCurrency(max, locale);
    this.page.drawText(maxLabel, {
      x: pos(max) - this.regular.widthOfTextAtSize(maxLabel, 8),
      y: barY - 16,
      font: this.regular,
      size: 8,
      color: COLORS.textSoft
    });
    this.y -= barHeight + 6;
  }

  drawFooters() {
    const pages = this.doc.getPages();
    const total = pages.length;
    const { locale, generatedAt } = this.args;
    const label =
      locale === "nl"
        ? `Kentekenrapport · kentekenrapport.com · ${generatedAt.toLocaleDateString("nl-NL")}`
        : `Kentekenrapport · kentekenrapport.com · ${generatedAt.toLocaleDateString("en-GB")}`;
    pages.forEach((page, index) => {
      page.drawLine({
        start: { x: MARGIN, y: 40 },
        end: { x: PAGE_WIDTH - MARGIN, y: 40 },
        thickness: 0.5,
        color: COLORS.line
      });
      page.drawText(label, {
        x: MARGIN,
        y: 28,
        font: this.regular,
        size: 7.5,
        color: COLORS.textSoft
      });
      const pageLabel = locale === "nl" ? `Pagina ${index + 1} van ${total}` : `Page ${index + 1} of ${total}`;
      page.drawText(pageLabel, {
        x: PAGE_WIDTH - MARGIN - this.regular.widthOfTextAtSize(pageLabel, 7.5),
        y: 28,
        font: this.regular,
        size: 7.5,
        color: COLORS.textSoft
      });
    });
  }
}

function drawIdentityBlock(layout: PdfLayout, args: ReportArgs, regular: PDFFont, bold: PDFFont, image: PDFImage | null) {
  const { locale, data } = args;
  const vehicle = asRow(data.vehicle);
  const enriched = asRow(data.enriched);
  const blockHeight = 96;
  const imageWidth = 168;
  const textWidth = CONTENT_WIDTH - imageWidth - 16;
  const top = layout.y;

  const brand = s(vehicle.brand);
  const model = s(vehicle.tradeName);
  layout.page.drawText(splitText(`${brand} ${model !== "-" ? model : ""}`.trim(), bold, 18, textWidth)[0] ?? brand, {
    x: MARGIN,
    y: top - 18,
    font: bold,
    size: 18,
    color: COLORS.navy
  });

  const metaParts = [
    s(vehicle.year),
    s(vehicle.fuelType),
    s(vehicle.bodyType),
    s(asRow(vehicle.color).primary)
  ].filter((part) => part !== "-");
  layout.page.drawText(splitText(metaParts.join("  ·  "), regular, 10, textWidth)[0] ?? "", {
    x: MARGIN,
    y: top - 36,
    font: regular,
    size: 10,
    color: COLORS.textSoft
  });

  const factLines: string[] = [];
  if (present(enriched.ageString)) {
    factLines.push(`${locale === "nl" ? "Leeftijd" : "Age"}: ${s(enriched.ageString)}`);
  }
  if (present(asRow(vehicle.owners).count)) {
    factLines.push(`${locale === "nl" ? "Aantal eigenaren" : "Owners"}: ${s(asRow(vehicle.owners).count)}`);
  }
  if (present(vehicle.cataloguePrice)) {
    factLines.push(`${locale === "nl" ? "Nieuwprijs (catalogus)" : "List price (new)"}: ${fmtCurrency(vehicle.cataloguePrice, locale)}`);
  }
  factLines.slice(0, 3).forEach((line, index) => {
    layout.page.drawText(splitText(line, regular, 9.5, textWidth)[0] ?? "", {
      x: MARGIN,
      y: top - 56 - index * 14,
      font: regular,
      size: 9.5,
      color: COLORS.text
    });
  });

  const imageX = MARGIN + textWidth + 16;
  if (image) {
    const scale = Math.min(imageWidth / image.width, (blockHeight - 8) / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    layout.page.drawImage(image, {
      x: imageX + (imageWidth - w) / 2,
      y: top - blockHeight + (blockHeight - h) / 2,
      width: w,
      height: h
    });
  }

  layout.y = top - blockHeight - 6;
  layout.page.drawLine({
    start: { x: MARGIN, y: layout.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: layout.y },
    thickness: 0.7,
    color: COLORS.line
  });
  layout.y -= 14;
}

function buildStatusChips(args: ReportArgs): Array<{ label: string; tone: ChipTone }> {
  const { locale, data } = args;
  const vehicle = asRow(data.vehicle);
  const enriched = asRow(data.enriched);
  const nl = locale === "nl";
  const chips: Array<{ label: string; tone: ChipTone }> = [];

  const nap = present(vehicle.napVerdict) ? String(vehicle.napVerdict) : null;
  if (nap) {
    const lower = nap.toLowerCase();
    chips.push({
      label: nl ? `Tellerstand: ${nap}` : `Odometer: ${nap}`,
      tone: lower.includes("onlogisch") ? "bad" : lower.includes("logisch") ? "ok" : "neutral"
    });
  }
  chips.push({
    label: vehicle.wok === true ? (nl ? "WOK-melding" : "WOK status") : nl ? "Geen WOK-melding" : "No WOK status",
    tone: vehicle.wok === true ? "bad" : "ok"
  });
  chips.push({
    label:
      vehicle.hasOpenRecall === true
        ? nl
          ? "Openstaande terugroepactie"
          : "Open recall"
        : nl
          ? "Geen openstaande terugroepactie"
          : "No open recall",
    tone: vehicle.hasOpenRecall === true ? "bad" : "ok"
  });
  chips.push({
    label: vehicle.insured === true ? (nl ? "WAM-verzekerd" : "Insured (WAM)") : nl ? "Niet WAM-verzekerd" : "Not insured (WAM)",
    tone: vehicle.insured === true ? "ok" : "warn"
  });
  if (vehicle.isTaxi === true) {
    chips.push({ label: nl ? "Taxi-verleden" : "Taxi history", tone: "warn" });
  }
  if (enriched.isImported === true) {
    chips.push({ label: nl ? "Geïmporteerd voertuig" : "Imported vehicle", tone: "warn" });
  }
  if (vehicle.exportIndicator === true) {
    chips.push({ label: nl ? "Geregistreerd voor export" : "Registered for export", tone: "bad" });
  }
  return chips;
}

function buildReport(layout: PdfLayout, args: ReportArgs) {
  const { locale, data, aiInsights, aiValuation } = args;
  const nl = locale === "nl";
  const vehicle = asRow(data.vehicle);
  const enriched = asRow(data.enriched);
  const engine = asRow(vehicle.engine);
  const weight = asRow(vehicle.weight);
  const inspections = asRows(data.inspections);
  const recalls = asRows(data.recalls);
  const defects = asRows(data.defects);
  const defectDescriptions = asRow(data.defectDescriptions);
  const knownIssues = asRows(enriched.knownIssues);
  const repairChances = asRows(enriched.repairChances);
  const mileageAnomalies = asRows(enriched.mileageAnomalies);

  // --- At a glance dashboard ---
  const valueNow = aiValuation?.estimatedValueNow ?? toNumber(enriched.estimatedValueNow);
  layout.cardRow([
    {
      title: nl ? "AI-aankoopadvies" : "AI purchase advice",
      value: verdictLabel(aiInsights?.purchaseVerdict, locale),
      accent: verdictColor(aiInsights?.purchaseVerdict)
    },
    {
      title: nl ? "Risiconiveau" : "Risk level",
      value: riskLabel(aiInsights?.riskLevel, locale),
      accent: riskColor(aiInsights?.riskLevel)
    },
    {
      title: nl ? "Marktwaarde" : "Market value",
      value: valueNow !== null ? fmtCurrency(valueNow, locale) : "-",
      sub: nl ? "indicatie" : "estimate",
      accent: COLORS.navy
    },
    {
      title: nl ? "APK geldig tot" : "MOT (APK) valid until",
      value: fmtDate(vehicle.apkExpiryDate),
      accent: COLORS.blue
    }
  ]);

  layout.chips(buildStatusChips(args));

  // --- 1. Summary & advice ---
  layout.section(nl ? "Samenvatting & advies" : "Summary & advice");
  if (aiInsights) {
    layout.paragraph(aiInsights.summary);
    if (aiInsights.recommendation) {
      layout.note(aiInsights.recommendation, aiInsights.riskLevel === "HIGH" ? "warn" : "neutral");
    }
    if (aiInsights.recommendations.length > 0) {
      layout.paragraph(nl ? "Concrete vervolgstappen:" : "Concrete next steps:", { font: undefined, size: 9.5, color: COLORS.navy });
      layout.bullets(aiInsights.recommendations);
    }
  } else {
    layout.note(nl ? "AI-analyse is voor dit rapport niet beschikbaar." : "AI analysis is not available for this report.");
  }

  // --- 2. Vehicle details ---
  layout.section(nl ? "Voertuiggegevens" : "Vehicle details");
  layout.specGrid([
    [nl ? "Merk" : "Brand", s(vehicle.brand)],
    [nl ? "Model" : "Model", s(vehicle.tradeName)],
    [nl ? "Bouwjaar" : "Year", s(vehicle.year)],
    [nl ? "Carrosserie" : "Body type", s(vehicle.bodyType)],
    [nl ? "Kleur" : "Color", s(asRow(vehicle.color).primary)],
    [nl ? "Deuren / zitplaatsen" : "Doors / seats", present(vehicle.doors) || present(vehicle.seats) ? `${s(vehicle.doors)} / ${s(vehicle.seats)}` : "-"],
    [nl ? "Brandstof" : "Fuel", s(vehicle.fuelType)],
    [nl ? "Cilinderinhoud" : "Engine displacement", present(engine.displacement) ? `${fmtNumber(engine.displacement, locale)} cc` : "-"],
    [nl ? "Cilinders" : "Cylinders", s(engine.cylinders)],
    [nl ? "Vermogen" : "Power", present(engine.powerKw) ? `${s(engine.powerKw)} kW (${fmtNumber(Number(engine.powerKw) * 1.3596, locale)} pk)` : "-"],
    [nl ? "Massa leeg / max." : "Weight empty / max", present(weight.empty) || present(weight.max) ? `${fmtNumber(weight.empty, locale, " kg")} / ${fmtNumber(weight.max, locale, " kg")}` : "-"],
    [nl ? "Energielabel" : "Energy label", s(vehicle.energyLabel)],
    ["CO2", present(vehicle.co2) ? `${s(vehicle.co2)} g/km` : "-"],
    [nl ? "Verbruik gecombineerd" : "Combined consumption", present(vehicle.consumptionCombined) ? `${s(vehicle.consumptionCombined)} l/100km` : "-"],
    [nl ? "Emissieklasse" : "Emission standard", s(vehicle.emissionStandard)],
    [nl ? "Nieuwprijs (catalogus)" : "List price (new)", fmtCurrency(vehicle.cataloguePrice, locale)]
  ]);

  // --- 3. History & registration ---
  layout.section(nl ? "Historie & registratie" : "History & registration");
  layout.specGrid([
    [nl ? "Eerste toelating" : "First admission", fmtDate(vehicle.firstRegistrationWorld)],
    [nl ? "Eerste registratie in NL" : "First registration in NL", fmtDate(vehicle.firstRegistrationNL)],
    [nl ? "Aantal eigenaren" : "Number of owners", s(asRow(vehicle.owners).count)],
    [nl ? "Geïmporteerd" : "Imported", boolLabel(enriched.isImported, locale)],
    [nl ? "Tellerstandoordeel (RDW)" : "Odometer judgment (RDW)", s(vehicle.napVerdict)],
    [nl ? "Laatste tellerregistratie" : "Last odometer registration", s(vehicle.napLastYear)],
    [nl ? "Tenaamstelling mogelijk" : "Transfer possible", boolLabel(vehicle.transferPossible, locale)],
    [nl ? "Taxi-verleden" : "Taxi history", boolLabel(vehicle.isTaxi, locale)]
  ]);

  // --- 4. Mileage analysis ---
  const hasMileage =
    present(enriched.estimatedMileageNow) || present(enriched.mileageUsageProfile) || mileageAnomalies.length > 0;
  if (hasMileage) {
    layout.section(nl ? "Kilometerstand-analyse" : "Mileage analysis");
    layout.specGrid([
      [nl ? "Geschatte stand nu" : "Estimated mileage now", fmtNumber(enriched.estimatedMileageNow, locale, " km")],
      [
        nl ? "Bandbreedte" : "Range",
        present(enriched.estimatedMileageMin) && present(enriched.estimatedMileageMax)
          ? `${fmtNumber(enriched.estimatedMileageMin, locale)} - ${fmtNumber(enriched.estimatedMileageMax, locale, " km")}`
          : "-"
      ],
      [nl ? "Gemiddeld per jaar" : "Average per year", fmtNumber(enriched.mileageSlopeKmPerYear, locale, " km")],
      [nl ? "Gebruiksprofiel" : "Usage profile", s(enriched.mileageUsageProfile)]
    ]);
    const verdict = present(enriched.mileageVerdict) ? String(enriched.mileageVerdict) : null;
    if (verdict && verdict !== "UNKNOWN") {
      const tone: ChipTone = verdict === "LOGISCH" ? "ok" : verdict === "ONLOGISCH" ? "bad" : "warn";
      layout.note(
        nl
          ? `Beoordeling kilometerstand: ${verdict === "LOGISCH" ? "logisch verloop" : verdict === "ONLOGISCH" ? "onlogisch verloop - extra controle aanbevolen" : "twijfelachtig verloop - vraag om onderhoudshistorie"}`
          : `Mileage assessment: ${verdict === "LOGISCH" ? "consistent progression" : verdict === "ONLOGISCH" ? "inconsistent progression - extra checks advised" : "questionable progression - ask for service history"}`,
        tone
      );
    }
    if (mileageAnomalies.length > 0) {
      layout.bullets(
        mileageAnomalies.map((anomaly) => s(anomaly.message)),
        COLORS.amber
      );
    }
  }

  // --- 5. APK & inspection history ---
  layout.section(nl ? "APK & keuringshistorie" : "MOT (APK) & inspection history");
  layout.specGrid([
    [nl ? "APK geldig tot" : "APK valid until", fmtDate(vehicle.apkExpiryDate)],
    [nl ? "Slagingskans volgende APK" : "Next APK pass chance", present(enriched.apkPassChance) ? `${s(enriched.apkPassChance)}%` : "-"],
    [nl ? "Onderhoudsrisico (1-10)" : "Maintenance risk (1-10)", s(enriched.maintenanceRiskScore)]
  ]);

  if (inspections.length > 0) {
    layout.table(
      [nl ? "Datum" : "Date", nl ? "Type keuring" : "Inspection type", nl ? "Gebreken" : "Defects", nl ? "Gebrekcode" : "Defect code"],
      inspections.map((it) => [
        fmtDate(it.meld_datum_door_keuringsinstantie_dt ?? it.meld_datum_door_keuringsinstantie),
        s(it.soort_erkenning_omschrijving),
        s(it.aantal_gebreken_geconstateerd),
        s(it.gebrek_identificatie)
      ]),
      [0.18, 0.42, 0.18, 0.22]
    );
  } else {
    layout.note(
      nl ? "Geen keuringshistorie gevonden in de RDW-data voor dit voertuig." : "No inspection history found in the RDW data for this vehicle."
    );
  }

  const derivedDefects =
    defects.length > 0
      ? defects
      : inspections
          .filter((it) => present(it.gebrek_identificatie))
          .map((it) => {
            const code = s(it.gebrek_identificatie);
            return { gebrek_identificatie: code, gebrek_omschrijving: s(defectDescriptions[code]) };
          });
  const defectRows = derivedDefects
    .map((it) => {
      const row = it as Row;
      const code = s(row.gebrek_identificatie);
      return [code, s(row.gebrek_omschrijving ?? defectDescriptions[code])];
    })
    .filter(([code, description]) => code !== "-" || description !== "-");
  if (defectRows.length > 0) {
    layout.paragraph(nl ? "Geconstateerde gebreken:" : "Recorded defects:", { size: 9.5, color: COLORS.navy });
    layout.table([nl ? "Code" : "Code", nl ? "Omschrijving" : "Description"], defectRows, [0.15, 0.85]);
  } else {
    layout.note(nl ? "Geen geregistreerde gebreken gevonden." : "No recorded defects found.", "ok");
  }

  // --- 6. Recalls ---
  layout.section(nl ? "Terugroepacties" : "Recalls");
  if (recalls.length > 0) {
    layout.table(
      [nl ? "Campagne" : "Campaign", nl ? "Omschrijving defect" : "Defect description", nl ? "Status" : "Status"],
      recalls.map((it) => [s(it.campagnenummer), s(it.omschrijving_defect), s(it.status)]),
      [0.18, 0.62, 0.2]
    );
  } else {
    layout.note(nl ? "Geen terugroepacties bekend voor dit voertuig." : "No known recalls for this vehicle.", "ok");
  }

  // --- 7. Market value & costs ---
  layout.section(nl ? "Marktwaarde & kosten" : "Market value & running costs");
  const vNow = aiValuation?.estimatedValueNow ?? toNumber(enriched.estimatedValueNow);
  const vMin = aiValuation?.estimatedValueMin ?? toNumber(enriched.estimatedValueMin);
  const vMax = aiValuation?.estimatedValueMax ?? toNumber(enriched.estimatedValueMax);
  if (vNow !== null && vMin !== null && vMax !== null && vMax > vMin) {
    layout.valueBar(vMin, vNow, vMax, locale);
  }
  layout.specGrid([
    [nl ? "Geschatte waarde nu" : "Estimated value now", fmtCurrency(vNow, locale)],
    [
      nl ? "Bandbreedte" : "Range",
      vMin !== null && vMax !== null ? `${fmtCurrency(vMin, locale)} - ${fmtCurrency(vMax, locale)}` : "-"
    ],
    [nl ? "Verwachte waarde volgend jaar" : "Expected value next year", fmtCurrency(enriched.estimatedValueNextYear, locale)],
    [
      nl ? "Betrouwbaarheid schatting" : "Estimate confidence",
      confidenceLabel((aiValuation?.confidence ?? enriched.marketValueConfidence) as string | null, locale)
    ]
  ]);

  const roadTax = asRow(enriched.roadTaxEstQuarter);
  layout.cardRow([
    {
      title: nl ? "Wegenbelasting" : "Road tax",
      value:
        present(roadTax.min) && present(roadTax.max)
          ? `${fmtCurrency(roadTax.min, locale)} - ${fmtCurrency(roadTax.max, locale)}`
          : "-",
      sub: nl ? "per kwartaal" : "per quarter"
    },
    {
      title: nl ? "Verzekering" : "Insurance",
      value: fmtCurrency(enriched.insuranceEstMonth, locale),
      sub: nl ? "per maand (indicatie)" : "per month (estimate)"
    },
    {
      title: nl ? "Brandstof" : "Fuel",
      value: fmtCurrency(enriched.fuelEstMonth, locale),
      sub: nl ? "per maand (indicatie)" : "per month (estimate)"
    }
  ]);

  if (aiValuation?.explanation) {
    layout.paragraph(aiValuation.explanation);
  }
  if (aiValuation?.factors?.length) {
    layout.bullets(aiValuation.factors);
  }

  // --- 8. Maintenance & attention points ---
  if (repairChances.length > 0 || knownIssues.length > 0) {
    layout.section(nl ? "Onderhoud & aandachtspunten" : "Maintenance & attention points");
    if (repairChances.length > 0) {
      layout.table(
        [nl ? "Onderdeel" : "Component", nl ? "Kans" : "Chance", nl ? "Kostenindicatie" : "Cost estimate"],
        repairChances.map((it) => [
          s(it.name),
          present(it.chance) ? `${s(it.chance)}%` : "-",
          present(it.estMin) && present(it.estMax) ? `${fmtCurrency(it.estMin, locale)} - ${fmtCurrency(it.estMax, locale)}` : "-"
        ]),
        [0.4, 0.2, 0.4]
      );
    }
    if (knownIssues.length > 0) {
      layout.table(
        [nl ? "Aandachtspunt" : "Known issue", nl ? "Ernst" : "Severity", nl ? "Advies" : "Advice"],
        knownIssues.map((it) => [s(it.title), confidenceLabel(present(it.severity) ? String(it.severity) : null, locale), s(it.advice)]),
        [0.3, 0.14, 0.56]
      );
    }
  }

  // --- 9. Strengths & risks (AI detail) ---
  if (aiInsights && (aiInsights.positives.length > 0 || aiInsights.risks.length > 0)) {
    layout.section(nl ? "Sterke punten & risico's" : "Strengths & risks");
    if (aiInsights.positives.length > 0) {
      layout.paragraph(nl ? "Sterke punten:" : "Strengths:", { size: 9.5, color: COLORS.green });
      layout.bullets(aiInsights.positives, COLORS.green);
    }
    if (aiInsights.risks.length > 0) {
      layout.paragraph(nl ? "Risico's:" : "Risks:", { size: 9.5, color: COLORS.red });
      layout.bullets(aiInsights.risks, COLORS.red);
    }
  }

  // --- 10. About this report ---
  layout.section(nl ? "Over dit rapport" : "About this report");
  layout.paragraph(
    nl
      ? `Dit rapport voor kenteken ${formatDisplayPlate(args.plate) || args.plate} is samengesteld op basis van open data van de RDW (voertuiggegevens, APK-historie, terugroepacties en tellerstandoordeel). Marktwaarde, kostenindicaties, kansen en het aankoopadvies zijn indicatieve schattingen, deels gegenereerd met AI-modellen, en kunnen afwijken van de werkelijkheid. Aan dit rapport kunnen geen rechten worden ontleend. Controleer bij aankoop altijd de fysieke staat van het voertuig en de officiële documenten.`
      : `This report for license plate ${formatDisplayPlate(args.plate) || args.plate} is based on open data from the Dutch road authority RDW (vehicle data, APK history, recalls and odometer judgment). Market value, cost estimates, probabilities and the purchase advice are indicative estimates, partly generated by AI models, and may differ from reality. No rights can be derived from this report. Always check the physical condition of the vehicle and official documents before purchase.`,
    { size: 8.5, color: COLORS.textSoft }
  );
}

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    const buffer = await response.arrayBuffer();
    return { bytes: new Uint8Array(buffer), contentType };
  } catch {
    return null;
  }
}

async function embedImageIfAvailable(doc: PDFDocument, url: string): Promise<PDFImage | null> {
  const result = await fetchImageBytes(url);
  if (!result) return null;
  if (result.contentType.includes("png")) {
    try {
      return await doc.embedPng(result.bytes);
    } catch {
      return null;
    }
  }
  if (result.contentType.includes("jpeg") || result.contentType.includes("jpg")) {
    try {
      return await doc.embedJpg(result.bytes);
    } catch {
      return null;
    }
  }
  try {
    return await doc.embedJpg(result.bytes);
  } catch {
    try {
      return await doc.embedPng(result.bytes);
    } catch {
      return null;
    }
  }
}

export async function generateVehicleReportPdf(args: ReportArgs): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const layout = new PdfLayout(doc, regular, bold, args);

  const vehicle = asRow(args.data.vehicle);
  const vehicleColor = asRow(vehicle.color).primary;
  const imageUrl = getVehicleImageUrl(
    typeof vehicle.brand === "string" ? vehicle.brand : null,
    typeof vehicle.tradeName === "string" ? vehicle.tradeName : null,
    {
      angle: "01",
      zoomtype: "relative",
      color: typeof vehicleColor === "string" ? vehicleColor : null
    }
  );
  const vehicleImage = await embedImageIfAvailable(doc, imageUrl);

  drawIdentityBlock(layout, args, regular, bold, vehicleImage);
  buildReport(layout, args);
  layout.drawFooters();

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
