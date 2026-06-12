export type NegotiationPricingInput = {
  marketNow: number;
  marketMin: number;
  marketMax: number;
  riskScore: number;
  defects: number;
  recalls: number;
  mileagePlausible: boolean | null;
};

export type NegotiationPricing = {
  offerMin: number;
  offerMax: number;
  walkAway: number;
  reserveMin: number;
  reserveMax: number;
};

export function roundTo50(value: number): number {
  return Math.round(value / 50) * 50;
}

/**
 * Deterministic negotiation pricing, identical to the formulas used in
 * components/vehicle/NegotiationCopilotScreen.tsx. Keep both in sync.
 */
export function computeNegotiationPricing(input: NegotiationPricingInput): NegotiationPricing {
  const { marketNow, marketMin, marketMax, riskScore, defects, recalls, mileagePlausible } = input;

  const riskPenalty =
    defects * 0.015 + recalls * 0.02 + Math.max(0, riskScore - 5) * 0.02 + (mileagePlausible === false ? 0.03 : 0);

  const offerMin = roundTo50(Math.max(500, marketMin * (1 - riskPenalty)));
  const offerMax = roundTo50(Math.max(offerMin + 150, marketNow * (1 - riskPenalty * 0.35)));
  const walkAway = roundTo50(Math.max(offerMax + 200, marketMax * (1 + riskPenalty * 0.15)));
  const reserveMin = roundTo50(Math.max(400, marketNow * 0.04 + defects * 150 + recalls * 250));
  const reserveMax = roundTo50(Math.max(reserveMin + 150, marketNow * 0.08 + defects * 260 + recalls * 450));

  return { offerMin, offerMax, walkAway, reserveMin, reserveMax };
}

export type AiRiskLevel = "LOW" | "MEDIUM" | "HIGH";

/**
 * Pricing context derived from the AI valuation and risk level, identical to
 * the previous inline logic of the negotiation-copilot API route.
 */
export function computeNegotiationPricingFromAiRisk(input: {
  estimatedValueNow: number;
  estimatedValueMin: number;
  estimatedValueMax: number;
  riskLevel: AiRiskLevel;
}): NegotiationPricing {
  const { estimatedValueNow: now, estimatedValueMin: min, estimatedValueMax: max, riskLevel } = input;
  const riskBase = riskLevel === "HIGH" ? 0.16 : riskLevel === "MEDIUM" ? 0.1 : 0.06;
  return {
    offerMin: roundTo50(Math.max(500, min * (1 - riskBase))),
    offerMax: roundTo50(Math.max(650, now * (1 - riskBase * 0.35))),
    walkAway: roundTo50(Math.max(700, max * (1 + riskBase * 0.2))),
    reserveMin: roundTo50(Math.max(350, now * 0.045 + riskBase * 1200)),
    reserveMax: roundTo50(Math.max(500, now * 0.09 + riskBase * 2000))
  };
}
