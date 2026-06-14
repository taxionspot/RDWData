import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont, type PDFImage } from "pdf-lib";
import { formatDisplayPlate } from "@/lib/rdw/normalize";
import { getVehicleImageUrl } from "@/lib/utils/imagin";
import { computeNegotiationPricing } from "@/lib/api/negotiation-pricing";
import type { VehicleSignalReport } from "@/lib/vehicle/signals";
import {
  toneToPdfWord,
  accentForTone,
  inkForTone,
  pdfSectionTitle
} from "@/lib/vehicle/pdf-presentation";
import type { ComparableCar } from "@/lib/listings/comparable";
import type { ModelStats } from "@/lib/stats/modelStats";
import type { ScoreResult } from "@/lib/vehicle/score";

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
  signals?: VehicleSignalReport | null;
  /** Top comparable cars from the shared Apify pool, pre-filtered + ranked. null = skip section. */
  comparables?: ComparableCar[] | null;
  /** Model cohort APK statistics (30-day Mongo cache). null = skip stats table. */
  modelStats?: ModelStats | null;
  /** Kentekenrapport Score derived from official RDW signals. null = skip score block. */
  score?: ScoreResult | null;
};

type Row = Record<string, unknown>;

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 92;
const FONT_SIZE = 10;
const LINE_HEIGHT = 14;

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" ? (value as Row) : {};
}

function s(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function currency(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `EUR ${Math.round(num).toLocaleString("nl-NL")}`;
}

function kmLabel(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${Math.round(num).toLocaleString("nl-NL")} km`;
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Maps purchaseVerdict to a signal tone for the calmer accentForTone palette. */
function verdictTone(verdict: AiInsights["purchaseVerdict"]): "ok" | "warn" | "danger" {
  if (verdict === "BUY") return "ok";
  if (verdict === "CONSIDER" || verdict === "CAUTION") return "warn";
  return "danger";
}

/** Maps riskLevel to a signal tone for the calmer accentForTone palette. */
function riskTone(level: AiInsights["riskLevel"]): "ok" | "warn" | "danger" {
  if (level === "LOW") return "ok";
  if (level === "MEDIUM") return "warn";
  return "danger";
}

function splitText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const safe = text.replace(/[\u2013\u2014]/g, "-");
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

function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, args: ReportArgs) {
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - HEADER_HEIGHT,
    width: PAGE_WIDTH,
    height: HEADER_HEIGHT,
    color: rgb(0.05, 0.2, 0.45)
  });
  page.drawText("Kentekenrapport", {
    x: MARGIN,
    y: PAGE_HEIGHT - 36,
    font: bold,
    size: 22,
    color: rgb(1, 1, 1)
  });
  page.drawText(`${args.locale === "nl" ? "Kenteken" : "Plate"}: ${formatDisplayPlate(args.plate)}`, {
    x: MARGIN,
    y: PAGE_HEIGHT - 58,
    font: regular,
    size: 11,
    color: rgb(0.9, 0.94, 1)
  });
  page.drawText(
    `${args.locale === "nl" ? "Gegenereerd op" : "Generated at"}: ${args.generatedAt.toLocaleString(args.locale === "nl" ? "nl-NL" : "en-US")}`,
    {
      x: MARGIN,
      y: PAGE_HEIGHT - 74,
      font: regular,
      size: 10,
      color: rgb(0.8, 0.9, 1)
    }
  );
}

class PdfLayout {
  private doc: PDFDocument;
  private bold: PDFFont;
  private regular: PDFFont;
  private args: ReportArgs;
  public page: PDFPage;
  public y: number;
  public pages: PDFPage[] = [];
  public anchors: Array<{ title: string; pageIndex: number }> = [];

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont, args: ReportArgs) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.args = args;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    drawHeader(this.page, this.bold, this.regular, args);
    this.y = PAGE_HEIGHT - HEADER_HEIGHT - 16;
  }

  private addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    drawHeader(this.page, this.bold, this.regular, this.args);
    this.y = PAGE_HEIGHT - HEADER_HEIGHT - 16;
  }

  private ensureHeight(height: number) {
    if (this.y - height < MARGIN) this.addPage();
  }

  section(title: string) {
    this.ensureHeight(28);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 20,
      width: CONTENT_WIDTH,
      height: 20,
      color: rgb(0.92, 0.95, 1)
    });
    this.page.drawText(title, {
      x: MARGIN + 8,
      y: this.y - 14,
      font: this.bold,
      size: 11,
      color: rgb(0.08, 0.2, 0.45)
    });
    this.y -= 28;
  }

  keyValue(label: string, value: string) {
    const labelLines = splitText(label, this.bold, FONT_SIZE, 140);
    const valueLines = splitText(value, this.regular, FONT_SIZE, CONTENT_WIDTH - 160);
    const rows = Math.max(labelLines.length, valueLines.length);
    const blockHeight = rows * LINE_HEIGHT + 6;
    this.ensureHeight(blockHeight + 2);

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - blockHeight,
      width: CONTENT_WIDTH,
      height: blockHeight,
      color: rgb(0.985, 0.99, 1),
      borderColor: rgb(0.86, 0.9, 0.96),
      borderWidth: 0.5
    });

    for (let i = 0; i < rows; i += 1) {
      const ly = this.y - 14 - i * LINE_HEIGHT;
      if (labelLines[i]) {
        this.page.drawText(labelLines[i], { x: MARGIN + 8, y: ly, font: this.bold, size: FONT_SIZE, color: rgb(0.15, 0.22, 0.34) });
      }
      if (valueLines[i]) {
        this.page.drawText(valueLines[i], { x: MARGIN + 154, y: ly, font: this.regular, size: FONT_SIZE, color: rgb(0.18, 0.26, 0.38) });
      }
    }
    this.y -= blockHeight + 4;
  }

  bullets(items: string[]) {
    if (items.length === 0) {
      this.keyValue("-", "-");
      return;
    }
    items.forEach((item, index) => this.keyValue(`${index + 1}.`, item));
  }

  table(headers: string[], rows: string[][]) {
    // 4-col default; 5-col for comparable cars [Year, Km, Fuel, Price, Source]
    const widths = (headers.length === 5
      ? [0.10, 0.16, 0.16, 0.22, 0.36]
      : [0.22, 0.18, 0.3, 0.3]).slice(0, headers.length).map((w) => w * CONTENT_WIDTH);
    const adjust = CONTENT_WIDTH - widths.reduce((a, b) => a + b, 0);
    if (widths.length > 0) widths[widths.length - 1] += adjust;

    const drawRow = (cols: string[], header: boolean) => {
      const wrapped = cols.map((col, idx) => splitText(col, header ? this.bold : this.regular, 9, widths[idx] - 8));
      const maxLines = Math.max(...wrapped.map((w) => w.length), 1);
      const h = maxLines * 12 + 8;
      this.ensureHeight(h + 2);
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - h,
        width: CONTENT_WIDTH,
        height: h,
        color: header ? rgb(0.9, 0.94, 1) : rgb(1, 1, 1),
        borderColor: rgb(0.85, 0.9, 0.96),
        borderWidth: 0.5
      });
      let x = MARGIN;
      for (let c = 0; c < widths.length; c += 1) {
        if (c > 0) {
          this.page.drawLine({
            start: { x, y: this.y - h },
            end: { x, y: this.y },
            thickness: 0.4,
            color: rgb(0.85, 0.9, 0.96)
          });
        }
        const lines = wrapped[c];
        lines.forEach((line, i) => {
          this.page.drawText(line, {
            x: x + 4,
            y: this.y - 12 - i * 12,
            font: header ? this.bold : this.regular,
            size: 9,
            color: rgb(0.16, 0.24, 0.35)
          });
        });
        x += widths[c];
      }
      this.y -= h;
    };

    drawRow(headers, true);
    if (rows.length === 0) {
      drawRow(Array(headers.length).fill("-"), false);
    } else {
      rows.forEach((r) => drawRow(r.slice(0, headers.length), false));
    }
    this.y -= 6;
  }

  disclaimer(title: string, lines: string[]) {
    const size = 7.5;
    const lineHeight = 10;
    const wrapped = lines.flatMap((line) => splitText(line, this.regular, size, CONTENT_WIDTH - 16));
    const blockHeight = wrapped.length * lineHeight + 24;
    this.ensureHeight(blockHeight + 6);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - blockHeight,
      width: CONTENT_WIDTH,
      height: blockHeight,
      color: rgb(0.97, 0.975, 0.985),
      borderColor: rgb(0.86, 0.9, 0.96),
      borderWidth: 0.5
    });
    this.page.drawText(title, {
      x: MARGIN + 8,
      y: this.y - 13,
      font: this.bold,
      size: 8,
      color: rgb(0.3, 0.38, 0.5)
    });
    wrapped.forEach((line, index) => {
      this.page.drawText(line, {
        x: MARGIN + 8,
        y: this.y - 25 - index * lineHeight,
        font: this.regular,
        size,
        color: rgb(0.38, 0.45, 0.55)
      });
    });
    this.y -= blockHeight + 6;
  }

  drawCardRow(cards: Array<{ title: string; value: string; accent?: ReturnType<typeof rgb> }>) {
    if (cards.length === 0) return;
    const gap = 8;
    const cardWidth = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;
    const cardHeight = 66;
    this.ensureHeight(cardHeight + 8);
    cards.forEach((card, index) => {
      const x = MARGIN + index * (cardWidth + gap);
      this.page.drawRectangle({
        x,
        y: this.y - cardHeight,
        width: cardWidth,
        height: cardHeight,
        color: rgb(0.985, 0.99, 1),
        borderColor: rgb(0.86, 0.9, 0.96),
        borderWidth: 0.8
      });
      if (card.accent) {
        this.page.drawRectangle({
          x,
          y: this.y - cardHeight,
          width: 4,
          height: cardHeight,
          color: card.accent
        });
      }
      this.page.drawText(card.title, {
        x: x + 10,
        y: this.y - 18,
        font: this.bold,
        size: 9,
        color: rgb(0.2, 0.3, 0.42)
      });
      splitText(card.value, this.regular, 11, cardWidth - 20)
        .slice(0, 2)
        .forEach((line, lineIndex) => {
          this.page.drawText(line, {
            x: x + 10,
            y: this.y - 36 - lineIndex * 13,
            font: this.regular,
            size: 11,
            color: rgb(0.12, 0.2, 0.3)
          });
        });
    });
    this.y -= cardHeight + 8;
  }

  groupBanner(index: number, titleNl: string, titleEn: string, locale: "nl" | "en") {
    this.anchors.push({
      title: `${index}. ${locale === "nl" ? titleNl : titleEn}`,
      pageIndex: this.pages.indexOf(this.page)
    });
    this.ensureHeight(26);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 22,
      width: CONTENT_WIDTH,
      height: 22,
      color: rgb(0.06, 0.2, 0.45)
    });
    this.page.drawText(`${index}. ${locale === "nl" ? titleNl : titleEn}`, {
      x: MARGIN + 8,
      y: this.y - 15,
      font: this.bold,
      size: 11,
      color: rgb(1, 1, 1)
    });
    this.y -= 30;
  }

  drawJudgmentBlock(report: VehicleSignalReport, locale: "nl" | "en") {
    const verdict = report.verdict;
    const heading = locale === "nl" ? verdict.headingNl : verdict.headingEn;

    // Verdict heading: a left accent bar (tone) + dark heading text. Colour is
    // reinforced by the words below, so grayscale print stays readable.
    this.ensureHeight(40);
    const [ir, ig, ib] = inkForTone(verdict.tone);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 30,
      width: 6,
      height: 30,
      color: rgb(ir, ig, ib)
    });
    splitText(heading, this.bold, 15, CONTENT_WIDTH - 20)
      .slice(0, 2)
      .forEach((line, i) => {
        this.page.drawText(line, {
          x: MARGIN + 16,
          y: this.y - 16 - i * 18,
          font: this.bold,
          size: 15,
          color: rgb(0.06, 0.09, 0.16)
        });
      });
    this.y -= 40;

    // Signal lines: word in a light-tone filled rect (dark ink), then the
    // Dutch/English label + sub. Reuses the drawCardRow accent idea as a row.
    const rowH = 30;
    const wordW = 78;
    report.signals.forEach((sig) => {
      this.ensureHeight(rowH + 4);
      const top = this.y;
      this.page.drawRectangle({
        x: MARGIN,
        y: top - rowH,
        width: CONTENT_WIDTH,
        height: rowH,
        color: rgb(0.985, 0.99, 1),
        borderColor: rgb(0.86, 0.9, 0.96),
        borderWidth: 0.5
      });
      // status word chip (light fill, dark text, survives grayscale)
      const [ar, ag, ab] = accentForTone(sig.tone);
      this.page.drawRectangle({
        x: MARGIN + 6,
        y: top - rowH + 6,
        width: wordW,
        height: rowH - 12,
        color: rgb(ar, ag, ab)
      });
      const [wr, wg, wb] = inkForTone(sig.tone);
      this.page.drawText(toneToPdfWord(sig.tone), {
        x: MARGIN + 12,
        y: top - rowH / 2 - 3,
        font: this.bold,
        size: 9,
        color: rgb(wr, wg, wb)
      });
      const label = locale === "nl" ? sig.labelNl : sig.labelEn;
      const sub = locale === "nl" ? sig.subNl : sig.subEn;
      this.page.drawText(label, {
        x: MARGIN + wordW + 16,
        y: top - 13,
        font: this.bold,
        size: 9.5,
        color: rgb(0.12, 0.2, 0.3)
      });
      splitText(sub, this.regular, 8.5, CONTENT_WIDTH - wordW - 28)
        .slice(0, 1)
        .forEach((line) => {
          this.page.drawText(line, {
            x: MARGIN + wordW + 16,
            y: top - 24,
            font: this.regular,
            size: 8.5,
            color: rgb(0.36, 0.44, 0.55)
          });
        });
      this.y -= rowH + 4;
    });

    // Summary teaser line (honest counts, no em-dash or en-dash).
    const summary = report.summary;
    const teaser =
      locale === "nl"
        ? `Wij controleerden ${summary.checked} signalen. ${summary.needAttention} ${summary.needAttention === 1 ? "vraagt" : "vragen"} aandacht.` +
          (summary.priceAffecting > 0 ? ` ${summary.priceAffecting} raakt de eerlijke prijs.` : "")
        : `We checked ${summary.checked} signals. ${summary.needAttention} need attention.` +
          (summary.priceAffecting > 0 ? ` ${summary.priceAffecting} affects the fair price.` : "");
    this.ensureHeight(18);
    this.page.drawText(teaser, {
      x: MARGIN,
      y: this.y - 12,
      font: this.regular,
      size: 9,
      color: rgb(0.3, 0.38, 0.5)
    });
    this.y -= 20;

    // Alerts (only the real exceptions).
    if (report.alerts.length > 0) {
      this.section(locale === "nl" ? "Aandachtspunten" : "Exceptions");
      report.alerts.forEach((alert) => {
        const alertH = 22;
        this.ensureHeight(alertH + 2);
        const atop = this.y;
        const [aar, aag, aab] = accentForTone(alert.tone);
        this.page.drawRectangle({
          x: MARGIN,
          y: atop - alertH,
          width: CONTENT_WIDTH,
          height: alertH,
          color: rgb(aar, aag, aab),
          borderColor: rgb(0.86, 0.9, 0.96),
          borderWidth: 0.5
        });
        const [alr, alg, alb] = inkForTone(alert.tone);
        this.page.drawText(toneToPdfWord(alert.tone), {
          x: MARGIN + 8,
          y: atop - 15,
          font: this.bold,
          size: 8,
          color: rgb(alr, alg, alb)
        });
        this.page.drawText(locale === "nl" ? alert.labelNl : alert.labelEn, {
          x: MARGIN + 70,
          y: atop - 15,
          font: this.regular,
          size: 9,
          color: rgb(0.18, 0.26, 0.38)
        });
        this.y -= alertH + 3;
      });
      this.y -= 4;
    }
  }

  buildTocPage(locale: "nl" | "en"): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawHeader(page, this.bold, this.regular, this.args);
    let ty = PAGE_HEIGHT - HEADER_HEIGHT - 24;
    page.drawText(locale === "nl" ? "Inhoud" : "Contents", {
      x: MARGIN,
      y: ty,
      font: this.bold,
      size: 16,
      color: rgb(0.06, 0.2, 0.45)
    });
    ty -= 30;
    this.anchors.forEach((a) => {
      // pageIndex is into this.pages BEFORE the TOC is moved to the front, so
      // the printed page number is pageIndex + 2 (1-based, +1 for the TOC page
      // that becomes page 1).
      const printedPage = a.pageIndex + 2;
      page.drawText(a.title, {
        x: MARGIN,
        y: ty,
        font: this.regular,
        size: 11,
        color: rgb(0.14, 0.22, 0.34)
      });
      const numLabel = String(printedPage);
      const numW = this.regular.widthOfTextAtSize(numLabel, 11);
      page.drawText(numLabel, {
        x: PAGE_WIDTH - MARGIN - numW,
        y: ty,
        font: this.regular,
        size: 11,
        color: rgb(0.3, 0.4, 0.52)
      });
      ty -= 20;
    });
    return page;
  }
}

function drawHeroVisuals(args: {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  data: Record<string, unknown>;
  image?: PDFImage | null;
  map?: PDFImage | null;
  aiInsights?: AiInsights | null;
  aiValuation?: AiValuation | null;
  locale: "nl" | "en";
}) {
  const heroTop = PAGE_HEIGHT - HEADER_HEIGHT - 8;
  const heroHeight = 165;
  const leftW = CONTENT_WIDTH * 0.57;
  const rightW = CONTENT_WIDTH - leftW - 8;
  const leftX = MARGIN;
  const rightX = leftX + leftW + 8;
  const cardY = heroTop - heroHeight;

  args.page.drawRectangle({
    x: leftX,
    y: cardY,
    width: leftW,
    height: heroHeight,
    color: rgb(0.97, 0.985, 1),
    borderColor: rgb(0.85, 0.9, 0.96),
    borderWidth: 0.8
  });
  args.page.drawRectangle({
    x: rightX,
    y: cardY,
    width: rightW,
    height: heroHeight,
    color: rgb(0.97, 0.985, 1),
    borderColor: rgb(0.85, 0.9, 0.96),
    borderWidth: 0.8
  });

  const ai = args.aiInsights;
  const verdictLabel = ai?.purchaseVerdict ?? "-";
  const riskLabel = ai?.riskLevel ?? "-";
  const summary = ai?.summary ?? (args.locale === "nl" ? "Analyse niet beschikbaar." : "Analysis unavailable.");

  args.page.drawText(args.locale === "nl" ? "Aankoopadvies" : "Purchase advice", {
    x: leftX + 10,
    y: heroTop - 18,
    font: args.bold,
    size: 11,
    color: rgb(0.08, 0.2, 0.45)
  });
  const vTone = verdictTone(ai?.purchaseVerdict ?? "AVOID");
  const rTone = riskTone(ai?.riskLevel ?? "HIGH");
  args.page.drawRectangle({
    x: leftX + 10,
    y: heroTop - 44,
    width: 120,
    height: 18,
    color: rgb(...accentForTone(vTone))
  });
  args.page.drawText(`${args.locale === "nl" ? "Verdict" : "Verdict"}: ${verdictLabel}`, {
    x: leftX + 15,
    y: heroTop - 38,
    font: args.bold,
    size: 9,
    color: rgb(...inkForTone(vTone))
  });
  args.page.drawRectangle({
    x: leftX + 138,
    y: heroTop - 44,
    width: 95,
    height: 18,
    color: rgb(...accentForTone(rTone))
  });
  args.page.drawText(`${args.locale === "nl" ? "Risico" : "Risk"}: ${riskLabel}`, {
    x: leftX + 143,
    y: heroTop - 38,
    font: args.bold,
    size: 9,
    color: rgb(...inkForTone(rTone))
  });

  splitText(summary, args.regular, 9.5, leftW - 20)
    .slice(0, 5)
    .forEach((line, idx) => {
      args.page.drawText(line, {
        x: leftX + 10,
        y: heroTop - 63 - idx * 12,
        font: args.regular,
        size: 9.5,
        color: rgb(0.15, 0.25, 0.38)
      });
    });

  // Our own formula (enriched) is the single source of truth for market value;
  // the AI valuation is never used for the hero numbers.
  const vNow = toNumber(asRow(args.data.enriched).estimatedValueNow);
  const vMin = toNumber(asRow(args.data.enriched).estimatedValueMin);
  const vMax = toNumber(asRow(args.data.enriched).estimatedValueMax);
  args.page.drawText(args.locale === "nl" ? "Marktwaarde" : "Market value", {
    x: leftX + 10,
    y: cardY + 45,
    font: args.bold,
    size: 10,
    color: rgb(0.08, 0.2, 0.45)
  });

  if (vNow && vMin && vMax && vMax > vMin) {
    const barWidth = leftW - 20;
    const barY = cardY + 28;
    const rangeMin = vMin;
    const rangeMax = vMax;
    const diff = rangeMax - rangeMin;
    
    // Background track
    args.page.drawLine({
      start: { x: leftX + 10, y: barY },
      end: { x: leftX + 10 + barWidth, y: barY },
      thickness: 6,
      color: rgb(0.9, 0.92, 0.96),
    });

    // Expected Range
    const startX = leftX + 10 + ((vMin - rangeMin) / diff) * barWidth;
    const endX = leftX + 10 + ((vMax - rangeMin) / diff) * barWidth;
    args.page.drawLine({
      start: { x: startX, y: barY },
      end: { x: endX, y: barY },
      thickness: 6,
      color: rgb(0.2, 0.6, 1),
    });

    // Current Marker
    const px = leftX + 10 + Math.max(0, Math.min(barWidth, ((vNow - rangeMin) / diff) * barWidth));
    args.page.drawCircle({ x: px, y: barY, size: 5, color: rgb(0.05, 0.15, 0.3) });

    // Labels
    args.page.drawText(currency(vMin), { x: startX, y: barY - 14, font: args.regular, size: 8, color: rgb(0.4, 0.5, 0.6) });
    args.page.drawText(currency(vMax), { x: endX - 25, y: barY - 14, font: args.regular, size: 8, color: rgb(0.4, 0.5, 0.6) });
    args.page.drawText(currency(vNow), { x: px - 15, y: barY + 8, font: args.bold, size: 9, color: rgb(0.05, 0.15, 0.3) });
  } else {
    args.page.drawText(`${currency(vNow)}  (${currency(vMin)} - ${currency(vMax)})`, {
      x: leftX + 10,
      y: cardY + 28,
      font: args.regular,
      size: 9,
      color: rgb(0.14, 0.24, 0.36)
    });
  }

  if (args.image) {
    const imageW = rightW - 16;
    const imageH = 92;
    args.page.drawImage(args.image, {
      x: rightX + 8,
      y: heroTop - 104,
      width: imageW,
      height: imageH
    });
  } else {
    args.page.drawText(args.locale === "nl" ? "Voertuigbeeld niet beschikbaar" : "Vehicle image unavailable", {
      x: rightX + 14,
      y: heroTop - 60,
      font: args.regular,
      size: 9,
      color: rgb(0.42, 0.5, 0.6)
    });
  }

  args.page.drawText(args.locale === "nl" ? "Markt-/locatiekaart" : "Market/location map", {
    x: rightX + 8,
    y: cardY + 54,
    font: args.bold,
    size: 9,
    color: rgb(0.08, 0.2, 0.45)
  });
  if (args.map) {
    args.page.drawImage(args.map, {
      x: rightX + 8,
      y: cardY + 8,
      width: rightW - 16,
      height: 42
    });
  }
}

function buildReportSections(layout: PdfLayout, args: ReportArgs) {
  const { locale, data, aiInsights, aiValuation, comparables, modelStats, score } = args;
  const vehicle = asRow(data.vehicle);
  const enriched = asRow(data.enriched);
  const inspections = asRows(data.inspections);
  const defects = asRows(data.defects);
  const recalls = asRows(data.recalls);
  const raw = asRow(data.raw);
  const fuel = asRows(raw.fuel);
  const body = asRows(raw.body);
  const typeApprovals = asRows(raw.typeApprovals);
  const rawMain = asRows(raw.main);
  const rawApk = asRows(raw.apk);
  const rawDefects = asRows(raw.defects);
  const rawRecalls = asRows(raw.recalls);
  const defectDescriptions = asRow(data.defectDescriptions);

  const derivedDefects =
    defects.length > 0
      ? defects
      : inspections.map((it) => {
          const code = s(it.gebrek_identificatie);
          return {
            gebrek_identificatie: code,
            gebrek_omschrijving: s(defectDescriptions[code])
          };
        });

  // Shared helpers
  const yesNo = (value: unknown) =>
    value === true ? (locale === "nl" ? "Ja" : "Yes") : value === false ? (locale === "nl" ? "Nee" : "No") : "-";

  const marketNowRaw = toNumber(enriched.estimatedValueNow);
  const marketMinRaw = toNumber(enriched.estimatedValueMin);
  const marketMaxRaw = toNumber(enriched.estimatedValueMax);
  const marketNow = marketNowRaw ?? 0;
  const marketMin = marketMinRaw ?? 0;
  const marketMax = marketMaxRaw ?? 0;
  const riskScore = toNumber(enriched.maintenanceRiskScore) ?? 6;
  const mileagePlausible =
    enriched.userMileagePlausible === null || enriched.userMileagePlausible === undefined
      ? null
      : Boolean(enriched.userMileagePlausible);
  const pricing = computeNegotiationPricing({
    marketNow,
    marketMin,
    marketMax,
    riskScore,
    defects: defects.length,
    recalls: recalls.length,
    mileagePlausible
  });

  // ---- G1: Voertuig & specificaties (sectionIds: overzicht, score, specs-core) ----
  layout.groupBanner(1, "Voertuig & specificaties", "Vehicle & specifications", locale);

  layout.section(pdfSectionTitle("overzicht", locale));
  layout.keyValue(locale === "nl" ? "Merk / Model" : "Brand / Model", `${s(vehicle.brand)} ${s(vehicle.tradeName)}`.trim());
  const typeVariant = [vehicle.typeCode, vehicle.variant, vehicle.uitvoering].filter(Boolean).join(" ");
  if (typeVariant) {
    layout.keyValue(locale === "nl" ? "Type/variant (RDW)" : "Type/variant (RDW)", typeVariant);
  }
  layout.keyValue(locale === "nl" ? "Bouwjaar" : "Year", s(vehicle.year));
  layout.keyValue(locale === "nl" ? "Carrosserie / Kleur" : "Body / Color", `${s(vehicle.bodyType)} / ${s(asRow(vehicle.color).primary)}`);
  layout.keyValue(locale === "nl" ? "Brandstof" : "Fuel type", s(vehicle.fuelType));
  layout.keyValue(locale === "nl" ? "APK vervaldatum" : "MOT expiry", s(vehicle.apkExpiryDate));
  // Core tech specs (kW/HP, displacement, cylinders, transmission, doors/seats, dims, weights)
  const eng = asRow(vehicle.engine);
  const powerKw = toNumber(eng.powerKw);
  if (powerKw !== null) {
    const hp = Math.round(powerKw * 1.36);
    layout.keyValue(locale === "nl" ? "Vermogen" : "Power", `${powerKw} kW / ${hp} pk`);
  }
  const displacement = toNumber(eng.displacement);
  if (displacement !== null) {
    layout.keyValue(locale === "nl" ? "Cilinderinhoud / Cilinders" : "Displacement / Cylinders", `${displacement} cc / ${s(eng.cylinders)}`);
  }
  // Transmission
  const transmissionRaw = s(vehicle.transmission);
  if (transmissionRaw !== "-") {
    const txCode = String(vehicle.transmissionCode ?? "").toUpperCase();
    let txLabel: string;
    if (txCode === "M") txLabel = locale === "nl" ? "Handgeschakeld" : "Manual";
    else if (txCode === "A") txLabel = locale === "nl" ? "Automaat" : "Automatic";
    else if (txCode === "C") txLabel = locale === "nl" ? "CVT (automaat)" : "CVT (automatic)";
    else if (txCode) txLabel = locale === "nl" ? "Anders" : "Other";
    else txLabel = transmissionRaw;
    const gears = toNumber(vehicle.gears);
    if (gears !== null) {
      txLabel += locale === "nl" ? ` (${gears} versnellingen)` : ` (${gears} gears)`;
    }
    layout.keyValue(locale === "nl" ? "Transmissie" : "Transmission", txLabel);
  }
  const doorsVal = toNumber(vehicle.doors);
  const seatsVal = toNumber(vehicle.seats);
  if (doorsVal !== null || seatsVal !== null) {
    layout.keyValue(
      locale === "nl" ? "Deuren / Zitplaatsen" : "Doors / Seats",
      `${doorsVal !== null ? doorsVal : "-"} / ${seatsVal !== null ? seatsVal : "-"}`
    );
  }
  const dimsObj = asRow(vehicle.dimensions);
  const dL = toNumber(dimsObj.length);
  const dW = toNumber(dimsObj.width);
  const dH = toNumber(dimsObj.height);
  const dWb = toNumber(dimsObj.wheelbase);
  if (dL !== null && dW !== null && dH !== null) {
    layout.keyValue(
      locale === "nl" ? "Afmetingen (l x b x h)" : "Dimensions (l x w x h)",
      `${dL} x ${dW} x ${dH} mm${dWb !== null ? ` - ${locale === "nl" ? "wielbasis" : "wheelbase"} ${dWb} mm` : ""}`
    );
  }
  const wObj = asRow(vehicle.weight);
  const wEmpty = toNumber(wObj.empty);
  const wMax = toNumber(wObj.max);
  const wRtd = toNumber(wObj.readyToDrive);
  if (wEmpty !== null || wMax !== null) {
    const wParts: string[] = [];
    if (wEmpty !== null) wParts.push(`${wEmpty} kg ${locale === "nl" ? "leeg" : "empty"}`);
    if (wMax !== null) wParts.push(`${wMax} kg max`);
    if (wRtd !== null) wParts.push(`${wRtd} kg ${locale === "nl" ? "rijklaar" : "ready-to-drive"}`);
    layout.keyValue(locale === "nl" ? "Gewichten" : "Weights", wParts.join(", "));
  }

  // Kentekenrapport Score block
  if (score) {
    layout.section(locale === "nl" ? "Kentekenrapport Score" : "Vehicle Score");
    layout.keyValue(locale === "nl" ? "Score" : "Score", `${score.score}/100 - ${score.label}`);
    layout.keyValue(locale === "nl" ? "Omschrijving" : "Description", score.description);
    layout.keyValue(locale === "nl" ? "Betrouwbaarheid" : "Confidence", score.confidence);
    layout.keyValue(locale === "nl" ? "Risico-indicatie" : "Risk flag", score.riskFlag);
    if (score.breakdown.length > 0) {
      layout.section(locale === "nl" ? "Score opbouw" : "Score breakdown");
      score.breakdown.forEach((item) => {
        const pts = item.points > 0 ? `+${item.points}` : item.points === 0 ? "0" : String(item.points);
        layout.keyValue(item.label, pts);
      });
    }
  }

  // ---- G2: Oordeel (sectionId: ai-analyse) ----
  layout.groupBanner(2, "Oordeel & inzicht", "Verdict & insight", locale);

  if (aiInsights) {
    layout.section(pdfSectionTitle("ai-analyse", locale));
    layout.keyValue(locale === "nl" ? "Samenvatting" : "Summary", aiInsights.summary);
    if (aiInsights.positives.length > 0) {
      layout.keyValue(locale === "nl" ? "Sterke punten" : "Positives", aiInsights.positives.join(" | "));
    }
    if (aiInsights.risks.length > 0) {
      layout.keyValue(locale === "nl" ? "Aandachtspunten" : "Points of attention", aiInsights.risks.join(" | "));
    }
    if (aiInsights.recommendation) {
      layout.keyValue(locale === "nl" ? "Aanbeveling" : "Recommendation", aiInsights.recommendation);
    }
  }

  // TrustBadges text strip derived from vehicle signals
  {
    const trustItems: string[] = [];
    if (vehicle.wok === true) trustItems.push(`[SLECHT] WOK-${locale === "nl" ? "geregistreerd" : "registration"}`);
    if (vehicle.hasOpenRecall === true) trustItems.push(`[LET OP] ${locale === "nl" ? "Open terugroepactie" : "Open recall"}`);
    if (enriched.isImported === true) trustItems.push(`[LET OP] ${locale === "nl" ? "Importvoertuig" : "Imported vehicle"}`);
    const napStr = String(vehicle.napVerdict ?? "").toLowerCase();
    if (napStr.includes("onlogisch")) trustItems.push(`[LET OP] NAP ${locale === "nl" ? "onlogisch" : "implausible"}`);
    else if (napStr.includes("logisch")) trustItems.push(`[GOED] NAP ${locale === "nl" ? "logisch" : "consistent"}`);
    if (defects.length === 0 && inspections.length > 0) trustItems.push(`[GOED] ${locale === "nl" ? "Geen defecten in APK-data" : "No defects in MOT data"}`);
    if (vehicle.insured === true) trustItems.push(`[GOED] ${locale === "nl" ? "Verzekerd" : "Insured"}`);
    if (trustItems.length > 0) {
      layout.keyValue(locale === "nl" ? "Signalen" : "Signals", trustItems.join("  "));
    }
  }

  // ---- G3: Marktwaarde (sectionId: markt) ----
  layout.groupBanner(3, "Marktwaarde", "Market value", locale);

  layout.section(pdfSectionTitle("markt", locale));
  if (marketNowRaw !== null) {
    layout.keyValue(locale === "nl" ? "Marktwaarde nu" : "Market value now", currency(marketNowRaw));
  }
  if (marketMinRaw !== null && marketMaxRaw !== null) {
    layout.keyValue(locale === "nl" ? "Marktbandbreedte" : "Market range", `${currency(marketMinRaw)} - ${currency(marketMaxRaw)}`);
  }
  const valueNextYear = toNumber(enriched.estimatedValueNextYear);
  if (valueNextYear !== null) {
    layout.keyValue(locale === "nl" ? "Verwachte waarde volgend jaar" : "Est. value next year", currency(valueNextYear));
  }
  if (enriched.marketValueConfidence) {
    layout.keyValue(locale === "nl" ? "Betrouwbaarheid schatting" : "Estimate confidence", s(enriched.marketValueConfidence));
  }
  // Mileage signal and est mileage
  if (enriched.mileageVerdict) {
    layout.keyValue(locale === "nl" ? "Kilometersignaal" : "Mileage signal", s(enriched.mileageVerdict));
  }
  if (enriched.estimatedMileageNow !== undefined && enriched.estimatedMileageNow !== null) {
    layout.keyValue(locale === "nl" ? "Geschatte kilometerstand" : "Estimated mileage", kmLabel(enriched.estimatedMileageNow));
  }
  const apkPassChanceVal = toNumber(enriched.apkPassChance);
  if (apkPassChanceVal !== null) {
    layout.keyValue(locale === "nl" ? "APK-slaagkans" : "MOT pass chance", `${apkPassChanceVal}%`);
  }
  const maintenanceRisk = toNumber(enriched.maintenanceRiskScore);
  if (maintenanceRisk !== null) {
    layout.keyValue(locale === "nl" ? "Onderhoudsrisico" : "Maintenance risk", `${maintenanceRisk}/10`);
  }
  layout.keyValue(locale === "nl" ? "Wegenbelasting (kwartaal)" : "Road tax (quarter)", `${currency(asRow(enriched.roadTaxEstQuarter).min)} - ${currency(asRow(enriched.roadTaxEstQuarter).max)}`);
  layout.keyValue(locale === "nl" ? "Verzekering / brandstof (maand)" : "Insurance / fuel (month)", `${currency(enriched.insuranceEstMonth)} / ${currency(enriched.fuelEstMonth)}`);
  if (aiValuation) {
    if (aiValuation.factors.length > 0) {
      layout.keyValue(locale === "nl" ? "Waardefactoren" : "Value factors", aiValuation.factors.join(" | "));
    }
    if (aiValuation.explanation) {
      layout.keyValue(locale === "nl" ? "Toelichting" : "Explanation", aiValuation.explanation);
    }
  }

  // ---- G4: Vergelijkbaar aanbod (sectionId: te-koop) ----
  layout.groupBanner(4, "Vergelijkbaar aanbod", "Comparable listings", locale);

  layout.section(pdfSectionTitle("te-koop", locale));
  if (comparables && comparables.length > 0) {
    layout.table(
      [
        locale === "nl" ? "Jaar" : "Year",
        locale === "nl" ? "Km" : "Km",
        locale === "nl" ? "Brandstof" : "Fuel",
        locale === "nl" ? "Prijs" : "Price",
        locale === "nl" ? "Bron" : "Source"
      ],
      comparables.slice(0, 6).map((car) => [
        car.year !== null ? String(car.year) : "-",
        car.mileageKm !== null ? `${Math.round(car.mileageKm / 1000)}k km` : "-",
        car.fuelType ?? "-",
        car.priceEur !== null ? currency(car.priceEur) : "-",
        car.source ?? "-"
      ])
    );
    layout.keyValue(
      locale === "nl" ? "Bronvermelding" : "Source disclosure",
      locale === "nl"
        ? "Gegevens afkomstig van marktplaats-advertenties. Prijzen zijn indicatief en kunnen zijn gewijzigd."
        : "Data sourced from marketplace listings. Prices are indicative and may have changed."
    );
  } else {
    layout.keyValue(
      locale === "nl" ? "Vergelijkbare advertenties" : "Comparable listings",
      locale === "nl"
        ? "Geen vergelijkbare advertenties beschikbaar op dit moment. Zoek zelf via de links hieronder."
        : "No comparable listings available at this time. Search manually via the links below."
    );
    const brand = String(vehicle.brand ?? "").trim();
    const model = String(vehicle.tradeName ?? "").trim();
    const valueNowForLink = marketNowRaw ?? 0;
    const priceLow = Math.round(valueNowForLink * 0.8);
    const priceHigh = Math.round(valueNowForLink * 1.2);
    if (brand && model && priceHigh > 0) {
      const q = encodeURIComponent(`${brand} ${model}`);
      layout.keyValue(
        "AutoScout24",
        `https://www.autoscout24.nl/lst?q=${q}&pricefrom=${priceLow}&priceto=${priceHigh}`
      );
      layout.keyValue(
        "Marktplaats",
        `https://www.marktplaats.nl/l/auto-s/?q=${q}`
      );
      layout.keyValue(
        "Gaspedaal.nl",
        `https://www.gaspedaal.nl/?q=${q}&pf=${priceLow}&pt=${priceHigh}`
      );
    }
  }

  // ---- G5: Schatting & risico (sectionId: schatting) ----
  layout.groupBanner(5, "Schatting & risico", "Estimate & risk", locale);

  layout.section(pdfSectionTitle("schatting", locale));
  if (marketNowRaw !== null && marketNowRaw > 0 && marketMinRaw !== null && marketMaxRaw !== null) {
    layout.drawCardRow([
      {
        title: locale === "nl" ? "Aanbevolen biedrange" : "Recommended offer range",
        value: `${currency(pricing.offerMin)} - ${currency(pricing.offerMax)}`,
        accent: rgb(...accentForTone("ok") as [number, number, number])
      },
      {
        title: locale === "nl" ? "Walk-away grens" : "Walk-away threshold",
        value: currency(pricing.walkAway),
        accent: rgb(...accentForTone("danger") as [number, number, number])
      },
      {
        title: locale === "nl" ? "Reparatiereserve" : "Repair reserve",
        value: `${currency(pricing.reserveMin)} - ${currency(pricing.reserveMax)}`,
        accent: rgb(...accentForTone("warn") as [number, number, number])
      }
    ]);
    layout.keyValue(
      locale === "nl" ? "Referentiewaarde" : "Reference value",
      `${currency(marketNow)} (${currency(marketMin)} - ${currency(marketMax)})`
    );
    // Talking points (ported from NegotiationCopilotScreen)
    const talkingPoints: string[] = [];
    if (defects.length > 0) {
      talkingPoints.push(
        locale === "nl"
          ? `${defects.length} defectrecord(s) in APK-historie: vraag om facturen en gebruik dit voor prijsdruk.`
          : `${defects.length} defect record(s) in inspection history: ask for invoices and use for price pressure.`
      );
    } else {
      talkingPoints.push(
        locale === "nl"
          ? "Geen defecthistorie zichtbaar: benadruk als positief punt maar vraag alsnog om onderhoudsbewijs."
          : "No defect history visible: use as a positive point but still request maintenance proof."
      );
    }
    talkingPoints.push(
      riskScore >= 7
        ? locale === "nl"
          ? `Onderhoudsrisico ${riskScore.toFixed(1)}/10: onderhandel extra reserve in de deal.`
          : `Maintenance risk ${riskScore.toFixed(1)}/10: negotiate extra reserve into the deal.`
        : locale === "nl"
        ? `Onderhoudsrisico ${riskScore.toFixed(1)}/10: focus op snelle deal tegen onderkant biedrange.`
        : `Maintenance risk ${riskScore.toFixed(1)}/10: push for quick close near lower offer range.`
    );
    talkingPoints.push(
      recalls.length > 0
        ? locale === "nl"
          ? `${recalls.length} recall(s) gevonden: laat deze eerst oplossen of vraag directe prijsverlaging.`
          : `${recalls.length} recall(s) found: require completion first or request direct price reduction.`
        : locale === "nl"
        ? "Geen open recalls zichtbaar: sterk punt in je onderhandeling."
        : "No open recalls visible: strong negotiation point."
    );
    if (mileagePlausible === false) {
      talkingPoints.push(
        locale === "nl"
          ? "Opgegeven kilometerstand wijkt af van trend: eis onafhankelijke controle."
          : "Entered mileage deviates from trend: require independent verification."
      );
    }
    layout.section(locale === "nl" ? "Praatpunten" : "Talking points");
    talkingPoints.forEach((pt, idx) => {
      layout.keyValue(`${idx + 1}.`, pt);
    });
    layout.keyValue(
      locale === "nl" ? "Strategie" : "Strategy",
      locale === "nl"
        ? "Start bij de onderkant van de biedrange. Boven de walk-away grens neemt uw nadeel toe. Houd de reparatiereserve apart."
        : "Start near the lower offer bound. Above walk-away your downside increases. Keep the repair reserve separate."
    );
  } else {
    layout.keyValue(
      locale === "nl" ? "Status" : "Status",
      locale === "nl"
        ? "Onvoldoende marktdata om een biedstrategie te berekenen."
        : "Insufficient market data to compute an offer strategy."
    );
  }

  // ---- G6: Risicos & schade (sectionId: schade) ----
  layout.groupBanner(6, "Risicos & schade", "Risks & damage", locale);

  layout.section(pdfSectionTitle("schade", locale));
  layout.keyValue(locale === "nl" ? "WOK-status (Wachten Op Keuren)" : "WOK status (awaiting inspection)", yesNo(vehicle.wok));
  layout.keyValue(
    locale === "nl" ? "Geconstateerde gebreken" : "Recorded defects",
    `${derivedDefects.length} ${locale === "nl" ? "record(s) in APK-historie" : "record(s) in inspection history"}`
  );
  layout.keyValue(
    locale === "nl" ? "Open terugroepactie" : "Open recall",
    `${yesNo(vehicle.hasOpenRecall)} (${recalls.length} ${locale === "nl" ? "geregistreerd" : "recorded"})`
  );
  if (recalls.length > 0) {
    layout.table(
      [locale === "nl" ? "Campagne" : "Campaign", locale === "nl" ? "Defect" : "Defect", locale === "nl" ? "Status" : "Status"],
      recalls.map((it) => [s(it.campagnenummer), s(it.omschrijving_defect), s(it.status)])
    );
  }
  // Per-inspection defect event list (date, code, description, count, recognition)
  const inspWithDefects = inspections.filter(
    (it) => it.gebrek_identificatie && s(it.gebrek_identificatie) !== "-"
  );
  if (inspWithDefects.length > 0) {
    layout.section(locale === "nl" ? "Gebreken per keuring" : "Defects per inspection");
    layout.table(
      [locale === "nl" ? "Datum" : "Date", locale === "nl" ? "Code" : "Code", locale === "nl" ? "Omschrijving" : "Description", locale === "nl" ? "Aantal" : "Count"],
      inspWithDefects.map((it) => {
        const code = s(it.gebrek_identificatie);
        const desc = s(it.gebrek_omschrijving ?? defectDescriptions[code]);
        return [
          s(it.meld_datum_door_keuringsinstantie_dt ?? it.meld_datum_door_keuringsinstantie).slice(0, 10),
          code,
          desc,
          s(it.aantal_gebreken_geconstateerd)
        ];
      })
    );
  }
  if (derivedDefects.length > 0) {
    layout.section(locale === "nl" ? "Gebreken detail" : "Defect detail");
    layout.table(
      [locale === "nl" ? "Code" : "Code", locale === "nl" ? "Omschrijving" : "Description", locale === "nl" ? "Bron" : "Source", locale === "nl" ? "Opmerking" : "Notes"],
      derivedDefects.map((it) => {
        const row = it as Row;
        const code = s(row.gebrek_identificatie);
        return [
          code,
          s(row.gebrek_omschrijving ?? defectDescriptions[code]),
          defects.length > 0 ? "defects" : "inspection",
          s(row.toelichting)
        ];
      })
    );
  }
  layout.keyValue(
    locale === "nl" ? "Belangrijk" : "Important",
    locale === "nl"
      ? "Verzekeringsschade is in Nederland niet openbaar. Dit rapport toont alleen schadesignalen uit officiele RDW-data, geen claimhistorie van verzekeraars."
      : "Insurance damage records are not public in the Netherlands. This report shows only damage signals from official RDW data, not insurer claim history."
  );

  // ---- G7: Kilometerstand & NAP (sectionId: kilometerstand) ----
  layout.groupBanner(7, "Kilometerstand & NAP", "Mileage & NAP", locale);

  layout.section(pdfSectionTitle("kilometerstand", locale));
  layout.keyValue(locale === "nl" ? "NAP-tellerstandoordeel (RDW)" : "NAP odometer verdict (RDW)", s(vehicle.napVerdict));
  layout.keyValue(locale === "nl" ? "Geschatte kilometerstand nu" : "Estimated mileage now", kmLabel(enriched.estimatedMileageNow));
  // Add est mileage min/max range
  const estMileageMin = toNumber(enriched.estimatedMileageMin);
  const estMileageMax = toNumber(enriched.estimatedMileageMax);
  if (estMileageMin !== null && estMileageMax !== null) {
    layout.keyValue(
      locale === "nl" ? "Kilometerstandbereik (schatting)" : "Estimated mileage range",
      `${kmLabel(estMileageMin)} - ${kmLabel(estMileageMax)}`
    );
  }
  if (toNumber(enriched.mileageSlopeKmPerYear) !== null) {
    layout.keyValue(locale === "nl" ? "Gemiddeld per jaar" : "Average per year", kmLabel(enriched.mileageSlopeKmPerYear));
  }
  if (enriched.mileageUsageProfile) {
    layout.keyValue(locale === "nl" ? "Gebruiksprofiel" : "Usage profile", s(enriched.mileageUsageProfile));
  }
  // Mileage anomalies
  const mileageAnomalies = asRows(enriched.mileageAnomalies);
  if (mileageAnomalies.length > 0) {
    layout.section(locale === "nl" ? "Kilometeranomalies" : "Mileage anomalies");
    mileageAnomalies.forEach((anomaly) => {
      const row = anomaly as Row;
      layout.keyValue(
        `[LET OP] ${s(row.date ?? row.jaar ?? row.year)}`,
        s(row.description ?? row.omschrijving ?? row.label)
      );
    });
  }
  layout.keyValue(
    locale === "nl" ? "Let op" : "Note",
    locale === "nl"
      ? "De RDW mag geen volledige tellerstanden verstrekken. Het officiele NAP-oordeel hierboven is leidend; de kilometerstand is een schatting op basis van leeftijd en gebruik."
      : "The RDW may not share full odometer readings. The official NAP verdict above is leading; the mileage figure is an estimate based on age and usage."
  );

  // ---- G8: APK-historie + statistiek (sectionIds: apk, apk-intelligence) ----
  layout.groupBanner(8, "APK-historie + statistiek", "MOT history + statistics", locale);

  layout.section(pdfSectionTitle("apk", locale));
  if (inspections.length > 0) {
    layout.table(
      [locale === "nl" ? "Datum" : "Date", locale === "nl" ? "Code" : "Code", locale === "nl" ? "Type" : "Type", locale === "nl" ? "Aantal" : "Count"],
      inspections.map((it) => [
        s(it.meld_datum_door_keuringsinstantie_dt ?? it.meld_datum_door_keuringsinstantie).slice(0, 10),
        s(it.gebrek_identificatie),
        s(it.soort_erkenning_omschrijving),
        s(it.aantal_gebreken_geconstateerd)
      ])
    );
  }

  // Derived pass-rate and recurring defects
  if (inspections.length > 0) {
    const totalInspections = new Set(
      inspections.map((it) => s(it.meld_datum_door_keuringsinstantie_dt ?? it.meld_datum_door_keuringsinstantie).slice(0, 10))
    ).size;
    const withDefects = inspections.filter((it) => {
      const n = Number(it.aantal_gebreken_geconstateerd);
      return Number.isFinite(n) && n > 0;
    }).length;
    const passRate = totalInspections > 0 ? Math.round(((totalInspections - withDefects) / totalInspections) * 100) : null;
    if (passRate !== null) {
      layout.keyValue(locale === "nl" ? "Slaagpercentage keuringen" : "Inspection pass rate", `${passRate}%`);
    }
    // Recurring defects (codes appearing > once)
    const codeCounts = new Map<string, number>();
    inspections.forEach((it) => {
      const code = s(it.gebrek_identificatie);
      if (code && code !== "-") codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    });
    const recurring = Array.from(codeCounts.entries()).filter(([, count]) => count > 1);
    if (recurring.length > 0) {
      layout.keyValue(
        locale === "nl" ? "Terugkerende gebreken" : "Recurring defects",
        recurring.map(([code, count]) => `${code} (${count}x)`).join(", ")
      );
    }
  }

  if (apkPassChanceVal !== null) {
    layout.section(pdfSectionTitle("apk-intelligence", locale));
    layout.keyValue(locale === "nl" ? "Geschatte APK-slaagkans" : "Estimated MOT pass chance", `${apkPassChanceVal}%`);
    layout.keyValue(locale === "nl" ? "Onderhoudsrisico" : "Maintenance risk", `${s(enriched.maintenanceRiskScore)}/10`);
  }

  // Model cohort statistics table: only rendered when sampleSize > 0 to avoid
  // division-by-zero producing "NaN%" or "Infinity%" in the defect-rate row.
  if (modelStats && modelStats.sampleSize > 0 && modelStats.topDefects && modelStats.topDefects.length > 0) {
    layout.section(locale === "nl" ? "Modelstatistieken cohort" : "Model cohort statistics");
    layout.keyValue(
      locale === "nl" ? "Steekproef" : "Sample",
      `${modelStats.sampleSize} ${locale === "nl" ? "voertuigen" : "vehicles"} (${modelStats.brand} ${modelStats.tradeName} ${modelStats.year})`
    );
    layout.keyValue(
      locale === "nl" ? "Voertuigen met gebreken" : "Vehicles with defects",
      `${modelStats.vehiclesWithDefects} / ${modelStats.sampleSize} (${Math.round((modelStats.vehiclesWithDefects / modelStats.sampleSize) * 100)}%)`
    );
    layout.table(
      [
        locale === "nl" ? "Omschrijving" : "Description",
        locale === "nl" ? "% voertuigen" : "% vehicles",
        locale === "nl" ? "Aantal" : "Count"
      ],
      modelStats.topDefects.map((d) => [
        d.description,
        modelStats.sampleSize > 0 ? `${d.pctOfVehicles}%` : "-",
        String(d.count)
      ])
    );
  }

  // ---- G9: Eigendom & voertuiggegevens (sectionIds: eigendom, specs) ----
  layout.groupBanner(9, "Eigendom & voertuiggegevens", "Ownership & vehicle data", locale);

  layout.section(pdfSectionTitle("eigendom", locale));
  // Full 10-row registration grid
  const registrationRows: Array<{ label: string; value: string }> = [
    { label: locale === "nl" ? "WOK-status" : "WOK status", value: yesNo(vehicle.wok) },
    { label: locale === "nl" ? "Export indicator" : "Export indicator", value: yesNo(vehicle.exportIndicator) },
    { label: locale === "nl" ? "Overdracht mogelijk" : "Transfer possible", value: yesNo(vehicle.transferPossible) },
    { label: locale === "nl" ? "Verzekerd" : "Insured", value: yesNo(vehicle.insured) },
    { label: locale === "nl" ? "Taxi" : "Taxi", value: yesNo(vehicle.isTaxi) },
    { label: locale === "nl" ? "Open terugroep" : "Open recall", value: yesNo(vehicle.hasOpenRecall) },
    { label: locale === "nl" ? "Eerste registratie NL" : "First registration NL", value: s(vehicle.firstRegistrationNL) },
    { label: locale === "nl" ? "Eerste registratie wereld" : "First registration world", value: s(vehicle.firstRegistrationWorld) },
    { label: locale === "nl" ? "Importvoertuig" : "Imported vehicle", value: yesNo(enriched.isImported) },
    { label: locale === "nl" ? "Energielabel" : "Energy label", value: s(vehicle.energyLabel) }
  ].filter((row) => row.value && row.value !== "-");
  registrationRows.forEach((row) => layout.keyValue(row.label, row.value));
  if (vehicle.owners && (vehicle.owners as Row).count !== null && (vehicle.owners as Row).count !== undefined) {
    const ownersCount = toNumber((vehicle.owners as Row).count);
    if (ownersCount !== null) {
      layout.keyValue(
        locale === "nl" ? "Eigenaren (indicatief)" : "Owners (indicative)",
        locale === "nl"
          ? `${ownersCount} eerdere houder(s) bekend in RDW-data`
          : `${ownersCount} previous holder(s) known in RDW data`
      );
    }
  }
  // Import/transfer event notes
  if (enriched.isImported === true) {
    layout.keyValue(
      `[LET OP] ${locale === "nl" ? "Import" : "Import"}`,
      locale === "nl"
        ? "Dit voertuig is als import geregistreerd. Controleer de onderhoudsdocumentatie en RDW-toelatingsdatum."
        : "This vehicle is registered as imported. Verify maintenance documentation and RDW admission date."
    );
  }
  if (vehicle.exportIndicator === true) {
    layout.keyValue(
      `[LET OP] ${locale === "nl" ? "Exportindicator" : "Export indicator"}`,
      locale === "nl"
        ? "Exportindicator staat aan: het voertuig is mogelijk bestemd voor export of is eerder geexporteerd geweest."
        : "Export indicator is set: the vehicle may be designated for export or previously exported."
    );
  }

  // Full technical spec table
  layout.section(pdfSectionTitle("specs", locale));
  const factoryName = s(vehicle.factoryModelName);
  if (factoryName !== "-") layout.keyValue(locale === "nl" ? "Fabrieksbenaming" : "Factory model name", factoryName);
  const energyLabel = s(vehicle.energyLabel);
  if (energyLabel !== "-") layout.keyValue(locale === "nl" ? "Energielabel" : "Energy label", energyLabel);
  const payloadVal = toNumber((vehicle.weight as Row | undefined)?.payload);
  if (payloadVal !== null) layout.keyValue(locale === "nl" ? "Laadvermogen" : "Payload", `${payloadVal} kg`);
  const axles = toNumber(vehicle.axles);
  const wheels = toNumber(vehicle.wheels);
  if (axles !== null) layout.keyValue(locale === "nl" ? "Assen" : "Axles", String(axles));
  if (wheels !== null) layout.keyValue(locale === "nl" ? "Wielen" : "Wheels", String(wheels));
  const cataloguePriceVal = toNumber(vehicle.cataloguePrice);
  if (cataloguePriceVal !== null) layout.keyValue(locale === "nl" ? "Nieuwprijs (catalogus)" : "New price (catalogue)", currency(cataloguePriceVal));
  const emissionStd = s(vehicle.emissionStandard);
  if (emissionStd !== "-") layout.keyValue(locale === "nl" ? "Emissienorm" : "Emission standard", emissionStd);
  const co2Val = toNumber(vehicle.co2);
  if (co2Val !== null) layout.keyValue("CO2", `${co2Val} g/km`);

  layout.section(pdfSectionTitle("specs", locale) + (locale === "nl" ? " (brandstof)" : " (fuel)"));
  if (fuel.length > 0) {
    layout.table(
      [locale === "nl" ? "Brandstof" : "Fuel", "CO2", locale === "nl" ? "Verbruik combi" : "Combined usage", locale === "nl" ? "Emissie" : "Emission"],
      fuel.map((it) => [s(it.brandstof_omschrijving), s(it.co2_uitstoot_gecombineerd), s(it.brandstofverbruik_gecombineerd), s(it.uitlaatemissieniveau)])
    );
  }
  const bodyTypeApprovalRows = [
    ...body.map((it) => [s(it.carrosserietype), s(it.type_carrosserie_europese_omschrijving), "-"]),
    ...typeApprovals.map((it) => ["-", "-", s(it.typegoedkeuringsnummer ?? it.eu_typegoedkeuring ?? it.typegoedkeuringsnummer_voertuig)])
  ];
  if (bodyTypeApprovalRows.length > 0) {
    layout.table(
      [locale === "nl" ? "Carrosserie" : "Body", locale === "nl" ? "Europese omschrijving" : "EU description", locale === "nl" ? "Typegoedkeuring" : "Type approval"],
      bodyTypeApprovalRows
    );
  }

  // ---- RDW sources footer ----
  layout.section(locale === "nl" ? "Gebruikte RDW-bronnen" : "RDW sources used");
  const recordsLabel = locale === "nl" ? "records" : "records";
  layout.keyValue(locale === "nl" ? "Voertuigregister" : "Vehicle register", `${rawMain.length} ${recordsLabel}`);
  layout.keyValue(locale === "nl" ? "Brandstofgegevens" : "Fuel data", `${fuel.length} ${recordsLabel}`);
  layout.keyValue(locale === "nl" ? "APK-keuringen" : "APK inspections", `${rawApk.length} ${recordsLabel}`);
  layout.keyValue(locale === "nl" ? "Gebrekrecords" : "Defect records", `${rawDefects.length} ${recordsLabel}`);
  layout.keyValue(locale === "nl" ? "Terugroepacties" : "Recalls", `${rawRecalls.length} ${recordsLabel}`);
  layout.keyValue(locale === "nl" ? "Carrosserie" : "Body", `${body.length} ${recordsLabel}`);
  layout.keyValue(locale === "nl" ? "Typegoedkeuringen" : "Type approvals", `${typeApprovals.length} ${recordsLabel}`);

  layout.disclaimer(
    "Disclaimer",
    locale === "nl"
      ? [
          "De getoonde marktwaarde is een indicatieve schatting en geen aankoopadvies.",
          "Dit rapport is een automatische analyse op basis van officiele RDW-data en kan onvolledig of verouderd zijn.",
          "Dit rapport is digitale content. Na levering vervalt het herroepingsrecht.",
          "Bronvermelding: RDW open data."
        ]
      : [
          "The market value shown is an indicative estimate and not purchase advice.",
          "This report is an automated analysis based on official RDW data and may be incomplete or outdated.",
          "This report is digital content. The right of withdrawal lapses after delivery.",
          "Source attribution: RDW open data."
        ]
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
  const fallbackImageUrl =
    "https://storage.googleapis.com/banani-generated-images/generated-images/e0649eef-2848-49b1-a352-34ec7d23ba0c.jpg";
  const mapUrl = "https://staticmap.openstreetmap.de/staticmap.php?center=52.1326,5.2913&zoom=7&size=640x260&markers=52.1326,5.2913,red-pushpin";
  const [primaryVehicleImage, mapImage] = await Promise.all([embedImageIfAvailable(doc, imageUrl), embedImageIfAvailable(doc, mapUrl)]);
  const vehicleImage = primaryVehicleImage ?? (await embedImageIfAvailable(doc, fallbackImageUrl));
  drawHeroVisuals({
    page: layout.page,
    regular,
    bold,
    data: args.data,
    image: vehicleImage,
    map: mapImage,
    aiInsights: args.aiInsights,
    aiValuation: args.aiValuation,
    locale: args.locale
  });
  // The hero occupies a fixed band under the header; continue the flow just
  // below it (replaces the old hardcoded layout.y -= 172).
  const HERO_HEIGHT = 165;
  layout.y = PAGE_HEIGHT - HEADER_HEIGHT - 8 - HERO_HEIGHT - 16;
  // Page 1 judgment block (mirrors the web JudgmentBlock) when signals exist.
  if (args.signals) {
    layout.drawJudgmentBlock(args.signals, args.locale);
  }
  buildReportSections(layout, args);
  // Real two-pass: anchors were recorded during the render above; build the TOC
  // page now and move it to the front so its page numbers line up.
  const tocPage = layout.buildTocPage(args.locale);
  const tocIndex = doc.getPageCount() - 1; // the TOC page is the last one added
  doc.removePage(tocIndex);
  doc.insertPage(0, tocPage);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}
