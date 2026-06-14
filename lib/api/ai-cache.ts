/**
 * Shared AI report cache layer.
 *
 * Both the vehicle API route and the post-payment email builder use the same
 * cache so a key written by one is always readable by the other.
 *
 * Key schema: "v3|<PLATE>|<locale>|<mileageBucket>"
 *   - mileageBucket = "" for email builds (formula estimate, no user input)
 *   - mileageBucket = String(Math.round(userMileage / 5000) * 5000) for the API
 *
 * Keeping the key builder here means a future version bump updates both
 * callers at once and old entries are invalidated consistently.
 */

import { connectMongo } from "@/lib/db/mongodb";
import type { Locale } from "@/lib/i18n/messages";

export const AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Build the shared cache key.
 *
 * Pass `mileageBucket` as an empty string for paths that do not have a
 * user-supplied mileage reading (the email builder, for example). Pass the
 * rounded bucket string for the per-visitor API path.
 */
export function aiCacheKey(plate: string, locale: Locale, mileageBucket: string = ""): string {
  // v3: invalidates entries from before the AI summary was shortened to
  // 35-60 words (old entries could carry 200-word blobs).
  return `v3|${plate}|${locale}|${mileageBucket}`;
}

export async function readAiCache(key: string): Promise<{ insights: unknown; valuation: unknown } | null> {
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

export async function writeAiCache(key: string, insights: unknown, valuation: unknown): Promise<void> {
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
