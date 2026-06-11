import { NextResponse } from "next/server";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { errorResponse } from "@/lib/api/errors";
import { getVehicleProfile } from "@/lib/rdw/service";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { buildFallbackNegotiationCopilotAdvice, generateNegotiationCopilotAdvice, generateVehicleAiReport } from "@/lib/api/claude";
import { computeNegotiationPricingFromAiRisk } from "@/lib/api/negotiation-pricing";

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
    const body = (await request.json()) as Body;
    const locale = parseLocale(body.lang ?? null);
    const profile = await getVehicleProfile(plate);
    const localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
    const mileageInput = parseMileage(body.mileage);
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

    let context = fallbackContext;
    try {
      const aiReport = await generateVehicleAiReport({
        plate,
        locale,
        vehicleData: {
          ...localized,
          userContext: mileageInput !== null ? { mileageInput } : undefined
        }
      });
      context = computeNegotiationPricingFromAiRisk({
        estimatedValueNow: aiReport.valuation.estimatedValueNow,
        estimatedValueMin: aiReport.valuation.estimatedValueMin,
        estimatedValueMax: aiReport.valuation.estimatedValueMax,
        riskLevel: aiReport.insights.riskLevel
      });
      localized.aiValuation = aiReport.valuation;
      localized.aiInsights = aiReport.insights;
    } catch {
      context = fallbackContext;
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
