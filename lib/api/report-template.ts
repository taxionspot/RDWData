import { formatDisplayPlate } from "@/lib/rdw/normalize";

export type AiInsights = {
  summary: string;
  positives: string[];
  risks: string[];
  recommendation: string;
};

export type AiValuation = {
  currency: "EUR";
  estimatedValueNow: number;
  estimatedValueMin: number;
  estimatedValueMax: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  factors: string[];
  explanation: string;
};

export type ReportScore = {
  score: number;
  label: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function generateVehicleReportHtml(args: {
  plate: string;
  locale: "nl" | "en";
  generatedAt: Date;
  score: ReportScore;
  data: unknown;
  aiInsights?: AiInsights | null;
  aiValuation?: AiValuation | null;
}): string {
  const { plate, locale, generatedAt, score, data, aiInsights, aiValuation } = args;
  const d = data as Record<string, unknown>;
  const vehicle = (d.vehicle ?? {}) as Record<string, unknown>;
  const enriched = (d.enriched ?? {}) as Record<string, unknown>;
  const inspections = Array.isArray(d.inspections) ? (d.inspections as Array<Record<string, unknown>>) : [];
  const defects = Array.isArray(d.defects) ? (d.defects as Array<Record<string, unknown>>) : [];
  const recalls = Array.isArray(d.recalls) ? (d.recalls as Array<Record<string, unknown>>) : [];
  const knownIssues = Array.isArray(enriched.knownIssues) ? (enriched.knownIssues as Array<Record<string, unknown>>) : [];
  const repairChances = Array.isArray(enriched.repairChances) ? (enriched.repairChances as Array<Record<string, unknown>>) : [];
  const defectDescriptions = (d.defectDescriptions ?? {}) as Record<string, string>;

  const escape = (value: unknown) => escapeHtml(String(value ?? "-"));
  const platformName = process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "Kentekenrapport";
  const reportTitle = locale === "nl" ? "Voertuigrapport" : "Vehicle Report";
  const generatedLabel = locale === "nl" ? "Gegenereerd op" : "Generated at";
  const replyLine = locale === "nl" ? "Vragen? Beantwoord deze e-mail." : "Questions? Just reply to this email.";
  const disclaimerLines =
    locale === "nl"
      ? [
          "De getoonde marktwaarde is een indicatieve schatting en geen aankoopadvies.",
          "Dit rapport is een automatische analyse op basis van officiële RDW-data en kan onvolledig of verouderd zijn.",
          "Dit rapport is digitale content. Na levering vervalt het herroepingsrecht.",
          "Bronvermelding: RDW open data."
        ]
      : [
          "The market value shown is an indicative estimate and not purchase advice.",
          "This report is an automated analysis based on official RDW data and may be incomplete or outdated.",
          "This report is digital content. The right of withdrawal lapses after delivery.",
          "Source attribution: RDW open data."
        ];

  const inspectionsRows = inspections
    .map(
      (item) =>
        `<tr><td>${escape(item.meld_datum_door_keuringsinstantie_dt ?? item.meld_datum_door_keuringsinstantie ?? "-")}</td><td>${escape(item.gebrek_identificatie ?? "-")}</td><td>${escape(item.soort_erkenning_omschrijving ?? "-")}</td><td>${escape(item.aantal_gebreken_geconstateerd ?? "-")}</td></tr>`
    )
    .join("");

  const derivedDefects =
    defects.length > 0
      ? defects
      : inspections.map((item) => {
          const code = String(item.gebrek_identificatie ?? "-");
          return {
            gebrek_identificatie: code,
            gebrek_omschrijving: defectDescriptions[code] ?? "-"
          };
        });

  const defectsRows = derivedDefects
    .map((item) => {
      const row = item as Record<string, unknown>;
      const defectCode = String(row.gebrek_identificatie ?? "-");
      return `<tr><td>${escape(defectCode)}</td><td>${escape(row.gebrek_omschrijving ?? defectDescriptions[defectCode] ?? "-")}</td><td>${escape(row.toelichting ?? "-")}</td></tr>`;
    })
    .join("");

  const recallsRows = recalls
    .map(
      (item) =>
        `<tr><td>${escape(item.campagnenummer ?? "-")}</td><td>${escape(item.omschrijving_defect ?? "-")}</td><td>${escape(item.status ?? "-")}</td></tr>`
    )
    .join("");

  const repairRows = repairChances
    .map(
      (item) =>
        `<tr><td>${escape(item.name ?? "-")}</td><td>${escape(item.chance ?? "-")}%</td><td>EUR ${escape(item.estMin ?? "-")} - EUR ${escape(item.estMax ?? "-")}</td></tr>`
    )
    .join("");

  const issuesRows = knownIssues
    .map(
      (item) =>
        `<tr><td>${escape(item.title ?? "-")}</td><td>${escape(item.severity ?? "-")}</td><td>${escape(item.target ?? "-")}</td><td>${escape(item.advice ?? "-")}</td></tr>`
    )
    .join("");

  const aiSummarySection = aiInsights
    ? `
  <h2>${escape(locale === "nl" ? "AI rapportinzichten" : "AI report insights")}</h2>
  <table>
    <tr><th>${escape(locale === "nl" ? "Onderdeel" : "Section")}</th><th>${escape(locale === "nl" ? "Inhoud" : "Content")}</th></tr>
    <tr><td>${escape(locale === "nl" ? "Samenvatting" : "Summary")}</td><td>${escape(aiInsights.summary || "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Sterke punten" : "Positives")}</td><td>${escape(aiInsights.positives.join(" | ") || "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Risico's" : "Risks")}</td><td>${escape(aiInsights.risks.join(" | ") || "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Aanbeveling" : "Recommendation")}</td><td>${escape(aiInsights.recommendation || "-")}</td></tr>
  </table>`
    : "";

  const aiValuationSection = aiValuation
    ? `
  <h2>${escape(locale === "nl" ? "Marktwaardering" : "Market valuation")}</h2>
  <table>
    <tr><th>${escape(locale === "nl" ? "Onderdeel" : "Section")}</th><th>${escape(locale === "nl" ? "Waarde" : "Value")}</th></tr>
    <tr><td>${escape(locale === "nl" ? "Huidige waarde" : "Estimated value now")}</td><td>${escape(aiValuation.currency)} ${escape(aiValuation.estimatedValueNow.toLocaleString("nl-NL"))}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Bandbreedte" : "Estimated range")}</td><td>${escape(aiValuation.currency)} ${escape(aiValuation.estimatedValueMin.toLocaleString("nl-NL"))} - ${escape(aiValuation.currency)} ${escape(aiValuation.estimatedValueMax.toLocaleString("nl-NL"))}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Betrouwbaarheid" : "Confidence")}</td><td>${escape(aiValuation.confidence)}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Factoren" : "Key factors")}</td><td>${escape(aiValuation.factors.join(" | ") || "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Toelichting" : "Explanation")}</td><td>${escape(aiValuation.explanation || "-")}</td></tr>
  </table>`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escape(reportTitle)} ${escape(plate)}</title>
  <style>
    body { font-family: Arial, sans-serif; color:#0f172a; margin:24px; line-height:1.4; }
    h1,h2 { margin:0 0 8px; }
    h1 { font-size:24px; }
    h2 { font-size:16px; margin-top:24px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; }
    .meta { color:#475569; font-size:12px; margin-bottom:16px; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .card { border:1px solid #e2e8f0; border-radius:8px; padding:10px; }
    .label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.04em; }
    .value { font-size:14px; font-weight:600; margin-top:2px; }
    table { width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; }
    th,td { border:1px solid #e2e8f0; text-align:left; padding:6px; vertical-align:top; }
    th { background:#f8fafc; }
    pre { white-space:pre-wrap; word-break:break-word; border:1px solid #e2e8f0; border-radius:8px; padding:12px; background:#f8fafc; font-size:11px; }
    .brand-header { background:#0d3373; color:#ffffff; border-radius:10px; padding:18px 20px; margin-bottom:16px; }
    .brand-name { font-size:20px; font-weight:700; letter-spacing:.02em; }
    .brand-subtitle { font-size:12px; color:#cdd9f2; margin-top:4px; }
    .footer { margin-top:28px; border-top:1px solid #e2e8f0; padding-top:12px; }
    .reply-line { font-size:13px; color:#0f172a; font-weight:600; margin:0 0 10px; }
    .disclaimer { font-size:10px; color:#64748b; line-height:1.5; margin:0; }
    @page { size:A4; margin:14mm; }
  </style>
</head>
<body>
  <div class="brand-header">
    <div class="brand-name">${escape(platformName)}</div>
    <div class="brand-subtitle">${escape(reportTitle)} - ${escape(formatDisplayPlate(plate))}</div>
  </div>
  <h1>${escape(reportTitle)} - ${escape(formatDisplayPlate(plate))}</h1>
  <div class="meta">${escape(generatedLabel)}: ${escape(generatedAt.toLocaleString(locale === "nl" ? "nl-NL" : "en-US"))}</div>

  <h2>${escape(locale === "nl" ? "Samenvatting" : "Summary")}</h2>
  <div class="grid">
    <div class="card"><div class="label">${escape(locale === "nl" ? "Voertuig" : "Vehicle")}</div><div class="value">${escape(`${String(vehicle.brand ?? "")} ${String(vehicle.tradeName ?? "")}`.trim())}</div></div>
    <div class="card"><div class="label">${escape(locale === "nl" ? "Bouwjaar" : "Year")}</div><div class="value">${escape(vehicle.year ?? "-")}</div></div>
    <div class="card"><div class="label">${escape(locale === "nl" ? "Brandstof" : "Fuel")}</div><div class="value">${escape(vehicle.fuelType ?? "-")}</div></div>
    <div class="card"><div class="label">Score</div><div class="value">${escape(score.score)} / 100 (${escape(score.label)})</div></div>
  </div>

  <h2>${escape(locale === "nl" ? "Technische gegevens" : "Technical details")}</h2>
  <table>
    <tr><th>${escape(locale === "nl" ? "Veld" : "Field")}</th><th>${escape(locale === "nl" ? "Waarde" : "Value")}</th></tr>
    <tr><td>APK</td><td>${escape(vehicle.apkExpiryDate ?? "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Leeggewicht" : "Empty weight")}</td><td>${escape((vehicle.weight as Record<string, unknown> | undefined)?.empty ?? "-")} kg</td></tr>
    <tr><td>CO2</td><td>${escape(vehicle.co2 ?? "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Energielabel" : "Energy label")}</td><td>${escape(vehicle.energyLabel ?? "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Onderhoudsrisico" : "Maintenance risk")}</td><td>${escape(enriched.maintenanceRiskScore ?? "-")}</td></tr>
  </table>

  <h2>${escape(locale === "nl" ? "APK inspecties" : "APK inspections")}</h2>
  <table>
    <tr><th>${escape(locale === "nl" ? "Datum" : "Date")}</th><th>${escape(locale === "nl" ? "Gebrek code" : "Defect code")}</th><th>${escape(locale === "nl" ? "Type" : "Type")}</th><th>${escape(locale === "nl" ? "Aantal" : "Count")}</th></tr>
    ${inspectionsRows || `<tr><td colspan="4">-</td></tr>`}
  </table>

  <h2>${escape(locale === "nl" ? "Defecten" : "Defects")}</h2>
  <table>
    <tr><th>${escape(locale === "nl" ? "Code" : "Code")}</th><th>${escape(locale === "nl" ? "Omschrijving" : "Description")}</th><th>${escape(locale === "nl" ? "Toelichting" : "Notes")}</th></tr>
    ${defectsRows || `<tr><td colspan="3">-</td></tr>`}
  </table>

  <h2>${escape(locale === "nl" ? "Terugroepacties" : "Recalls")}</h2>
  <table>
    <tr><th>${escape(locale === "nl" ? "Campagne" : "Campaign")}</th><th>${escape(locale === "nl" ? "Defect" : "Defect")}</th><th>Status</th></tr>
    ${recallsRows || `<tr><td colspan="3">-</td></tr>`}
  </table>

  <h2>${escape(locale === "nl" ? "Marktwaarde en kosten" : "Market value and costs")}</h2>
  <table>
    <tr><th>${escape(locale === "nl" ? "Onderdeel" : "Section")}</th><th>${escape(locale === "nl" ? "Waarde" : "Value")}</th></tr>
    <tr><td>${escape(locale === "nl" ? "Huidige marktwaarde" : "Current market value")}</td><td>EUR ${escape(enriched.estimatedValueNow ?? "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Bandbreedte" : "Range")}</td><td>EUR ${escape(enriched.estimatedValueMin ?? "-")} - EUR ${escape(enriched.estimatedValueMax ?? "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Waarde volgend jaar" : "Estimated value next year")}</td><td>EUR ${escape(enriched.estimatedValueNextYear ?? "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Wegenbelasting per kwartaal" : "Road tax per quarter")}</td><td>EUR ${escape((enriched.roadTaxEstQuarter as Record<string, unknown> | undefined)?.min ?? "-")} - EUR ${escape((enriched.roadTaxEstQuarter as Record<string, unknown> | undefined)?.max ?? "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Verzekering per maand" : "Insurance per month")}</td><td>EUR ${escape(enriched.insuranceEstMonth ?? "-")}</td></tr>
    <tr><td>${escape(locale === "nl" ? "Brandstof per maand" : "Fuel per month")}</td><td>EUR ${escape(enriched.fuelEstMonth ?? "-")}</td></tr>
  </table>

  <h2>${escape(locale === "nl" ? "Reparatiekansen" : "Repair chances")}</h2>
  <table>
    <tr><th>${escape(locale === "nl" ? "Onderdeel" : "Part")}</th><th>${escape(locale === "nl" ? "Kans" : "Chance")}</th><th>${escape(locale === "nl" ? "Kostenindicatie" : "Estimated cost")}</th></tr>
    ${repairRows || `<tr><td colspan="3">-</td></tr>`}
  </table>

  <h2>${escape(locale === "nl" ? "Bekende aandachtspunten" : "Known issues")}</h2>
  <table>
    <tr><th>${escape(locale === "nl" ? "Issue" : "Issue")}</th><th>${escape(locale === "nl" ? "Ernst" : "Severity")}</th><th>${escape(locale === "nl" ? "Doelgroep" : "Target")}</th><th>${escape(locale === "nl" ? "Advies" : "Advice")}</th></tr>
    ${issuesRows || `<tr><td colspan="4">-</td></tr>`}
  </table>
  ${aiValuationSection}
  ${aiSummarySection}

  <div class="footer">
    <p class="reply-line">${escape(replyLine)}</p>
    <p class="disclaimer">${disclaimerLines.map((line) => escape(line)).join("<br />")}</p>
  </div>
</body>
</html>`;
}
