/**
 * Shared report builder for post-payment thank-you emails.
 *
 * Wraps the same data pipeline used by the vehicle API:
 *   buildLocalizedWithAi -> generateVehicleReportPdf
 *
 * The PDF build is capped at ~8s so a slow Apify/Claude call NEVER blocks the
 * PayPal capture response. On any failure the caller falls back to the
 * link-only thank-you mail that was already sent before this runs.
 */

import { getVehicleProfile } from "@/lib/rdw/service";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { buildFallbackVehicleAiReport, generateVehicleAiReport } from "@/lib/api/claude";
import { generateVehicleReportPdf } from "@/lib/api/pdf-report";
import { alignValuationWithFormula, applyMileageValuationOverride } from "@/lib/api/market-value";
import { sanitizeDeep } from "@/lib/api/sanitize-text";
import { computeVehicleSignals } from "@/lib/vehicle/signals";
import { aiCacheKey, readAiCache, writeAiCache } from "@/lib/api/ai-cache";

/** Resolves to null after `ms` milliseconds, regardless of what `promise` does. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); }
    );
  });
}

/**
 * Build localized vehicle data + AI insights (with cache), mirroring the
 * vehicle API's buildLocalizedWithAi but without user-mileage input.
 */
async function buildReportData(plate: string, locale: Locale) {
  const profile = await getVehicleProfile(plate);
  let localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
  localized = applyMileageValuationOverride(localized, null);

  // No user mileage here: thank-you emails use the formula estimate (empty bucket).
  const cacheKey = aiCacheKey(plate, locale, "");
  const cached = await readAiCache(cacheKey);
  if (cached) {
    return {
      profile,
      localized,
      aiInsights: sanitizeDeep(cached.insights as ReturnType<typeof buildFallbackVehicleAiReport>["insights"]),
      aiValuation: sanitizeDeep(
        alignValuationWithFormula(
          localized,
          cached.valuation as ReturnType<typeof buildFallbackVehicleAiReport>["valuation"]
        )
      )
    };
  }

  try {
    const aiReport = await generateVehicleAiReport({ plate, locale, vehicleData: localized });
    await writeAiCache(cacheKey, aiReport.insights, aiReport.valuation);
    return { profile, localized, aiInsights: aiReport.insights, aiValuation: aiReport.valuation };
  } catch {
    const fallback = buildFallbackVehicleAiReport({ locale, vehicleData: localized });
    return { profile, localized, aiInsights: fallback.insights, aiValuation: fallback.valuation };
  }
}

/**
 * Build a PDF attachment for the thank-you email.
 * Returns a base64 string or null if the build times out or fails.
 * Timeout budget: 8 seconds (same as the vehicle API PDF enrichment cap).
 */
export async function buildReportPdfForEmail(
  plate: string,
  locale: Locale
): Promise<string | null> {
  return withTimeout(
    (async () => {
      try {
        const { profile, localized, aiInsights, aiValuation } = await buildReportData(plate, locale);
        const signals = computeVehicleSignals({ profile, nowMs: Date.now(), hasAccess: true });
        const pdf = await generateVehicleReportPdf({
          plate,
          locale,
          generatedAt: new Date(),
          data: localized,
          aiInsights,
          aiValuation,
          signals,
          comparables: null,
          modelStats: null,
          score: null
        });
        return pdf.toString("base64");
      } catch {
        return null;
      }
    })(),
    8000
  );
}
