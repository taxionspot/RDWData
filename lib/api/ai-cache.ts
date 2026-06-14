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

/**
 * In-flight dedup map: one Promise per cache key, active only while the
 * generation is in progress within THIS serverless instance. Concurrent
 * requests for the same uncached plate coalesce onto a single Claude call
 * instead of each starting their own generation.
 *
 * Note: this dedups within one serverless instance (the common case for a
 * single browser's bursty requests: mount + refetch + poll + prewarm).
 * Cross-instance dedup would require a DB-level advisory lock; that is an
 * acceptable residual given serverless cold-start isolation.
 */
const inFlight = new Map<string, Promise<{ insights: unknown; valuation: unknown }>>();

/**
 * Read from the persistent cache or start exactly ONE generation per cache key
 * per instance. Concurrent callers that arrive while a generation is running
 * receive the same Promise (no second Claude call is started).
 *
 * @param cacheKey  - The key returned by `aiCacheKey(...)`.
 * @param generate  - Factory called at most once; must return raw {insights, valuation}.
 *                    The result is written to the persistent cache before the
 *                    Promise resolves, so any subsequent caller will get a DB hit.
 */
export async function getOrGenerateAiReport(
  cacheKey: string,
  generate: () => Promise<{ insights: unknown; valuation: unknown }>
): Promise<{ insights: unknown; valuation: unknown }> {
  // 1. Persistent cache hit: skip generation entirely.
  const cached = await readAiCache(cacheKey);
  if (cached) return { insights: cached.insights, valuation: cached.valuation };

  // 2. In-flight hit: another caller in this instance is already generating.
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  // 3. Miss: start ONE generation, register in the dedup map, persist on success.
  const p = (async () => {
    const r = await generate();
    await writeAiCache(cacheKey, r.insights, r.valuation);
    return r;
  })();

  inFlight.set(cacheKey, p);
  // Remove from the map whether the generation succeeded or failed, so a
  // transient failure does not permanently block future attempts.
  p.finally(() => inFlight.delete(cacheKey));

  return p;
}
