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
  return sanitizeWinAnsi(String(value));
}

function boolLabel(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "-";
}

function currency(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `EUR ${Math.round(num).toLocaleString("nl-NL")}`;
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function verdictColor(verdict: AiInsights["purchaseVerdict"]) {
  if (verdict === "BUY") return rgb(0.08, 0.55, 0.28);
  if (verdict === "CONSIDER") return rgb(0.07, 0.44, 0.63);
  if (verdict === "CAUTION") return rgb(0.78, 0.5, 0.08);
  return rgb(0.72, 0.12, 0.18);
}

function riskColor(level: AiInsights["riskLevel"]) {
  if (level === "LOW") return rgb(0.08, 0.55, 0.28);
  if (level === "MEDIUM") return rgb(0.78, 0.5, 0.08);
  return rgb(0.72, 0.12, 0.18);
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

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont, args: ReportArgs) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.args = args;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawHeader(this.page, this.bold, this.regular, args);
    this.y = PAGE_HEIGHT - HEADER_HEIGHT - 16;
  }

  private addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
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

  paragraph(text: string, size = 8.5) {
    const lines = splitText(text, this.regular, size, CONTENT_WIDTH - 8);
    const blockHeight = lines.length * (size + 3) + 6;
    this.ensureHeight(blockHeight + 2);
    lines.forEach((line, i) => {
      this.page.drawText(line, {
        x: MARGIN + 4,
        y: this.y - (size + 4) - i * (size + 3),
        font: this.regular,
        size,
        color: rgb(0.42, 0.48, 0.56)
      });
    });
    this.y -= blockHeight + 4;
  }

  table(headers: string[], rows: string[][]) {
    const widths = [0.22, 0.18, 0.3, 0.3].slice(0, headers.length).map((w) => w * CONTENT_WIDTH);
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
}

function drawHeroVisuals(args: {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  data: Record<string, unknown>;
  image?: PDFImage | null;
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
  const valuation = args.aiValuation;
  const verdictLabel = ai?.purchaseVerdict ?? "-";
  const riskLabel = ai?.riskLevel ?? "-";
  const summary = ai?.summary ?? (args.locale === "nl" ? "AI-analyse niet beschikbaar." : "AI analysis unavailable.");

  args.page.drawText(args.locale === "nl" ? "AI aankoopadvies" : "AI purchase recommendation", {
    x: leftX + 10,
    y: heroTop - 18,
    font: args.bold,
    size: 11,
    color: rgb(0.08, 0.2, 0.45)
  });
  args.page.drawRectangle({
    x: leftX + 10,
    y: heroTop - 44,
    width: 120,
    height: 18,
    color: verdictColor(ai?.purchaseVerdict ?? "AVOID")
  });
  args.page.drawText(`${args.locale === "nl" ? "Verdict" : "Verdict"}: ${verdictLabel}`, {
    x: leftX + 15,
    y: heroTop - 38,
    font: args.bold,
    size: 9,
    color: rgb(1, 1, 1)
  });
  args.page.drawRectangle({
    x: leftX + 138,
    y: heroTop - 44,
    width: 95,
    height: 18,
    color: riskColor(ai?.riskLevel ?? "HIGH")
  });
  args.page.drawText(`${args.locale === "nl" ? "Risico" : "Risk"}: ${riskLabel}`, {
    x: leftX + 143,
    y: heroTop - 38,
    font: args.bold,
    size: 9,
    color: rgb(1, 1, 1)
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

  // Canonical headline value = the consolidated enriched value (model first,
  // AI-backfilled server-side when the model has none); fall back to the raw AI
  // valuation only if enriched is somehow absent.
  const vNow = toNumber(asRow(args.data.enriched).estimatedValueNow) ?? valuation?.estimatedValueNow;
  const vMin = toNumber(asRow(args.data.enriched).estimatedValueMin) ?? valuation?.estimatedValueMin;
  const vMax = toNumber(asRow(args.data.enriched).estimatedValueMax) ?? valuation?.estimatedValueMax;
  args.page.drawText(args.locale === "nl" ? "Marktwaarde (AI)" : "Market value (AI)", {
    x: leftX + 10,
    y: cardY + 45,
    font: args.bold,
    size: 10,
    color: rgb(0.08, 0.2, 0.45)
  });

  if (vNow && vMin && vMax && vMax > vMin) {
    const barWidth = leftW - 20;
    const barY = cardY + 28;
    const rangeMin = vMin * 0.9;
    const rangeMax = vMax * 1.1;
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

  // Honest, vehicle-specific facts instead of a generic static country map.
  const enrichedRow = asRow(args.data.enriched);
  const vehicleRow = asRow(args.data.vehicle);
  const mileageNow = toNumber(enrichedRow.estimatedMileageNow);
  const mileageText = mileageNow != null ? `${mileageNow.toLocaleString("nl-NL")} km` : "-";
  const napVerdict = s(vehicleRow.napVerdict);

  args.page.drawText(args.locale === "nl" ? "Kerncijfers" : "Key figures", {
    x: rightX + 8,
    y: cardY + 54,
    font: args.bold,
    size: 9,
    color: rgb(0.08, 0.2, 0.45)
  });
  args.page.drawText(`${args.locale === "nl" ? "Geschat km-stand" : "Estimated mileage"}: ${mileageText}`, {
    x: rightX + 8,
    y: cardY + 38,
    font: args.regular,
    size: 8.5,
    color: rgb(0.16, 0.24, 0.35)
  });
  args.page.drawText(`${args.locale === "nl" ? "NAP-oordeel" : "Odometer verdict"}: ${napVerdict}`, {
    x: rightX + 8,
    y: cardY + 24,
    font: args.regular,
    size: 8.5,
    color: rgb(0.16, 0.24, 0.35)
  });
}

function buildReportSections(layout: PdfLayout, args: ReportArgs) {
  const { locale, data, aiInsights, aiValuation } = args;
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
  const knownIssues = asRows(enriched.knownIssues);

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

  layout.y -= 172;

  layout.section(locale === "nl" ? "Beslissingsdashboard" : "Decision Dashboard");
  layout.drawCardRow([
    {
      title: locale === "nl" ? "AI Verdict" : "AI Verdict",
      value: args.aiInsights?.purchaseVerdict ?? "-",
      accent: verdictColor(args.aiInsights?.purchaseVerdict ?? "AVOID")
    },
    {
      title: locale === "nl" ? "Risiconiveau" : "Risk level",
      value: args.aiInsights?.riskLevel ?? "-",
      accent: riskColor(args.aiInsights?.riskLevel ?? "HIGH")
    },
    {
      title: locale === "nl" ? "Waarde nu" : "Value now",
      value: currency(enriched.estimatedValueNow),
      accent: rgb(0.08, 0.2, 0.45)
    }
  ]);

  if (args.aiInsights?.recommendations?.length) {
    layout.keyValue(locale === "nl" ? "Actieplan" : "Action plan", args.aiInsights.recommendations.join(" | "));
  }

  layout.section(locale === "nl" ? "Voertuigoverzicht" : "Vehicle Overview");
  layout.keyValue(locale === "nl" ? "Merk / Model" : "Brand / Model", `${s(vehicle.brand)} ${s(vehicle.tradeName)}`.trim());
  layout.keyValue(locale === "nl" ? "Bouwjaar / Carrosserie" : "Year / Body type", `${s(vehicle.year)} / ${s(vehicle.bodyType)}`);
  layout.keyValue(locale === "nl" ? "Brandstof / Kleur" : "Fuel / Color", `${s(vehicle.fuelType)} / ${s(asRow(vehicle.color).primary)}`);
  layout.keyValue(locale === "nl" ? "Motor" : "Engine", `${s(asRow(vehicle.engine).displacement)} cc, ${s(asRow(vehicle.engine).cylinders)} cyl, ${s(asRow(vehicle.engine).powerKw)} kW`);
  layout.keyValue(locale === "nl" ? "Gewicht" : "Weight", `${s(asRow(vehicle.weight).empty)} kg empty, ${s(asRow(vehicle.weight).max)} kg max`);
  layout.keyValue(locale === "nl" ? "APK vervaldatum" : "APK expiry", s(vehicle.apkExpiryDate));
  layout.keyValue(locale === "nl" ? "Statusflags" : "Status flags", `WOK: ${boolLabel(vehicle.wok)}, Export: ${boolLabel(vehicle.exportIndicator)}, Transfer: ${boolLabel(vehicle.transferPossible)}, Insured: ${boolLabel(vehicle.insured)}, Taxi: ${boolLabel(vehicle.isTaxi)}, Recall open: ${boolLabel(vehicle.hasOpenRecall)}`);

  layout.section(locale === "nl" ? "Waarde en kosten (schatting)" : "Value and Cost (estimate)");
  layout.keyValue(locale === "nl" ? "Marktwaarde nu / volgend jaar" : "Market value now / next year", `${currency(enriched.estimatedValueNow)} / ${currency(enriched.estimatedValueNextYear)}`);
  layout.keyValue(locale === "nl" ? "Marktbandbreedte" : "Market range", `${currency(enriched.estimatedValueMin)} - ${currency(enriched.estimatedValueMax)} (${s(enriched.marketValueConfidence)} confidence)`);
  layout.keyValue(locale === "nl" ? "APK kans / onderhoudsrisico" : "APK chance / maintenance risk", `${s(enriched.apkPassChance)}% / ${s(enriched.maintenanceRiskScore)}`);
  layout.keyValue(
    locale === "nl" ? "Wegenbelasting per kwartaal" : "Road tax per quarter",
    `${currency(asRow(enriched.roadTaxEstQuarter).min)} - ${currency(asRow(enriched.roadTaxEstQuarter).max)} ${
      locale === "nl"
        ? "(schatting incl. gem. opcenten; exact via belastingdienst.nl)"
        : "(estimate incl. avg. provincial surcharge; exact via belastingdienst.nl)"
    }`
  );
  layout.keyValue(locale === "nl" ? "Brandstof per maand (schatting)" : "Fuel per month (estimate)", currency(enriched.fuelEstMonth));

  layout.section(locale === "nl" ? "APK inspecties" : "APK Inspections");
  layout.table(
    [locale === "nl" ? "Datum" : "Date", locale === "nl" ? "Code" : "Code", locale === "nl" ? "Type" : "Type", locale === "nl" ? "Aantal" : "Count"],
    inspections.map((it) => [
      s(it.meld_datum_door_keuringsinstantie_dt ?? it.meld_datum_door_keuringsinstantie),
      s(it.gebrek_identificatie),
      s(it.soort_erkenning_omschrijving),
      s(it.aantal_gebreken_geconstateerd)
    ])
  );

  layout.section(locale === "nl" ? "Defecten" : "Defects");
  layout.table(
    [locale === "nl" ? "Code" : "Code", locale === "nl" ? "Omschrijving" : "Description", locale === "nl" ? "Bron" : "Source", locale === "nl" ? "Opmerking" : "Notes"],
    derivedDefects.map((it) => {
      const row = it as Row;
      const code = s(row.gebrek_identificatie);
      return [code, s(row.gebrek_omschrijving ?? defectDescriptions[code]), defects.length > 0 ? "defects" : "inspection", s(row.toelichting)];
    })
  );

  layout.section(locale === "nl" ? "Terugroepacties" : "Recalls");
  layout.table(
    [locale === "nl" ? "Campagne" : "Campaign", locale === "nl" ? "Defect" : "Defect", locale === "nl" ? "Status" : "Status"],
    recalls.map((it) => [s(it.campagnenummer), s(it.omschrijving_defect), s(it.status)])
  );

  layout.section(locale === "nl" ? "Brandstofrecords (RDW raw)" : "Fuel Records (RDW raw)");
  layout.table(
    [locale === "nl" ? "Brandstof" : "Fuel", "CO2", locale === "nl" ? "Verbruik combi" : "Combined usage", locale === "nl" ? "Emissie" : "Emission"],
    fuel.map((it) => [s(it.brandstof_omschrijving), s(it.co2_uitstoot_gecombineerd), s(it.brandstofverbruik_gecombineerd), s(it.uitlaatemissieniveau)])
  );

  layout.section(locale === "nl" ? "Carrosserie en typegoedkeuring" : "Body and Type Approval");
  layout.table(
    [locale === "nl" ? "Carrosserie" : "Body", locale === "nl" ? "Europese omschrijving" : "EU description", locale === "nl" ? "Typegoedkeuring" : "Type approval"],
    [
      ...body.map((it) => [s(it.carrosserietype), s(it.type_carrosserie_europese_omschrijving), "-"]),
      ...typeApprovals.map((it) => ["-", "-", s(it.typegoedkeuringsnummer ?? it.eu_typegoedkeuring ?? it.typegoedkeuringsnummer_voertuig)])
    ]
  );

  layout.section(locale === "nl" ? "Aandachtspunten (uit recall en terugkerende defecten)" : "Known Issues (from recall and recurring defects)");
  layout.table(
    [locale === "nl" ? "Issue" : "Issue", locale === "nl" ? "Ernst" : "Severity", locale === "nl" ? "Doel" : "Target", locale === "nl" ? "Advies" : "Advice"],
    knownIssues.map((it) => [s(it.title), s(it.severity), s(it.target), s(it.advice)])
  );

  if (aiValuation) {
    layout.section(locale === "nl" ? "AI waardering" : "AI Valuation");
    layout.keyValue(locale === "nl" ? "Waarde nu" : "Value now", `${aiValuation.currency} ${aiValuation.estimatedValueNow.toLocaleString("nl-NL")}`);
    layout.keyValue(locale === "nl" ? "Bandbreedte" : "Range", `${aiValuation.currency} ${aiValuation.estimatedValueMin.toLocaleString("nl-NL")} - ${aiValuation.currency} ${aiValuation.estimatedValueMax.toLocaleString("nl-NL")}`);
    layout.keyValue(locale === "nl" ? "Confidence" : "Confidence", aiValuation.confidence);
    layout.keyValue(locale === "nl" ? "Factoren" : "Factors", aiValuation.factors.join(" | "));
    layout.keyValue(locale === "nl" ? "Toelichting" : "Explanation", aiValuation.explanation);
  }

  if (aiInsights) {
    layout.section(locale === "nl" ? "AI feedback en advies" : "AI Feedback and Opinion");
    layout.keyValue(locale === "nl" ? "Aankoop verdict" : "Purchase verdict", `${aiInsights.purchaseVerdict} (${aiInsights.riskLevel})`);
    layout.keyValue(locale === "nl" ? "Samenvatting" : "Summary", aiInsights.summary);
    layout.keyValue(locale === "nl" ? "Sterke punten" : "Positives", aiInsights.positives.join(" | "));
    layout.keyValue(locale === "nl" ? "Risico's" : "Risks", aiInsights.risks.join(" | "));
    layout.keyValue(locale === "nl" ? "Aanbeveling" : "Recommendation", aiInsights.recommendation);
    if (aiInsights.recommendations.length > 0) {
      layout.keyValue(locale === "nl" ? "Concrete vervolgstappen" : "Concrete next steps", aiInsights.recommendations.join(" | "));
    }
  }

  if (aiValuation || aiInsights) {
    layout.keyValue(
      locale === "nl" ? "Let op" : "Note",
      args.aiSource === "fallback"
        ? locale === "nl"
          ? "Automatisch gegenereerd omdat de AI-analyse tijdelijk niet beschikbaar was. Indicatie op basis van RDW-data, geen taxatie of garantie."
          : "Automatically generated because the AI analysis was temporarily unavailable. An indication based on RDW data, not an appraisal or guarantee."
        : locale === "nl"
        ? "AI-advies op basis van de RDW-data: een indicatie, geen taxatie of garantie. Combineer altijd met een fysieke inspectie en proefrit."
        : "AI guidance based on the RDW data: an indication, not an appraisal or guarantee. Always combine it with a physical inspection and test drive."
    );
  }

  layout.section(locale === "nl" ? "Brondata samenvatting" : "Source Data Summary");
  layout.keyValue("raw.main", `${rawMain.length} ${locale === "nl" ? "records" : "records"}`);
  layout.keyValue("raw.fuel", `${fuel.length} ${locale === "nl" ? "records" : "records"}`);
  layout.keyValue("raw.apk", `${rawApk.length} ${locale === "nl" ? "records" : "records"}`);
  layout.keyValue("raw.defects", `${rawDefects.length} ${locale === "nl" ? "records" : "records"}`);
  layout.keyValue("raw.recalls", `${rawRecalls.length} ${locale === "nl" ? "records" : "records"}`);
  layout.keyValue("raw.body", `${body.length} ${locale === "nl" ? "records" : "records"}`);
  layout.keyValue("raw.typeApprovals", `${typeApprovals.length} ${locale === "nl" ? "records" : "records"}`);

  layout.section(locale === "nl" ? "Disclaimer" : "Disclaimer");
  layout.paragraph(
    locale === "nl"
      ? "Feitelijke RDW-gegevens (identiteit, APK-historie, terugroepacties, brandstof, gewicht) komen rechtstreeks uit open RDW-data. Marktwaarde en maandlasten (wegenbelasting, brandstof) zijn data-gedreven schattingen en algemene indicaties, geen formele taxatie, geen garantie en geen voertuigspecifieke diagnose. Werkelijke waarden en kosten kunnen afwijken. Gebruik dit rapport als hulpmiddel en combineer het altijd met een fysieke inspectie en aankoopkeuring."
      : "Factual RDW data (identity, inspection history, recalls, fuel, weight) comes directly from open RDW data. Market value and monthly costs (road tax, fuel) are data-driven estimates and general indications, not a formal appraisal, guarantee, or vehicle-specific diagnosis. Actual values and costs may differ. Use this report as guidance and always combine it with a physical inspection and pre-purchase check."
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
  // Only embed a real, brand-derived vehicle image. If it is unavailable we show
  // a neutral placeholder rather than an unrelated stock photo of another car.
  const brand = typeof vehicle.brand === "string" && vehicle.brand.trim() ? vehicle.brand : null;
  const imageUrl = brand
    ? getVehicleImageUrl(brand, typeof vehicle.tradeName === "string" ? vehicle.tradeName : null, {
        angle: "01",
        zoomtype: "relative",
        color: typeof vehicleColor === "string" ? vehicleColor : null
      })
    : null;
  const vehicleImage = imageUrl ? await embedImageIfAvailable(doc, imageUrl) : null;
  drawHeroVisuals({
    page: layout.page,
    regular,
    bold,
    data: args.data,
    image: vehicleImage,
    aiInsights: args.aiInsights,
    aiValuation: args.aiValuation,
    locale: args.locale
  });
  buildReportSections(layout, args);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}
