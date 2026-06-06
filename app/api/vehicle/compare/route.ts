import { NextResponse } from "next/server";
import { getVehicleProfile } from "@/lib/rdw/service";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { generateVehicleComparisonAi } from "@/lib/api/claude-comparison";
import { generateVehicleComparisonPdf } from "@/lib/api/pdf-comparison-report";
import { hasPaidAccessForAnyPlate } from "@/lib/payments/server-access";
import { applyMileageValuationOverride } from "@/lib/api/market-value";

export const runtime = "nodejs";

function parseLocale(input: string | null): Locale {
  return input === "en" ? "en" : "nl";
}

function parseMileage(input: string | null): number | null {
  if (!input) return null;
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function withMileageContext(localized: Record<string, unknown>, userMileage: number | null) {
  if (userMileage === null) return localized;
  const adjusted = applyMileageValuationOverride(localized, userMileage);
  const enriched = ((adjusted.enriched ?? {}) as Record<string, unknown>);
  return {
    ...adjusted,
    enriched: {
      ...enriched,
      userMileageInput: userMileage,
      userMileageDelta:
        Number.isFinite(Number(enriched.estimatedMileageNow)) ? Math.round(userMileage - Number(enriched.estimatedMileageNow)) : null
    }
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const basePlate = parsePlateOrThrow(url.searchParams.get("base") ?? "");
    const comparePlate = parsePlateOrThrow(url.searchParams.get("compare") ?? "");
    const locale = parseLocale(url.searchParams.get("lang"));
    const includeAi = url.searchParams.get("include_ai") === "1";
    const download = url.searchParams.get("download") === "1";

    if (basePlate === comparePlate) {
      return NextResponse.json({ error: "Comparison vehicle must be different." }, { status: 400 });
    }

    const baseMileage = parseMileage(url.searchParams.get("mileage"));
    const compareMileage = parseMileage(url.searchParams.get("compareMileage"));

    const [baseProfile, compareProfile] = await Promise.all([
      getVehicleProfile(basePlate),
      getVehicleProfile(comparePlate)
    ]);

    const baseLocalized = withMileageContext(localizeVehicleProfile(baseProfile, locale) as Record<string, unknown>, baseMileage);
    const compareLocalized = withMileageContext(localizeVehicleProfile(compareProfile, locale) as Record<string, unknown>, compareMileage);

    const ai = includeAi || download
      ? await generateVehicleComparisonAi({
          locale,
          basePlate,
          comparePlate,
          base: baseLocalized,
          compare: compareLocalized
        })
      : null;

    if (download) {
      const access = await hasPaidAccessForAnyPlate([basePlate, comparePlate]);
      if (!access) {
        return NextResponse.json({ error: "Payment required for report download.", code: "PAYMENT_REQUIRED" }, { status: 402 });
      }
      const pdf = await generateVehicleComparisonPdf({
        locale,
        generatedAt: new Date(),
        basePlate,
        comparePlate,
        baseData: baseLocalized,
        compareData: compareLocalized,
        ai: ai ?? {
          verdict: "TIE",
          summary: locale === "nl" ? "AI vergelijking niet beschikbaar." : "AI comparison unavailable.",
          basePros: [],
          comparePros: [],
          keyRisks: [],
          recommendation: locale === "nl" ? "Controleer beide voertuigen handmatig." : "Manually verify both vehicles."
        }
      });
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="vehicle-comparison-${basePlate}-${comparePlate}.pdf"`
        }
      });
    }

    return NextResponse.json({
      base: baseLocalized,
      compare: compareLocalized,
      ai
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Comparison lookup failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
