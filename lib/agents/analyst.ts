import { stripBannedDashes } from "@/lib/utils/text";
import { runAgent } from "./runner";
import type { AnalystResult, AnalystVerdict, ReportInputs, ReportSection, RiskLevel } from "./types";

function rec(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
}
function str(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x.trim() : null;
}
function strList(x: unknown, max: number): string[] {
  return (Array.isArray(x) ? x : []).map(str).filter((s): s is string => Boolean(s)).map(stripBannedDashes).slice(0, max);
}
function clamp(n: number, lo: number, hi: number) {
  return Math.min(Math.max(n, lo), hi);
}
function L(locale: "nl" | "en", nl: string, en: string) {
  return locale === "nl" ? nl : en;
}

/** Deterministic score + verdict used both as a grounding hint and a fallback. */
function deterministic(inputs: ReportInputs): { score: number; verdict: AnalystVerdict; riskLevel: RiskLevel } {
  const o = inputs.odometer;
  const rollback = (o.napVerdict ?? "").toLowerCase().includes("onlogisch") || o.mileageVerdict === "ONLOGISCH";
  let score = 82;
  score -= Math.min(inputs.defects.unique * 3, 18);
  if (rollback) score -= 25;
  else if (o.mileageVerdict === "TWIJFELACHTIG") score -= 8;
  if (inputs.compliance.hasOpenRecall) score -= 6;
  if (inputs.defects.apkExpired) score -= 5;
  const isDiesel = (inputs.compliance.fuel ?? "").toLowerCase().includes("diesel");
  const euro = (inputs.compliance.emissionStandard ?? "").match(/(\d)/);
  if (isDiesel && euro && Number(euro[1]) <= 4) score -= 8;
  if (inputs.compliance.isImported) score -= 4;
  if ((inputs.value.owners ?? 0) > 4) score -= 4;
  score = Math.round(clamp(score, 25, 92));
  const verdict: AnalystVerdict = score >= 78 ? "BUY" : score >= 62 ? "CONSIDER" : score >= 45 ? "CAUTION" : "AVOID";
  const riskLevel: RiskLevel = rollback || score < 45 ? "HIGH" : score < 62 ? "MEDIUM" : "LOW";
  return { score, verdict, riskLevel };
}

function fallbackAnalyst(inputs: ReportInputs, sections: ReportSection[]): AnalystResult {
  const locale = inputs.locale;
  const base = deterministic(inputs);
  const risks = sections
    .flatMap((s) => s.findings.filter((f) => f.severity === "high" || f.severity === "medium").map((f) => `${f.label}: ${f.detail}`))
    .slice(0, 6);
  const positives: string[] = [];
  if (inputs.defects.total === 0) positives.push(L(locale, "Geen gebreken gemeld bij de APK.", "No defects reported at the APK."));
  if ((inputs.odometer.mileageVerdict ?? "").toLowerCase().includes("logisch") && inputs.odometer.mileageVerdict !== "ONLOGISCH") positives.push(L(locale, "Kilometerstand lijkt logisch.", "Mileage looks consistent."));
  if (!inputs.compliance.hasOpenRecall) positives.push(L(locale, "Geen openstaande terugroepacties.", "No open recalls."));
  if (!inputs.defects.apkExpired && inputs.defects.apkExpiry) positives.push(L(locale, "APK is nog geldig.", "MOT is still valid."));
  const verdictWord = base.verdict === "BUY" ? L(locale, "kopen", "buy") : base.verdict === "CONSIDER" ? L(locale, "overwegen", "consider") : base.verdict === "CAUTION" ? L(locale, "voorzichtig zijn", "be cautious") : L(locale, "afraden", "avoid");
  return {
    score: base.score,
    verdict: base.verdict,
    riskLevel: base.riskLevel,
    headline: L(locale, `Advies: ${verdictWord} (score ${base.score}/100)`, `Advice: ${verdictWord} (score ${base.score}/100)`),
    summary: L(
      locale,
      `Op basis van de RDW-data komt dit voertuig uit op ${base.score}/100. ${risks.length ? "Let op de genoemde aandachtspunten" : "Er zijn geen grote rode vlaggen"}, en combineer dit rapport altijd met een fysieke inspectie.`,
      `Based on the RDW data this vehicle scores ${base.score}/100. ${risks.length ? "Mind the noted attention points" : "There are no major red flags"}, and always combine this report with a physical inspection.`
    ),
    positives: positives.slice(0, 5),
    risks,
    recommendation:
      base.verdict === "BUY"
        ? L(locale, "Degelijk profiel. Onderhandel op basis van eventuele gebreken en doe een korte proefrit.", "Solid profile. Negotiate on any defects and take a short test drive.")
        : base.verdict === "AVOID"
        ? L(locale, "Er zijn serieuze risico's. Koop niet zonder onafhankelijke aankoopkeuring.", "There are serious risks. Do not buy without an independent inspection.")
        : L(locale, "Vraag onderhoudsfacturen op en laat een aankoopkeuring doen voor je beslist.", "Ask for service invoices and get a pre-purchase inspection before deciding."),
    source: "fallback"
  };
}

export async function analystAgent(apiKey: string, sharedContext: string, inputs: ReportInputs, sections: ReportSection[], debug?: boolean): Promise<AnalystResult> {
  const locale = inputs.locale;
  const hint = deterministic(inputs);
  const specialistDigest = sections
    .map((s) => `[${s.title}] status: ${s.status} | ${s.summary}${s.findings.length ? ` | bevindingen: ${s.findings.map((f) => `${f.label} (${f.severity})`).join("; ")}` : ""}`)
    .join("\n");

  const schema = `{ "score": 0-100 geheel getal, "verdict": "BUY|CONSIDER|CAUTION|AVOID", "riskLevel": "LOW|MEDIUM|HIGH", "headline": "1 zin", "summary": "100-180 woorden, menselijk", "positives": ["..."], "risks": ["..."], "recommendation": "expliciet advies" }`;
  const task = L(
    locale,
    `Je bent de HOOFDANALIST. Vat de specialist-bevindingen samen tot EEN eindoordeel voor de koper. Onze deterministische richtscore is ${hint.score}/100 (verdict ${hint.verdict}); gebruik die als ankerpunt en wijk alleen gemotiveerd af. Wees eerlijk en concreet.\n\nSPECIALIST-BEVINDINGEN:\n${specialistDigest}\n\nAntwoord met exact dit JSON: ${schema}`,
    `You are the LEAD ANALYST. Synthesise the specialist findings into ONE final verdict for the buyer. Our deterministic anchor score is ${hint.score}/100 (verdict ${hint.verdict}); use it as an anchor and only deviate with reason. Be honest and concrete.\n\nSPECIALIST FINDINGS:\n${specialistDigest}\n\nRespond with exactly this JSON: ${schema}`
  );

  const raw = await runAgent({
    apiKey,
    tier: "opus",
    persona: L(
      locale,
      "Je bent een ervaren, onafhankelijke Nederlandse auto-aankoopadviseur. Je verzint nooit gegevens en schrijft warm en helder voor een leek. Geen lange streepjes.",
      "You are an experienced, independent Dutch car-buying advisor. You never invent data and write warmly and clearly for a layperson. No long dashes."
    ),
    sharedContext,
    task,
    maxTokens: 1400,
    debug
  });

  const r = rec(raw);
  const summary = str(r.summary);
  if (!summary) return fallbackAnalyst(inputs, sections);

  const verdict: AnalystVerdict = ["BUY", "CONSIDER", "CAUTION", "AVOID"].includes(String(r.verdict)) ? (r.verdict as AnalystVerdict) : hint.verdict;
  const riskLevel: RiskLevel = ["LOW", "MEDIUM", "HIGH"].includes(String(r.riskLevel)) ? (r.riskLevel as RiskLevel) : hint.riskLevel;
  const scoreNum = Number(r.score);
  const score = Number.isFinite(scoreNum) ? Math.round(clamp(scoreNum, 0, 100)) : hint.score;

  return {
    score,
    verdict,
    riskLevel,
    headline: stripBannedDashes(str(r.headline) ?? fallbackAnalyst(inputs, sections).headline),
    summary: stripBannedDashes(summary),
    positives: strList(r.positives, 6),
    risks: strList(r.risks, 6),
    recommendation: stripBannedDashes(str(r.recommendation) ?? ""),
    source: "ai"
  };
}
