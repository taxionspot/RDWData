import { NextResponse } from "next/server";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { errorResponse } from "@/lib/api/errors";
import { getVehicleProfile } from "@/lib/rdw/service";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { buildFallbackNegotiationCopilotAdvice, generateNegotiationCopilotAdvice, generateVehicleAiReport } from "@/lib/api/claude";
import { computeNegotiationPricingFromAiRisk } from "@/lib/api/negotiation-pricing";
import { applyMileageValuationOverride } from "@/lib/api/market-value";
import { hasPaidPlateAccess } from "@/lib/payments/server-access";

type Params = { params: { plate: string } };

function parseLocale(input: string | null): Locale {
  return input === "en" ? "en" : "nl";
}

function parseMileage(input: unknown): number | null {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

type Body = {
  lang?: "nl" | "en";
  mileage?: number | null;
  context?: {
    offerMin?: number;
    offerMax?: number;
    walkAway?: number;
    reserveMin?: number;
    reserveMax?: number;
  };
};

export async function POST(request: Request, { params }: Params) {
  try {
    const plate = parsePlateOrThrow(params.plate);

    // The negotiation coach only runs after unlock; enforce that server-side
    // so the endpoint cannot be used to get premium AI output for free.
    const hasAccess = await hasPaidPlateAccess(plate);
    if (!hasAccess) {
      return NextResponse.json({ error: "Payment required.", code: "PAYMENT_REQUIRED" }, { status: 402 });
    }

    const body = (await request.json()) as Body;
    const locale = parseLocale(body.lang ?? null);
    const profile = await getVehicleProfile(plate);
    let localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
    const mileageInput = parseMileage(body.mileage);
    // Let the entered mileage flow through our own valuation formula, so the
    // pricing advice uses the same market value as the rest of the report.
    localized = applyMileageValuationOverride(localized, mileageInput);
    if (mileageInput !== null) {
      const enriched = (localized.enriched ?? {}) as Record<string, unknown>;
      localized.enriched = {
        ...enriched,
        userMileageInput: mileageInput
      };
    }

    const fallbackContext = {
      offerMin: Math.max(500, Math.round(Number(body.context?.offerMin ?? 0))),
      offerMax: Math.max(650, Math.round(Number(body.context?.offerMax ?? 0))),
      walkAway: Math.max(700, Math.round(Number(body.context?.walkAway ?? 0))),
      reserveMin: Math.max(300, Math.round(Number(body.context?.reserveMin ?? 0))),
      reserveMax: Math.max(500, Math.round(Number(body.context?.reserveMax ?? 0)))
    };

    // Our own formula value is the pricing basis even when the AI call
    // fails; the client-provided fallback amounts are the last resort.
    let context = fallbackContext;
    const enrichedForPricing = (localized.enriched ?? {}) as Record<string, unknown>;
    const formulaNow = Number(enrichedForPricing.estimatedValueNow);
    if (Number.isFinite(formulaNow) && formulaNow > 0) {
      const formulaMin = Number(enrichedForPricing.estimatedValueMin);
      const formulaMax = Number(enrichedForPricing.estimatedValueMax);
      context = computeNegotiationPricingFromAiRisk({
        estimatedValueNow: Math.round(formulaNow),
        estimatedValueMin: Number.isFinite(formulaMin) && formulaMin > 0 ? Math.round(formulaMin) : Math.round(formulaNow * 0.9),
        estimatedValueMax: Number.isFinite(formulaMax) && formulaMax > 0 ? Math.round(formulaMax) : Math.round(formulaNow * 1.1),
        riskLevel: "MEDIUM"
      });
    }
    try {
      const aiReport = await generateVehicleAiReport({
        plate,
        locale,
        vehicleData: {
          ...localized,
          userContext: mileageInput !== null ? { mileageInput } : undefined
        }
      });
      // generateVehicleAiReport already forces the formula amounts into the
      // valuation; the AI contributes the risk level and the explanation.
      context = computeNegotiationPricingFromAiRisk({
        estimatedValueNow: aiReport.valuation.estimatedValueNow,
        estimatedValueMin: aiReport.valuation.estimatedValueMin,
        estimatedValueMax: aiReport.valuation.estimatedValueMax,
        riskLevel: aiReport.insights.riskLevel
      });
      localized.aiValuation = aiReport.valuation;
      localized.aiInsights = aiReport.insights;
    } catch {
      // keep the formula-based context computed above
    }

    try {
      const ai = await generateNegotiationCopilotAdvice({
        plate,
        locale,
        vehicleData: localized,
        context
      });
      return NextResponse.json({ ai, pricing: context, source: "claude" as const });
    } catch {
      const fallback = buildFallbackNegotiationCopilotAdvice({ locale, context });
      return NextResponse.json({ ai: fallback, pricing: context, source: "fallback" as const });
    }
  } catch (error) {
    return errorResponse(error, "Unable to generate negotiation copilot.");
  }
}
