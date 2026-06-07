import { stripBannedDashes } from "@/lib/utils/text";
import { runAgent } from "./runner";
import type { ReportFinding, ReportInputs, ReportSection, SectionId, SectionTone, Severity } from "./types";

function rec(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
}
function str(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x.trim() : null;
}
function arr(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}
function L(locale: "nl" | "en", nl: string, en: string): string {
  return locale === "nl" ? nl : en;
}
const eur = (n: number | null) => (n == null ? "-" : `EUR ${Math.round(n).toLocaleString("nl-NL")}`);
const km = (n: number | null) => (n == null ? "-" : `${Math.round(n).toLocaleString("nl-NL")} km`);

function normSeverity(x: unknown): Severity {
  const s = String(x ?? "").toLowerCase();
  if (s.startsWith("high") || s.startsWith("hoog")) return "high";
  if (s.startsWith("med") || s.startsWith("aandacht")) return "medium";
  if (s.startsWith("low") || s.startsWith("laag")) return "low";
  return "info";
}

function deriveTone(findings: ReportFinding[]): SectionTone {
  if (findings.some((f) => f.severity === "high")) return "danger";
  if (findings.some((f) => f.severity === "medium")) return "warning";
  if (findings.length === 0 || findings.every((f) => f.severity === "info")) return "success";
  return "neutral";
}

type AgentOutput = { status: string; summary: string; findings: ReportFinding[] };

function parseAgentOutput(raw: unknown): AgentOutput | null {
  const r = rec(raw);
  const summary = str(r.summary);
  if (!summary) return null;
  const findings = arr(r.findings)
    .map((f): ReportFinding | null => {
      const fr = rec(f);
      const label = str(fr.label);
      const detail = str(fr.detail);
      if (!label || !detail) return null;
      return { label: stripBannedDashes(label), detail: stripBannedDashes(detail), severity: normSeverity(fr.severity) };
    })
    .filter((f): f is ReportFinding => f !== null)
    .slice(0, 6);
  return { status: stripBannedDashes(str(r.status) ?? ""), summary: stripBannedDashes(summary), findings };
}

const SCHEMA_HINT = `{ "status": "kort label (max 4 woorden)", "summary": "2-4 zinnen, menselijk", "findings": [ { "label": "korte titel", "detail": "1-2 zinnen uitleg", "severity": "high|medium|low|info" } ] }`;

async function buildSection(args: {
  id: SectionId;
  title: string;
  persona: string;
  task: string;
  facts: { label: string; value: string }[];
  fallback: AgentOutput;
  apiKey: string;
  sharedContext: string;
  maxTokens?: number;
  debug?: boolean;
}): Promise<ReportSection> {
  const raw = await runAgent({
    apiKey: args.apiKey,
    tier: "haiku",
    persona: args.persona,
    sharedContext: args.sharedContext,
    task: args.task,
    maxTokens: args.maxTokens ?? 900,
    debug: args.debug
  });
  const parsed = parseAgentOutput(raw);
  const out = parsed ?? args.fallback;
  return {
    id: args.id,
    title: args.title,
    status: out.status || args.fallback.status,
    summary: out.summary,
    findings: out.findings,
    facts: args.facts,
    tone: deriveTone(out.findings),
    source: parsed ? "ai" : "fallback"
  };
}

// --- 1. Odometer / mileage integrity --------------------------------------
export async function odometerAgent(apiKey: string, sharedContext: string, inputs: ReportInputs, debug?: boolean): Promise<ReportSection> {
  const o = inputs.odometer;
  const locale = inputs.locale;
  const facts = [
    { label: L(locale, "NAP-oordeel", "NAP verdict"), value: o.napVerdict ?? L(locale, "Onbekend", "Unknown") },
    { label: L(locale, "Ons km-oordeel", "Our km verdict"), value: o.mileageVerdict ?? L(locale, "Onbekend", "Unknown") },
    { label: L(locale, "Geschatte stand", "Estimated reading"), value: km(o.estimatedMileageNow) },
    { label: L(locale, "APK-metingen", "APK readings"), value: String(o.readings.length) }
  ];
  const rollback = o.napVerdict?.toLowerCase().includes("onlogisch") || o.mileageVerdict === "ONLOGISCH" || o.anomalies.some((a) => a.toLowerCase().includes("decreas") || a.toLowerCase().includes("rollback"));
  const fallback: AgentOutput = {
    status: rollback ? L(locale, "Onbetrouwbaar", "Untrustworthy") : o.mileageVerdict === "TWIJFELACHTIG" ? L(locale, "Twijfelachtig", "Doubtful") : L(locale, "Plausibel", "Plausible"),
    summary: rollback
      ? L(locale, "De tellerstand is door RDW of onze controle als onlogisch gemarkeerd. Er is een serieus risico op een teruggedraaide teller.", "The odometer is flagged illogical by RDW or our check. There is a serious rollback risk.")
      : L(locale, `Op basis van ${o.readings.length} APK-metingen en het NAP-oordeel lijkt de kilometerstand ${o.mileageVerdict === "TWIJFELACHTIG" ? "twijfelachtig" : "logisch"}.`, `Based on ${o.readings.length} APK readings and the NAP verdict, the mileage looks ${o.mileageVerdict === "TWIJFELACHTIG" ? "doubtful" : "consistent"}.`),
    findings: o.anomalies.slice(0, 3).map((a) => ({ label: L(locale, "Afwijking", "Anomaly"), detail: a, severity: rollback ? "high" : "medium" as Severity }))
  };
  const task = L(
    locale,
    `Beoordeel de TELLERSTAND-INTEGRITEIT van dit voertuig (terugdraai/fraude-risico). Gebruik het NAP-oordeel, ons km-oordeel, de geschatte stand en de APK-tellerstanden hierboven. Leg uit wat dit voor de koper betekent. Antwoord met exact dit JSON: ${SCHEMA_HINT}`,
    `Assess this vehicle's ODOMETER INTEGRITY (rollback/fraud risk). Use the NAP verdict, our km verdict, the estimate, and the APK readings above. Explain what it means for the buyer. Respond with exactly this JSON: ${SCHEMA_HINT}`
  );
  return buildSection({
    id: "odometer",
    title: L(locale, "Tellerstand-integriteit", "Odometer integrity"),
    persona: L(locale, "Je bent een RDW-data-analist gespecialiseerd in tellerstandfraude. Nuchter, concreet, geen aannames buiten de data.", "You are an RDW data analyst specialised in odometer fraud. Sober, concrete, no assumptions beyond the data."),
    task,
    facts,
    fallback,
    apiKey,
    sharedContext,
    debug
  });
}

// --- 2. Defects & APK forecast --------------------------------------------
export async function defectsAgent(apiKey: string, sharedContext: string, inputs: ReportInputs, debug?: boolean): Promise<ReportSection> {
  const d = inputs.defects;
  const locale = inputs.locale;
  const facts = [
    { label: L(locale, "Defectrecords", "Defect records"), value: String(d.total) },
    { label: L(locale, "Unieke gebreken", "Unique defects"), value: String(d.unique) },
    { label: L(locale, "APK geldig tot", "MOT valid until"), value: d.apkExpiry ? `${d.apkExpiry}${d.apkExpired ? L(locale, " (verlopen)", " (expired)") : ""}` : L(locale, "Onbekend", "Unknown") },
    { label: L(locale, "Slaagkans (model)", "Pass chance (model)"), value: d.apkPassChance != null ? `${d.apkPassChance}%` : "-" }
  ];
  const fallback: AgentOutput = {
    status: d.total === 0 ? L(locale, "Schoon dossier", "Clean record") : `${d.unique} ${L(locale, "aandachtspunten", "issues")}`,
    summary:
      d.total === 0
        ? L(locale, "Er zijn geen gebreken gemeld bij de APK-keuringen. Beoordeel de auto altijd ook fysiek.", "No defects were reported at the APK inspections. Always inspect the car physically too.")
        : L(locale, `Bij keuringen zijn ${d.total} defectrecords gemeld. Let vooral op terugkerende gebreken.`, `Inspections reported ${d.total} defect records. Watch especially for recurring defects.`),
    findings: d.top.map((t) => ({
      label: t.desc,
      detail: L(locale, `${t.count}x geconstateerd bij de APK. Controleer of dit is verholpen.`, `${t.count}x found at the APK. Check whether it was fixed.`),
      severity: (t.count > 1 ? "medium" : "low") as Severity
    }))
  };
  const task = L(
    locale,
    `Analyseer de SCHADE/GEBREKEN en geef een APK-PROGNOSE. Benoem terugkerende gebreken, geef een grove herstelkosten-indicatie waar logisch, en noem de waarschijnlijke afkeurpunten bij de volgende keuring. Antwoord met exact dit JSON: ${SCHEMA_HINT}`,
    `Analyse the DAMAGE/DEFECTS and give an MOT FORECAST. Call out recurring defects, give a rough repair-cost indication where sensible, and the likely failure points at the next inspection. Respond with exactly this JSON: ${SCHEMA_HINT}`
  );
  return buildSection({
    id: "defects",
    title: L(locale, "Schade & APK-prognose", "Damage & MOT forecast"),
    persona: L(locale, "Je bent een ervaren APK-keurmeester. Je vertaalt RDW-defectcodes naar praktische koperstaal en realistische kosten.", "You are an experienced MOT inspector. You translate RDW defect codes into practical buyer language and realistic costs."),
    task,
    facts,
    fallback,
    apiKey,
    sharedContext,
    debug
  });
}

// --- 3. Compliance: emission-zone + recalls -------------------------------
export async function complianceAgent(apiKey: string, sharedContext: string, inputs: ReportInputs, debug?: boolean): Promise<ReportSection> {
  const c = inputs.compliance;
  const locale = inputs.locale;
  const facts = [
    { label: L(locale, "Emissienorm", "Emission standard"), value: c.emissionStandard ?? L(locale, "Onbekend", "Unknown") },
    { label: L(locale, "Brandstof", "Fuel"), value: c.fuel ?? L(locale, "Onbekend", "Unknown") },
    { label: L(locale, "Leeftijd", "Age"), value: c.ageYears != null ? L(locale, `${c.ageYears} jaar`, `${c.ageYears} yrs`) : "-" },
    { label: L(locale, "Open recall", "Open recall"), value: c.hasOpenRecall ? L(locale, "Ja", "Yes") : L(locale, "Nee", "No") }
  ];
  const isDiesel = (c.fuel ?? "").toLowerCase().includes("diesel");
  const euroMatch = (c.emissionStandard ?? "").match(/(\d)/);
  const euroNum = euroMatch ? Number(euroMatch[1]) : null;
  const zoneRisk = isDiesel && euroNum != null && euroNum <= 4;
  const fallbackFindings: ReportFinding[] = [];
  if (zoneRisk) fallbackFindings.push({ label: L(locale, "Milieuzone-risico", "Emission-zone risk"), detail: L(locale, "Een oudere diesel kan in steeds meer Nederlandse milieuzones geweerd worden. Controleer de regels van jouw stad.", "An older diesel may be banned from a growing number of Dutch low-emission zones. Check your city's rules."), severity: "high" });
  if (c.hasOpenRecall) fallbackFindings.push({ label: L(locale, "Openstaande recall", "Open recall"), detail: L(locale, "Er staat een terugroepactie open. Laat dit kosteloos verhelpen bij een merkdealer voor aankoop.", "An open recall exists. Have it fixed free at a brand dealer before buying."), severity: "medium" });
  if (c.isImported) fallbackFindings.push({ label: L(locale, "Import", "Imported"), detail: L(locale, "Eerste toelating in het buitenland; controleer papieren en marktwaarde.", "First admitted abroad; verify papers and market value."), severity: "low" });
  const fallback: AgentOutput = {
    status: zoneRisk ? L(locale, "Zone-risico", "Zone risk") : c.hasOpenRecall ? L(locale, "Recall open", "Recall open") : L(locale, "In orde", "OK"),
    summary: zoneRisk
      ? L(locale, "Door de emissienorm en brandstof loopt dit voertuig risico op toegangsverboden in milieuzones.", "Given its emission standard and fuel, this vehicle risks low-emission-zone bans.")
      : L(locale, "Geen grote nalevingsproblemen gevonden op basis van emissienorm en recalls.", "No major compliance issues found based on emission standard and recalls."),
    findings: fallbackFindings
  };
  const task = L(
    locale,
    `Beoordeel NALEVING & TOEKOMSTBESTENDIGHEID: (1) milieuzone-risico op basis van emissienorm, brandstof en leeftijd (noem concreet of dit in NL-milieuzones geweerd kan worden), (2) de openstaande recalls (ernst en urgentie). Antwoord met exact dit JSON: ${SCHEMA_HINT}`,
    `Assess COMPLIANCE & FUTURE-PROOFING: (1) low-emission-zone risk based on emission standard, fuel and age (state concretely whether it may be banned in Dutch LEZ), (2) the open recalls (severity and urgency). Respond with exactly this JSON: ${SCHEMA_HINT}`
  );
  return buildSection({
    id: "compliance",
    title: L(locale, "Milieuzone & recalls", "Emission zone & recalls"),
    persona: L(locale, "Je bent een Nederlandse mobiliteits- en regelgevingsexpert (milieuzones, RDW-recalls).", "You are a Dutch mobility and regulation expert (low-emission zones, RDW recalls)."),
    task,
    facts,
    fallback,
    apiKey,
    sharedContext,
    debug
  });
}

// --- 4. Market value & total cost of ownership ----------------------------
export async function valueAgent(apiKey: string, sharedContext: string, inputs: ReportInputs, debug?: boolean): Promise<ReportSection> {
  const v = inputs.value;
  const locale = inputs.locale;
  const taxYear = v.roadTaxQuarter ? Math.round(((v.roadTaxQuarter.min + v.roadTaxQuarter.max) / 2) * 4) : null;
  const fuelYear = v.fuelEstMonth != null ? v.fuelEstMonth * 12 : null;
  const facts = [
    { label: L(locale, "Marktwaarde", "Market value"), value: eur(v.now) },
    { label: L(locale, "Bandbreedte", "Range"), value: v.min != null && v.max != null ? `${eur(v.min)} - ${eur(v.max)}` : "-" },
    { label: L(locale, "Wegenbelasting/jaar", "Road tax/yr"), value: eur(taxYear) },
    { label: L(locale, "Brandstof/jaar", "Fuel/yr"), value: eur(fuelYear) }
  ];
  const fallback: AgentOutput = {
    status: v.confidence ? L(locale, `Betrouwbaarheid ${v.confidence}`, `Confidence ${v.confidence}`) : L(locale, "Indicatie", "Indication"),
    summary: L(
      locale,
      `De geschatte marktwaarde is ${eur(v.now)} (range ${eur(v.min)} - ${eur(v.max)}). Reken naast de aankoop op wegenbelasting en brandstof als jaarlijkse kosten.`,
      `The estimated market value is ${eur(v.now)} (range ${eur(v.min)} - ${eur(v.max)}). Besides the purchase, budget road tax and fuel as annual costs.`
    ),
    findings: [
      ...(taxYear != null || fuelYear != null
        ? [{ label: L(locale, "Jaarlijkse kosten", "Annual running cost"), detail: L(locale, `Wegenbelasting ~${eur(taxYear)} en brandstof ~${eur(fuelYear)} per jaar (indicatie).`, `Road tax ~${eur(taxYear)} and fuel ~${eur(fuelYear)} per year (indication).`), severity: "info" as Severity }]
        : [])
    ]
  };
  const task = L(
    locale,
    `Geef WAARDE & KOSTEN-advies: leg de geschatte marktwaarde en bandbreedte uit, geef prijsadvies (wanneer is een vraagprijs redelijk/te duur), en schat de totale eigendomskosten per jaar (wegenbelasting + brandstof + grove onderhoudsreserve). Antwoord met exact dit JSON: ${SCHEMA_HINT}`,
    `Give VALUE & COST guidance: explain the estimated market value and range, give pricing advice (when is an asking price fair/overpriced), and estimate the total cost of ownership per year (road tax + fuel + rough maintenance reserve). Respond with exactly this JSON: ${SCHEMA_HINT}`
  );
  return buildSection({
    id: "value",
    title: L(locale, "Marktwaarde & kosten", "Market value & cost"),
    persona: L(locale, "Je bent een nuchtere auto-inkoopadviseur die marktwaarde en maandlasten begrijpelijk maakt.", "You are a sober used-car buying advisor who makes value and running costs understandable."),
    task,
    facts,
    fallback,
    apiKey,
    sharedContext,
    debug
  });
}
