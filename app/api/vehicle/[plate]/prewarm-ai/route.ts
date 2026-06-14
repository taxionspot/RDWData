/**
 * POST /api/vehicle/[plate]/prewarm-ai
 *
 * Warms the AI report cache for a given plate and locale before the buyer pays,
 * so the post-payment read is a cache hit (no Claude wait).
 *
 * Trigger: when the pay modal opens (high-intent signal), fired fire-and-forget
 * from the client. The endpoint:
 *   - Enforces a per-IP fixed-window rate limit (30 requests/IP/hour) stored in
 *     MongoDB so an attacker cannot enumerate plates to trigger many Claude calls.
 *     Over-cap requests return { ok: true, throttled: true } (HTTP 200) so the
 *     fire-and-forget client never retries.
 *   - Always checks the cache first; returns immediately on a hit (idempotent).
 *   - Validates the plate against RDW before calling Claude, so random/invalid
 *     plates never trigger a generation (basic abuse guard).
 *   - Writes ONLY to the cache; NEVER returns AI content (premium must not leak).
 */

import { NextResponse } from "next/server";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { errorResponse } from "@/lib/api/errors";
import { getVehicleProfile } from "@/lib/rdw/service";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { generateVehicleAiReport } from "@/lib/api/claude";
import { aiCacheKey, readAiCache, writeAiCache } from "@/lib/api/ai-cache";
import { connectMongo } from "@/lib/db/mongodb";
import { PrewarmRateLimitModel } from "@/models/PrewarmRateLimit";

type Params = { params: { plate: string } };

/** Maximum prewarm calls allowed per IP per clock-hour. */
const PREWARM_HOURLY_CAP = 30;

/**
 * Derive the client IP from the request headers.
 * x-forwarded-for may be a comma-separated list; we take the first value
 * (the original client), which is what Vercel/most proxies set.
 * Falls back to a constant so the rate limit still works locally without a proxy.
 */
function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Increment the per-IP hourly counter and return the updated count.
 * Uses upsert + $inc so the operation is atomic. If Mongo is unavailable
 * we allow the request through (fail open, prefer availability).
 */
async function incrementRateLimitCount(ip: string): Promise<number> {
  try {
    await connectMongo();
    const hourSlot = new Date().toISOString().slice(0, 13).replace("T", "-"); // "YYYY-MM-DD-HH"
    const bucketId = `${ip}|${hourSlot}`;
    const doc = await PrewarmRateLimitModel.findOneAndUpdate(
      { _id: bucketId },
      { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    );
    return doc?.count ?? 1;
  } catch {
    // Mongo unavailable: fail open so a DB hiccup does not break prewarm.
    return 0;
  }
}

function parseLocale(input: string | null): Locale {
  return input === "en" ? "en" : "nl";
}

export async function POST(request: Request, { params }: Params) {
  try {
    // --- Rate limit (per-IP, per-hour) ---
    // Check BEFORE any expensive work. Over-cap: return 200 with throttled:true
    // so the fire-and-forget client never sees an error and does not retry.
    const ip = getClientIp(request);
    const count = await incrementRateLimitCount(ip);
    if (count > PREWARM_HOURLY_CAP) {
      return NextResponse.json({ ok: true, throttled: true });
    }

    const plate = parsePlateOrThrow(params.plate);
    const url = new URL(request.url);
    const locale = parseLocale(url.searchParams.get("lang"));

    // Prewarm always uses the no-mileage bucket ("") so it matches the
    // post-payment read that the buyer triggers (no mileage in the URL at that
    // point). If a mileage query param is present we honour it for future-proofing,
    // but the client currently does not send one.
    const cacheKey = aiCacheKey(plate, locale, "");

    // Idempotent: if the cache already has a valid entry do nothing.
    const cached = await readAiCache(cacheKey);
    if (cached) {
      return NextResponse.json({ ok: true, cached: true });
    }

    // Validate the plate with RDW (24h-cached). This ensures we never call
    // Claude for plates that do not correspond to a real Dutch vehicle.
    // getVehicleProfile throws an ApiError for invalid/unknown plates.
    const profile = await getVehicleProfile(plate);

    // Quick sanity-check: if the profile has no meaningful vehicle data (e.g.
    // a plate that RDW returns but with completely empty main data) skip Claude.
    const localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
    const vehicle = (localized.vehicle ?? {}) as Record<string, unknown>;
    if (!vehicle.brand && !vehicle.tradeName) {
      // Real vehicle not identifiable; still 200 so the client does not retry.
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Run the same generation the paid branch uses; share the cache module so
    // a hit written here is immediately readable by the paid GET handler.
    const aiReport = await generateVehicleAiReport({
      plate,
      locale,
      vehicleData: localized
    });
    await writeAiCache(cacheKey, aiReport.insights, aiReport.valuation);

    // NEVER return AI content. Write-to-cache only.
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Swallow errors gracefully: a failed prewarm just means the buyer waits
    // the normal ~5-15s after payment; nothing is broken.
    return errorResponse(error, "Prewarm failed.");
  }
}
