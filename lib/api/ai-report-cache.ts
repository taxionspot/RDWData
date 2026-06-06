import { connectMongo } from "@/lib/db/mongodb";
import { AiReportCacheModel } from "@/models/AiReportCache";
import { generateVehicleAiReport, type ClaudeVehicleReportResult } from "@/lib/api/claude";

const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Bump when the prompt or post-processing changes so stale reports are ignored.
const CACHE_VERSION = "v1";

function cacheKey(plate: string, locale: "nl" | "en", mileage: number | null): string {
  return `${plate}:${locale}:${mileage ?? "na"}:${CACHE_VERSION}`;
}

/**
 * Returns a cached AI report when one is available and fresh, otherwise calls
 * Claude once and stores the result.
 *
 * Previously the report screen triggered an AI call on mount AND the PDF/email
 * download triggered another (each with a retry), so a single report could cost
 * up to ~6 Claude requests. Caching collapses that to one per
 * plate+locale+mileage for the cache lifetime.
 *
 * Only successful generations are cached — the caller is responsible for the
 * heuristic fallback, so a transient Claude failure is never persisted.
 */
export async function getOrGenerateVehicleAiReport(args: {
  plate: string;
  locale: "nl" | "en";
  mileage: number | null;
  vehicleData: unknown;
}): Promise<ClaudeVehicleReportResult> {
  const key = cacheKey(args.plate, args.locale, args.mileage);

  try {
    await connectMongo();
    const cached = await AiReportCacheModel.findById(key).lean<{ report?: ClaudeVehicleReportResult; expiresAt?: Date } | null>();
    if (cached?.report && cached.expiresAt && cached.expiresAt.getTime() > Date.now()) {
      return cached.report;
    }
  } catch {
    // Cache unavailable — fall through to live generation.
  }

  const report = await generateVehicleAiReport({
    plate: args.plate,
    locale: args.locale,
    vehicleData: args.vehicleData
  });

  try {
    const now = Date.now();
    await AiReportCacheModel.findByIdAndUpdate(
      key,
      {
        _id: key,
        plate: args.plate,
        locale: args.locale,
        report,
        cachedAt: new Date(now),
        expiresAt: new Date(now + AI_CACHE_TTL_MS)
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch {
    // Best-effort cache write; generation already succeeded.
  }

  return report;
}
