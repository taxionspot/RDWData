import { NextResponse } from "next/server";
import { getVehicleProfile } from "@/lib/rdw/service";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import { buildFallbackVehicleAiReport } from "@/lib/api/claude";
import { getOrGenerateVehicleAiReport } from "@/lib/api/ai-report-cache";
import { generateVehicleReportPdf } from "@/lib/api/pdf-report";
import { SAMPLE_PLATE } from "@/lib/content/sample";
import { errorResponse } from "@/lib/api/errors";
import type { Locale } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

// Public "voorbeeldrapport" PDF. It deliberately skips the paywall so prospects
// can see the full product before buying, and is therefore HARD-LOCKED to the
// configured SAMPLE_PLATE only — it can never be used to fetch a real report for
// an arbitrary plate.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locale: Locale = url.searchParams.get("lang") === "en" ? "en" : "nl";
    const plate = SAMPLE_PLATE;

    const profile = await getVehicleProfile(plate);
    const localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;

    let aiInsights;
    let aiValuation;
    let aiSource: "ai" | "fallback" = "ai";
    try {
      const aiReport = await getOrGenerateVehicleAiReport({
        plate,
        locale,
        mileage: null,
        vehicleData: localized
      });
      aiInsights = aiReport.insights;
      aiValuation = aiReport.valuation;
    } catch {
      const fallback = buildFallbackVehicleAiReport({ locale, vehicleData: localized });
      aiInsights = fallback.insights;
      aiValuation = fallback.valuation;
      aiSource = "fallback";
    }

    // Keep the headline value consistent with the live report: fall back to the
    // AI valuation only when the data model has no value.
    const enriched = (localized.enriched ?? {}) as Record<string, unknown>;
    if (enriched.estimatedValueNow == null && aiValuation) {
      localized.enriched = {
        ...enriched,
        estimatedValueNow: aiValuation.estimatedValueNow,
        estimatedValueMin: aiValuation.estimatedValueMin,
        estimatedValueMax: aiValuation.estimatedValueMax,
        marketValueConfidence: enriched.marketValueConfidence ?? aiValuation.confidence,
        marketValueSource: "ai"
      };
    }

    const pdf = await generateVehicleReportPdf({
      plate,
      locale,
      generatedAt: new Date(),
      data: localized,
      aiInsights,
      aiValuation,
      aiSource
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="voorbeeld-kentekenrapport-${plate}.pdf"`,
        // Cacheable: the sample is the same for everyone.
        "cache-control": "public, max-age=3600, s-maxage=86400"
      }
    });
  } catch (error) {
    return errorResponse(error, "Unable to generate sample report.");
  }
}
