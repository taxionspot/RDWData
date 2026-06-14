/**
 * Pure score computation for the Kentekenrapport Score (0-100).
 * Extracted from VehicleResultScreen.tsx so it can be reused in the PDF
 * (server-side, no React). No PDF-lib, no Next.js, no React imports.
 */

export type ScoreTone = "strong" | "steady" | "mixed" | "caution";

export type ScoreResult = {
  score: number;
  tone: ScoreTone;
  label: string;
  description: string;
  confidence: string;
  riskFlag: string;
  breakdown: Array<{ label: string; points: number }>;
};

export type BuildScoreArgs = {
  defects: number;
  riskScore: number;
  apkPassChance: number | null;
  wok: boolean;
  imported: boolean;
  napOnlogisch: boolean;
  openRecall: boolean;
  locale: "nl" | "en";
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getScoreTone(score: number): ScoreTone {
  if (score >= 80) return "strong";
  if (score >= 65) return "steady";
  if (score >= 50) return "mixed";
  return "caution";
}

/**
 * Compute the Kentekenrapport Score (0-100) from vehicle signals.
 * Pure function: no side-effects, no React, safe to call in PDF generation.
 */
export function buildScoreResult(args: BuildScoreArgs): ScoreResult {
  const nl = args.locale === "nl";
  const breakdown: Array<{ label: string; points: number }> = [];
  const base = 82;
  breakdown.push({ label: nl ? "Basisscore" : "Base score", points: base });

  // Defects are counted here directly; the maintenance risk factor below only
  // carries age/weight signals, so defects are not penalised twice.
  const defectPenalty = Math.min(args.defects * 2.5, 20);
  if (defectPenalty > 0) {
    breakdown.push({
      label: nl ? `${args.defects} geconstateerde gebreken` : `${args.defects} recorded defects`,
      points: -Math.round(defectPenalty)
    });
  }

  const maintenancePenalty = Math.min(Math.max(args.riskScore - 4, 0) * 1.5, 9);
  if (maintenancePenalty > 0) {
    breakdown.push({
      label: nl ? "Onderhoudsrisico (leeftijd/gewicht)" : "Maintenance risk (age/weight)",
      points: -Math.round(maintenancePenalty)
    });
  }

  const napPenalty = args.napOnlogisch ? 20 : 0;
  if (napPenalty > 0) {
    breakdown.push({ label: nl ? "NAP-oordeel onlogisch" : "NAP verdict implausible", points: -napPenalty });
  }

  const importPenalty = args.imported ? 6 : 0;
  if (importPenalty > 0) {
    breakdown.push({ label: nl ? "Importvoertuig" : "Imported vehicle", points: -importPenalty });
  }

  const recallPenalty = args.openRecall ? 5 : 0;
  if (recallPenalty > 0) {
    breakdown.push({ label: nl ? "Open terugroepactie" : "Open recall", points: -recallPenalty });
  }

  const apkBonus = args.apkPassChance != null ? Math.round(clamp((args.apkPassChance - 70) / 4, -5, 7)) : 0;
  if (apkBonus !== 0) {
    breakdown.push({ label: nl ? "APK-slaagkans" : "APK pass chance", points: apkBonus });
  }

  let score = clamp(
    Math.round(base - defectPenalty - maintenancePenalty - napPenalty - importPenalty - recallPenalty + apkBonus),
    20,
    95
  );

  // A WOK registration (awaiting inspection after serious damage) is a hard
  // cap: this vehicle cannot score as a safe buy.
  if (args.wok) {
    score = Math.min(score, 35);
    breakdown.push({
      label: nl ? "WOK-registratie (maximum 35)" : "WOK registration (capped at 35)",
      points: 0
    });
  }

  const tone = getScoreTone(score);

  const labelByTone: Record<ScoreTone, string> = {
    strong: nl ? "Sterk resultaat" : "Strong result",
    steady: nl ? "Stabiel profiel" : "Steady profile",
    mixed: nl ? "Gemengde signalen" : "Mixed signals",
    caution: nl ? "Controle nodig" : "Needs review"
  };

  const descriptionByTone: Record<ScoreTone, string> = {
    strong: nl
      ? "Positief profiel met sterke signalen in de officiele datasets."
      : "Positive profile with strong signals in the official datasets.",
    steady: nl
      ? "De meeste signalen zijn stabiel, met enkele kleine aandachtspunten."
      : "Most signals look solid with only minor items to double-check.",
    mixed: nl
      ? "Meerdere signalen vragen extra controle voor je beslist."
      : "Several signals need closer attention before making a decision.",
    caution: nl
      ? "Belangrijke signalen vereisen opvolging voordat je doorgaat."
      : "Key signals require follow-up before moving forward."
  };

  const confidence =
    tone === "strong" || tone === "steady"
      ? nl ? "Hoog" : "High"
      : tone === "mixed"
      ? nl ? "Middel" : "Medium"
      : nl ? "Laag" : "Low";

  const riskFlag =
    args.wok || args.napOnlogisch || args.defects > 4 ? (nl ? "Verhoogd" : "Elevated") : nl ? "Laag" : "Low";

  return {
    score,
    tone,
    label: labelByTone[tone],
    description: descriptionByTone[tone],
    confidence,
    riskFlag,
    breakdown
  };
}
