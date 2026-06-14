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
import { connectMongo } from "@/lib/db/mongodb";
import { generateVehicleReportPdf } from "@/lib/api/pdf-report";
import { alignValuationWithFormula, applyMileageValuationOverride } from "@/lib/api/market-value";
import { sanitizeDeep } from "@/lib/api/sanitize-text";
import { computeVehicleSignals } from "@/lib/vehicle/signals";

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

const AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function aiCacheKey(plate: string, locale: Locale): string {
  // No mileage bucket here: thank-you emails use the formula estimate only.
  return `v3|${plate}|${locale}|`;
}

async function readAiCache(key: string): Promise<{ insights: unknown; valuation: unknown } | null> {
  try {
    await connectMongo();
    const { AiReportCacheModel } = await import("@/models/AiReportCache");
    const doc = await AiReportCacheModel.findById(key).lean();
    if (doc && doc.expiresAt && new Date(doc.expiresAt).getTime() > Date.now() && doc.insights) {
      return { insights: doc.insights, valuation: doc.valuation };
    }
  } catch {
    // cache unavailable: fall through to live generation
  }
  return null;
}

async function writeAiCache(key: string, insights: unknown, valuation: unknown): Promise<void> {
  try {
    await connectMongo();
    const { AiReportCacheModel } = await import("@/models/AiReportCache");
    await AiReportCacheModel.findByIdAndUpdate(
      key,
      { _id: key, insights, valuation, createdAt: new Date(), expiresAt: new Date(Date.now() + AI_CACHE_TTL_MS) },
      { upsert: true }
    );
  } catch {
    // best effort
  }
}

/**
 * Build localized vehicle data + AI insights (with cache), mirroring the
 * vehicle API's buildLocalizedWithAi but without user-mileage input.
 */
async function buildReportData(plate: string, locale: Locale) {
  const profile = await getVehicleProfile(plate);
  let localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
  localized = applyMileageValuationOverride(localized, null);

  const cacheKey = aiCacheKey(plate, locale);
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
