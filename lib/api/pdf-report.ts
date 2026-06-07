import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont, type PDFImage } from "pdf-lib";
import { formatDisplayPlate } from "@/lib/rdw/normalize";
import { getVehicleImageUrl } from "@/lib/utils/imagin";
import { sanitizeWinAnsi } from "./pdf-text";
import type { ClaudeInsightResult, ClaudeValuationResult } from "@/lib/api/claude";

// Single source of truth for the AI shapes (shared with the HTML report).
type AiInsights = ClaudeInsightResult;
type AiValuation = ClaudeValuationResult;

type ReportArgs = {
  plate: string;
  locale: "nl" | "en";
  generatedAt: Date;
  data: Record<string, unknown>;
  aiInsights?: AiInsights | null;
  aiValuation?: AiValuation | null;
  aiSource?: "ai" | "fallback";
};

type Row = Record<string, unknown>;

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 88;
const FOOTER_HEIGHT = 30;

// Palette
const NAVY = rgb(0.06, 0.16, 0.36);
const NAVY_SOFT = rgb(0.93, 0.95, 0.99);
const INK = rgb(0.11, 0.15, 0.22);
const SUBINK = rgb(0.28, 0.34, 0.43);
const MUTED = rgb(0.46, 0.52, 0.6);
const LINE = rgb(0.85, 0.88, 0.93);
const ROW_ALT = rgb(0.975, 0.982, 0.992);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.09, 0.5, 0.3);
const AMBER = rgb(0.7, 0.45, 0.07);
const RED = rgb(0.72, 0.12, 0.18);
const PLATE_YELLOW = rgb(0.99, 0.81, 0.12);
const PLATE_BLUE = rgb(0.05, 0.21, 0.66);

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" ? (value as Row) : {};
}

function s(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return sanitizeWinAnsi(String(value));
}

function currency(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `EUR ${Math.round(num).toLocaleString("nl-NL")}`;
}

function km(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${Math.round(num).toLocaleString("nl-NL")} km`;
}

function formatDateLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return "-";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(6, 8)}-${digits.slice(4, 6)}-${digits.slice(0, 4)}`;
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("nl-NL");
  return sanitizeWinAnsi(raw);
}

function verdictColor(verdict: AiInsights["purchaseVerdict"]) {
  if (verdict === "BUY") return GREEN;
  if (verdict === "CONSIDER") return rgb(0.07, 0.44, 0.63);
  if (verdict === "CAUTION") return AMBER;
  return RED;
}

function verdictLabel(verdict: AiInsights["purchaseVerdict"] | undefined, locale: "nl" | "en") {
  const map: Record<string, { nl: string; en: string }> = {
    BUY: { nl: "Kopen", en: "Buy" },
    CONSIDER: { nl: "Overwegen", en: "Consider" },
    CAUTION: { nl: "Voorzichtig", en: "Caution" },
    AVOID: { nl: "Vermijden", en: "Avoid" }
  };
  if (!verdict || !map[verdict]) return "-";
  return map[verdict][locale];
}

function splitText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const safe = sanitizeWinAnsi(text);
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

/** Yellow Dutch plate badge with a blue NL strip, drawn at the given top-left-ish anchor. */
function drawPlateBadge(page: PDFPage, bold: PDFFont, plate: string, rightX: number, topY: number) {
  const text = formatDisplayPlate(plate);
  const size = 15;
  const padX = 10;
  const stripW = 16;
  const textW = bold.widthOfTextAtSize(text, size);
  const w = stripW + padX + textW + padX;
  const h = 26;
  const x = rightX - w;
  const y = topY - h;
  page.drawRectangle({ x, y, width: w, height: h, color: PLATE_YELLOW, borderColor: rgb(0.1, 0.12, 0.16), borderWidth: 1 });
  page.drawRectangle({ x, y, width: stripW, height: h, color: PLATE_BLUE });
  page.drawText("NL", { x: x + 2.5, y: y + h / 2 - 3, font: bold, size: 7, color: WHITE });
  page.drawText(text, { x: x + stripW + padX, y: y + h / 2 - size / 2 + 2, font: bold, size, color: rgb(0.08, 0.09, 0.12) });
}

function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, args: ReportArgs) {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT, width: PAGE_WIDTH, height: HEADER_HEIGHT, color: NAVY });
  // thin accent strip at the very bottom of the header band
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT, width: PAGE_WIDTH, height: 3, color: PLATE_YELLOW });

  page.drawText("Kentekenrapport", { x: MARGIN, y: PAGE_HEIGHT - 40, font: bold, size: 22, color: WHITE });
  page.drawText(
    args.locale === "nl"
      ? "Voertuigrapport op basis van officiële RDW-data"
      : "Vehicle report based on official RDW data",
    { x: MARGIN, y: PAGE_HEIGHT - 58, font: regular, size: 9.5, color: rgb(0.78, 0.85, 0.95) }
  );
  page.drawText(
    `${args.locale === "nl" ? "Gegenereerd" : "Generated"}: ${args.generatedAt.toLocaleDateString(args.locale === "nl" ? "nl-NL" : "en-US", { day: "2-digit", month: "long", year: "numeric" })}`,
    { x: MARGIN, y: PAGE_HEIGHT - 74, font: regular, size: 9, color: rgb(0.72, 0.8, 0.92) }
  );

  drawPlateBadge(page, bold, args.plate, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 30);
}

class PdfLayout {
  private doc: PDFDocument;
  public bold: PDFFont;
  public regular: PDFFont;
  private args: ReportArgs;
  public page: PDFPage;
  public y: number;
  public pages: PDFPage[] = [];

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont, args: ReportArgs) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.args = args;
    this.page = this.newPage();
    this.y = PAGE_HEIGHT - HEADER_HEIGHT - 18;
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawHeader(page, this.bold, this.regular, this.args);
    this.pages.push(page);
    this.page = page;
    this.y = PAGE_HEIGHT - HEADER_HEIGHT - 18;
    return page;
  }

  ensureHeight(height: number) {
    if (this.y - height < MARGIN + FOOTER_HEIGHT) this.newPage();
  }

  gap(h = 6) {
    this.y -= h;
  }

  section(title: string, subtitle?: string) {
    this.ensureHeight(subtitle ? 40 : 28);
    this.y -= 6;
    // accent bar + title (no heavy background band)
    this.page.drawRectangle({ x: MARGIN, y: this.y - 13, width: 4, height: 15, color: NAVY });
    this.page.drawText(title, { x: MARGIN + 12, y: this.y - 11, font: this.bold, size: 12.5, color: NAVY });
    this.y -= 18;
    if (subtitle) {
      this.page.drawText(subtitle, { x: MARGIN + 12, y: this.y - 9, font: this.regular, size: 8.5, color: MUTED });
      this.y -= 13;
    }
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 2 }, end: { x: MARGIN + CONTENT_WIDTH, y: this.y - 2 }, thickness: 0.6, color: LINE });
    this.y -= 8;
  }

  // Two-column grid of label/value pairs (compact, alternating background).
  pairs(items: Array<{ label: string; value: string }>, columns = 2) {
    const colGap = 14;
    const colWidth = (CONTENT_WIDTH - colGap * (columns - 1)) / columns;
    const rowH = 22;
    for (let i = 0; i < items.length; i += columns) {
      this.ensureHeight(rowH + 2);
      const rowItems = items.slice(i, i + columns);
      const rowIndex = i / columns;
      if (rowIndex % 2 === 1) {
        this.page.drawRectangle({ x: MARGIN, y: this.y - rowH, width: CONTENT_WIDTH, height: rowH, color: ROW_ALT });
      }
      rowItems.forEach((item, c) => {
        const x = MARGIN + c * (colWidth + colGap);
        this.page.drawText(sanitizeWinAnsi(item.label).toUpperCase(), { x: x + 6, y: this.y - 9, font: this.bold, size: 6.8, color: MUTED });
        const valLines = splitText(item.value, this.regular, 9.5, colWidth - 12).slice(0, 1);
        this.page.drawText(valLines[0] ?? "-", { x: x + 6, y: this.y - 19, font: this.regular, size: 9.5, color: INK });
      });
      this.y -= rowH;
    }
    this.y -= 4;
  }

  paragraph(text: string, size = 9, color = SUBINK) {
    const lines = splitText(text, this.regular, size, CONTENT_WIDTH - 4);
    const lh = size + 4;
    this.ensureHeight(lines.length * lh + 4);
    lines.forEach((line, i) => {
      this.page.drawText(line, { x: MARGIN + 2, y: this.y - lh + 2 - i * lh, font: this.regular, size, color });
    });
    this.y -= lines.length * lh + 6;
  }

  bullets(items: string[], accent = NAVY) {
    if (!items.length) return;
    const size = 9;
    const lh = size + 4;
    for (const item of items) {
      const lines = splitText(item, this.regular, size, CONTENT_WIDTH - 22);
      this.ensureHeight(lines.length * lh + 4);
      this.page.drawCircle({ x: MARGIN + 6, y: this.y - 8, size: 1.8, color: accent });
      lines.forEach((line, i) => {
        this.page.drawText(line, { x: MARGIN + 16, y: this.y - lh + 2 - i * lh, font: this.regular, size, color: SUBINK });
      });
      this.y -= lines.length * lh + 4;
    }
    this.y -= 2;
  }

  table(headers: string[], rows: string[][], weights?: number[]) {
    const ws = (weights ?? headers.map(() => 1 / headers.length));
    const total = ws.reduce((a, b) => a + b, 0);
    const widths = ws.map((w) => (w / total) * CONTENT_WIDTH);

    const drawRow = (cols: string[], opts: { header?: boolean; alt?: boolean }) => {
      const wrapped = cols.map((col, idx) => splitText(col, opts.header ? this.bold : this.regular, 8.5, widths[idx] - 10));
      const maxLines = Math.max(...wrapped.map((w) => w.length), 1);
      const h = maxLines * 11 + 8;
      this.ensureHeight(h + 2);
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - h,
        width: CONTENT_WIDTH,
        height: h,
        color: opts.header ? NAVY : opts.alt ? ROW_ALT : WHITE
      });
      let x = MARGIN;
      for (let c = 0; c < widths.length; c += 1) {
        wrapped[c].forEach((line, i) => {
          this.page.drawText(line, {
            x: x + 5,
            y: this.y - 11 - i * 11,
            font: opts.header ? this.bold : this.regular,
            size: 8.5,
            color: opts.header ? WHITE : INK
          });
        });
        x += widths[c];
      }
      this.y -= h;
    };

    drawRow(headers, { header: true });
    if (rows.length === 0) {
      drawRow(Array(headers.length).fill("-"), { alt: false });
    } else {
      rows.forEach((r, i) => drawRow(r.slice(0, headers.length), { alt: i % 2 === 1 }));
    }
    // outer border
    this.y -= 0;
    this.y -= 8;
  }

  // Summary metric cards in a row.
  cards(items: Array<{ title: string; value: string; sub?: string; accent?: ReturnType<typeof rgb> }>) {
    if (!items.length) return;
    const gap = 8;
    const cardW = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
    const cardH = 58;
    this.ensureHeight(cardH + 8);
    items.forEach((card, index) => {
      const x = MARGIN + index * (cardW + gap);
      this.page.drawRectangle({ x, y: this.y - cardH, width: cardW, height: cardH, color: NAVY_SOFT, borderColor: LINE, borderWidth: 0.8 });
      this.page.drawRectangle({ x, y: this.y - cardH, width: 3.5, height: cardH, color: card.accent ?? NAVY });
      this.page.drawText(sanitizeWinAnsi(card.title).toUpperCase(), { x: x + 10, y: this.y - 15, font: this.bold, size: 6.8, color: MUTED });
      splitText(card.value, this.bold, 13, cardW - 18).slice(0, 1).forEach((line) => {
        this.page.drawText(line, { x: x + 10, y: this.y - 33, font: this.bold, size: 13, color: INK });
      });
      if (card.sub) {
        this.page.drawText(splitText(card.sub, this.regular, 7.5, cardW - 18)[0] ?? "", { x: x + 10, y: this.y - 47, font: this.regular, size: 7.5, color: MUTED });
      }
    });
    this.y -= cardH + 10;
  }

  // Coloured callout box (verdict / note).
  callout(title: string, body: string, accent: ReturnType<typeof rgb>) {
    const bodyLines = splitText(body, this.regular, 9, CONTENT_WIDTH - 24);
    const h = 22 + bodyLines.length * 12 + 8;
    this.ensureHeight(h + 4);
    this.page.drawRectangle({ x: MARGIN, y: this.y - h, width: CONTENT_WIDTH, height: h, color: rgb(0.98, 0.985, 0.995), borderColor: LINE, borderWidth: 0.8 });
    this.page.drawRectangle({ x: MARGIN, y: this.y - h, width: 4, height: h, color: accent });
    this.page.drawText(sanitizeWinAnsi(title), { x: MARGIN + 14, y: this.y - 16, font: this.bold, size: 10, color: accent });
    bodyLines.forEach((line, i) => {
      this.page.drawText(line, { x: MARGIN + 14, y: this.y - 30 - i * 12, font: this.regular, size: 9, color: SUBINK });
    });
    this.y -= h + 8;
  }

  finalize() {
    const total = this.pages.length;
    const label = (i: number) =>
      this.args.locale === "nl"
        ? `Kentekenrapport  -  ${formatDisplayPlate(this.args.plate)}  -  pagina ${i + 1} van ${total}`
        : `Kentekenrapport  -  ${formatDisplayPlate(this.args.plate)}  -  page ${i + 1} of ${total}`;
    this.pages.forEach((page, i) => {
      page.drawLine({ start: { x: MARGIN, y: FOOTER_HEIGHT }, end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_HEIGHT }, thickness: 0.6, color: LINE });
      page.drawText(label(i), { x: MARGIN, y: FOOTER_HEIGHT - 12, font: this.regular, size: 7.5, color: MUTED });
      const right = "kentekenrapport.com";
      page.drawText(right, { x: PAGE_WIDTH - MARGIN - this.regular.widthOfTextAtSize(right, 7.5), y: FOOTER_HEIGHT - 12, font: this.regular, size: 7.5, color: MUTED });
    });
  }
}

function drawHero(layout: PdfLayout, args: ReportArgs, image: PDFImage | null) {
  const { locale, data } = args;
  const vehicle = asRow(data.vehicle);
  const enriched = asRow(data.enriched);
  const page = layout.page;

  const heroH = 118;
  layout.ensureHeight(heroH + 6);
  const top = layout.y;
  const imgW = 168;
  const textW = CONTENT_WIDTH - imgW - 14;

  // container
  page.drawRectangle({ x: MARGIN, y: top - heroH, width: CONTENT_WIDTH, height: heroH, color: WHITE, borderColor: LINE, borderWidth: 0.8 });

  // vehicle title
  const title = [s(vehicle.brand), s(vehicle.tradeName)].filter((t) => t !== "-").join(" ") || "-";
  page.drawText(splitText(title, layout.bold, 16, textW - 20)[0] ?? title, { x: MARGIN + 14, y: top - 26, font: layout.bold, size: 16, color: INK });
  const sub = [s(vehicle.year), s(vehicle.fuelType), s(vehicle.bodyType)].filter((t) => t !== "-").join("  -  ");
  page.drawText(sub, { x: MARGIN + 14, y: top - 42, font: layout.regular, size: 9, color: MUTED });

  // mini facts
  const facts: Array<[string, string]> = [
    [locale === "nl" ? "APK geldig tot" : "MOT valid until", formatDateLabel(vehicle.apkExpiryDate)],
    [locale === "nl" ? "NAP-oordeel" : "Odometer verdict", s(vehicle.napVerdict)],
    [locale === "nl" ? "Geschatte km-stand" : "Estimated mileage", km(enriched.estimatedMileageNow)],
    [locale === "nl" ? "Tenaamstellingen" : "Registrations", s(asRow(vehicle.owners).count)]
  ];
  facts.forEach(([k, val], i) => {
    const fx = MARGIN + 14 + (i % 2) * (textW / 2);
    const fy = top - 62 - Math.floor(i / 2) * 26;
    page.drawText(k.toUpperCase(), { x: fx, y: fy, font: layout.bold, size: 6.5, color: MUTED });
    page.drawText(val, { x: fx, y: fy - 11, font: layout.regular, size: 9.5, color: INK });
  });

  // image panel
  const imgX = MARGIN + CONTENT_WIDTH - imgW;
  page.drawRectangle({ x: imgX, y: top - heroH, width: imgW, height: heroH, color: rgb(0.97, 0.98, 0.99) });
  page.drawLine({ start: { x: imgX, y: top - heroH }, end: { x: imgX, y: top }, thickness: 0.8, color: LINE });
  if (image) {
    const pad = 12;
    const availW = imgW - pad * 2;
    const availH = heroH - pad * 2;
    const scale = Math.min(availW / image.width, availH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: imgX + (imgW - w) / 2, y: top - heroH + (heroH - h) / 2, width: w, height: h });
  } else {
    page.drawText(locale === "nl" ? "Geen voertuigbeeld" : "No vehicle image", { x: imgX + 18, y: top - heroH / 2, font: layout.regular, size: 8.5, color: MUTED });
  }

  layout.y = top - heroH - 12;
}

function groupDefects(args: ReportArgs): Array<{ code: string; desc: string; count: number; last: string }> {
  const inspections = asRows(args.data.inspections);
  const defects = asRows(args.data.defects);
  const defectDescriptions = asRow(args.data.defectDescriptions);
  const source = defects.length ? defects : inspections;
  const map = new Map<string, { code: string; desc: string; count: number; lastVal: number; last: string }>();
  for (const row of source) {
    const code = String(row.gebrek_identificatie ?? "").trim();
    if (!code) continue;
    const desc = String(defectDescriptions[code] ?? row.gebrek_omschrijving ?? code);
    const dateRaw = row.meld_datum_door_keuringsinstantie_dt ?? row.meld_datum_door_keuringsinstantie ?? "";
    const lastVal = Number(String(dateRaw).replace(/\D/g, "")) || 0;
    const cur = map.get(code);
    if (cur) {
      cur.count += 1;
      if (lastVal > cur.lastVal) {
        cur.lastVal = lastVal;
        cur.last = formatDateLabel(dateRaw);
      }
    } else {
      map.set(code, { code, desc, count: 1, lastVal, last: formatDateLabel(dateRaw) });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || b.lastVal - a.lastVal)
    .map(({ code, desc, count, last }) => ({ code, desc, count, last }));
}

function buildReportSections(layout: PdfLayout, args: ReportArgs) {
  const { locale, data, aiInsights, aiValuation } = args;
  const vehicle = asRow(data.vehicle);
  const enriched = asRow(data.enriched);
  const inspections = asRows(data.inspections);
  const recalls = asRows(data.recalls);
  const engine = asRow(vehicle.engine);
  const weight = asRow(vehicle.weight);
  const extra = asRow(vehicle.extra);
  const groupedDefects = groupDefects(args);

  // ---- Summary cards ----
  const verdict = aiInsights?.purchaseVerdict;
  layout.cards([
    {
      title: locale === "nl" ? "Geschatte marktwaarde" : "Estimated market value",
      value: currency(enriched.estimatedValueNow),
      sub:
        enriched.estimatedValueMin != null && enriched.estimatedValueMax != null
          ? `${currency(enriched.estimatedValueMin)} - ${currency(enriched.estimatedValueMax)}`
          : undefined,
      accent: NAVY
    },
    {
      title: locale === "nl" ? "Geschatte km-stand" : "Estimated mileage",
      value: km(enriched.estimatedMileageNow),
      sub: s(enriched.mileageUsageProfile) !== "-" ? s(enriched.mileageUsageProfile) : undefined,
      accent: rgb(0.07, 0.44, 0.63)
    },
    {
      title: locale === "nl" ? "AI-aankoopadvies" : "AI recommendation",
      value: verdictLabel(verdict, locale),
      sub: aiInsights?.riskLevel ? `${locale === "nl" ? "Risico" : "Risk"}: ${aiInsights.riskLevel}` : undefined,
      accent: verdictColor(verdict ?? "AVOID")
    }
  ]);

  // ---- Vehicle details ----
  layout.section(locale === "nl" ? "Voertuiggegevens" : "Vehicle details");
  layout.pairs([
    { label: locale === "nl" ? "Merk / model" : "Brand / model", value: `${s(vehicle.brand)} ${s(vehicle.tradeName)}`.trim() },
    { label: locale === "nl" ? "Bouwjaar" : "Year", value: s(vehicle.year) },
    { label: locale === "nl" ? "Carrosserie" : "Body", value: s(vehicle.bodyType) },
    { label: locale === "nl" ? "Kleur" : "Colour", value: s(asRow(vehicle.color).primary) },
    { label: locale === "nl" ? "Brandstof" : "Fuel", value: s(vehicle.fuelType) },
    { label: locale === "nl" ? "Emissieklasse" : "Emission class", value: s(vehicle.emissionStandard) },
    { label: locale === "nl" ? "Motor" : "Engine", value: `${s(engine.displacement)} cc, ${s(engine.powerKw)} kW` },
    { label: "CO2", value: s(vehicle.co2) !== "-" ? `${s(vehicle.co2)} g/km` : "-" },
    { label: locale === "nl" ? "Massa leeg" : "Empty weight", value: s(weight.empty) !== "-" ? `${s(weight.empty)} kg` : "-" },
    { label: locale === "nl" ? "Voertuigcategorie" : "Vehicle category", value: s(extra.vehicleCategory) },
    { label: "APK", value: formatDateLabel(vehicle.apkExpiryDate) },
    { label: locale === "nl" ? "Eigenaar sinds" : "Owner since", value: formatDateLabel(vehicle.currentOwnerSince) }
  ]);

  // status flags as a single line
  const flags = [
    vehicle.wok ? "WOK" : null,
    vehicle.isTaxi ? (locale === "nl" ? "Taxi" : "Taxi") : null,
    vehicle.exportIndicator ? (locale === "nl" ? "Export" : "Export") : null,
    vehicle.hasOpenRecall ? (locale === "nl" ? "Open recall" : "Open recall") : null,
    vehicle.insured ? (locale === "nl" ? "Verzekerd" : "Insured") : null
  ].filter(Boolean) as string[];
  layout.pairs([
    { label: locale === "nl" ? "Statusflags" : "Status flags", value: flags.length ? flags.join(", ") : locale === "nl" ? "Geen bijzonderheden" : "None" }
  ], 1);

  // ---- Value & costs ----
  layout.section(
    locale === "nl" ? "Waarde en kosten" : "Value and costs",
    locale === "nl"
      ? "Schattingen op basis van RDW-data en onze modellen, geen taxatie."
      : "Estimates based on RDW data and our models, not an appraisal."
  );
  layout.pairs([
    { label: locale === "nl" ? "Marktwaarde nu" : "Market value now", value: currency(enriched.estimatedValueNow) },
    { label: locale === "nl" ? "Bandbreedte" : "Range", value: `${currency(enriched.estimatedValueMin)} - ${currency(enriched.estimatedValueMax)}` },
    { label: locale === "nl" ? "Betrouwbaarheid" : "Confidence", value: s(enriched.marketValueConfidence) },
    { label: locale === "nl" ? "Waarde volgend jaar" : "Value next year", value: currency(enriched.estimatedValueNextYear) },
    {
      label: locale === "nl" ? "Wegenbelasting / kwartaal" : "Road tax / quarter",
      value: `${currency(asRow(enriched.roadTaxEstQuarter).min)} - ${currency(asRow(enriched.roadTaxEstQuarter).max)}`
    },
    { label: locale === "nl" ? "Brandstof / maand" : "Fuel / month", value: currency(enriched.fuelEstMonth) }
  ]);
  layout.paragraph(
    locale === "nl"
      ? "De marktwaarde is gebaseerd op de catalogusprijs, leeftijd en de geschatte kilometerstand (RDW publiceert geen kilometerhistorie). Wegenbelasting is een indicatie; het exacte bedrag hangt af van de provincie (opcenten), bereken het op belastingdienst.nl."
      : "The market value is based on the catalogue price, age and the estimated mileage (RDW publishes no odometer history). Road tax is an indication; the exact amount depends on the province, calculate it at belastingdienst.nl.",
    8
  );

  // ---- Mileage ----
  layout.section(locale === "nl" ? "Kilometerstand en NAP" : "Mileage and odometer check");
  layout.pairs([
    { label: locale === "nl" ? "Onze schatting nu" : "Our estimate now", value: km(enriched.estimatedMileageNow) },
    { label: locale === "nl" ? "Bandbreedte" : "Range", value: `${km(enriched.estimatedMileageMin)} - ${km(enriched.estimatedMileageMax)}` },
    { label: locale === "nl" ? "Gem. per jaar" : "Avg. per year", value: km(enriched.mileageSlopeKmPerYear) },
    { label: locale === "nl" ? "Gebruiksprofiel" : "Usage profile", value: s(enriched.mileageUsageProfile) },
    { label: locale === "nl" ? "RDW NAP-oordeel" : "RDW odometer verdict", value: s(vehicle.napVerdict) },
    { label: locale === "nl" ? "Bron schatting" : "Estimate source", value: enriched.mileageEstimateSource === "formula" ? (locale === "nl" ? "Formule (leeftijd x gebruik)" : "Formula (age x usage)") : (locale === "nl" ? "APK-metingen" : "Inspection readings") }
  ]);

  // ---- APK & defects ----
  layout.section(locale === "nl" ? "APK en gebreken" : "Inspections and defects");
  if (groupedDefects.length === 0) {
    layout.paragraph(locale === "nl" ? "In de beschikbare RDW- en APK-historie zijn geen gebreken gemeld." : "No defects are reported in the available RDW and APK history.");
  } else {
    layout.table(
      [locale === "nl" ? "Gebrek" : "Defect", locale === "nl" ? "Code" : "Code", locale === "nl" ? "Aantal keer" : "Times", locale === "nl" ? "Laatst" : "Last"],
      groupedDefects.map((d) => [d.desc, d.code, `${d.count}x`, d.last]),
      [0.5, 0.16, 0.16, 0.18]
    );
  }
  layout.pairs([
    { label: locale === "nl" ? "Keuringen met gebreken" : "Inspections with defects", value: String(new Set(inspections.map((it) => String(it.meld_datum_door_keuringsinstantie_dt ?? it.meld_datum_door_keuringsinstantie ?? ""))).size || 0) },
    { label: locale === "nl" ? "Unieke gebreken" : "Unique defects", value: String(groupedDefects.length) }
  ]);

  // ---- Recalls ----
  if (recalls.length) {
    layout.section(locale === "nl" ? "Terugroepacties" : "Recalls");
    layout.table(
      [locale === "nl" ? "Campagne" : "Campaign", locale === "nl" ? "Omschrijving" : "Description", "Status"],
      recalls.map((it) => [s(it.campagnenummer), s(it.omschrijving_defect), s(it.status)]),
      [0.22, 0.56, 0.22]
    );
  }

  // ---- AI advice ----
  if (aiInsights) {
    layout.section(locale === "nl" ? "AI-aankoopadvies" : "AI purchase advice");
    layout.callout(
      `${locale === "nl" ? "Advies" : "Verdict"}: ${verdictLabel(aiInsights.purchaseVerdict, locale)}  -  ${locale === "nl" ? "Risico" : "Risk"}: ${aiInsights.riskLevel}`,
      aiInsights.summary,
      verdictColor(aiInsights.purchaseVerdict)
    );
    if (aiInsights.positives.length) {
      layout.paragraph(locale === "nl" ? "Sterke punten" : "Strengths", 9.5, NAVY);
      layout.bullets(aiInsights.positives, GREEN);
    }
    if (aiInsights.risks.length) {
      layout.paragraph(locale === "nl" ? "Aandachtspunten" : "Watch-outs", 9.5, NAVY);
      layout.bullets(aiInsights.risks, AMBER);
    }
    if (aiInsights.recommendation) {
      layout.pairs([{ label: locale === "nl" ? "Aanbeveling" : "Recommendation", value: aiInsights.recommendation }], 1);
    }
    layout.paragraph(
      args.aiSource === "fallback"
        ? locale === "nl"
          ? "Automatisch gegenereerd (AI tijdelijk niet beschikbaar). Indicatie op basis van RDW-data, geen taxatie of garantie."
          : "Automatically generated (AI temporarily unavailable). Indication based on RDW data, not an appraisal or guarantee."
        : locale === "nl"
        ? "AI-advies op basis van RDW-data: een indicatie, geen taxatie of garantie. Combineer met een fysieke inspectie en proefrit."
        : "AI guidance based on RDW data: an indication, not an appraisal or guarantee. Combine with a physical inspection and test drive.",
      7.5,
      MUTED
    );
  } else if (aiValuation) {
    layout.section(locale === "nl" ? "AI-waardering" : "AI valuation");
    layout.pairs([
      { label: locale === "nl" ? "Waarde nu" : "Value now", value: `${aiValuation.currency} ${aiValuation.estimatedValueNow.toLocaleString("nl-NL")}` },
      { label: locale === "nl" ? "Bandbreedte" : "Range", value: `${aiValuation.currency} ${aiValuation.estimatedValueMin.toLocaleString("nl-NL")} - ${aiValuation.estimatedValueMax.toLocaleString("nl-NL")}` }
    ]);
  }

  // ---- Disclaimer ----
  layout.section("Disclaimer");
  layout.paragraph(
    locale === "nl"
      ? "Feitelijke RDW-gegevens (identiteit, APK-historie, terugroepacties, brandstof, gewicht) komen rechtstreeks uit open RDW-data. Marktwaarde, geschatte kilometerstand en maandlasten zijn data-gedreven schattingen en algemene indicaties, geen formele taxatie, geen garantie en geen voertuigspecifieke diagnose. Werkelijke waarden en kosten kunnen afwijken. Combineer dit rapport altijd met een fysieke inspectie en aankoopkeuring."
      : "Factual RDW data (identity, inspection history, recalls, fuel, weight) comes directly from open RDW data. Market value, estimated mileage and monthly costs are data-driven estimates and general indications, not a formal appraisal, guarantee or vehicle-specific diagnosis. Actual values and costs may differ. Always combine this report with a physical inspection and a pre-purchase check.",
    8,
    MUTED
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
  const brand = typeof vehicle.brand === "string" && vehicle.brand.trim() ? vehicle.brand : null;
  const imageUrl = brand
    ? getVehicleImageUrl(brand, typeof vehicle.tradeName === "string" ? vehicle.tradeName : null, {
        angle: "01",
        zoomtype: "relative",
        color: typeof vehicleColor === "string" ? vehicleColor : null
      })
    : null;
  const vehicleImage = imageUrl ? await embedImageIfAvailable(doc, imageUrl) : null;

  drawHero(layout, args, vehicleImage);
  buildReportSections(layout, args);
  layout.finalize();

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
