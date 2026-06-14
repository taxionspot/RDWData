/**
 * POST /api/vehicle/[plate]/prewarm-ai
 *
 * Warms the AI report cache for a given plate and locale before the buyer pays,
 * so the post-payment read is a cache hit (no Claude wait).
 *
 * Trigger: when the pay modal opens (high-intent signal), fired fire-and-forget
 * from the client. The endpoint:
 *   - Always checks the cache first; returns immediately on a hit (idempotent).
 *   - Validates the plate against RDW before calling Claude, so random/invalid
 *     plates never trigger a generation (basic abuse guard).
 *   - Writes ONLY to the cache; NEVER returns AI content (premium must not leak).
 *
 * Cost note: a motivated attacker could enumerate NL plates and hit this endpoint
 * for each, triggering one Claude call per unique plate+locale pair per 7-day cache
 * window. The per-plate dedup on the client (sessionStorage kr_prewarm:<plate>) and
 * the cache-hit early return limit the blast radius for normal usage, but a
 * server-side rate-limit per IP is a recommended follow-up for production hardening.
 */

import { NextResponse } from "next/server";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { errorResponse } from "@/lib/api/errors";
import { getVehicleProfile } from "@/lib/rdw/service";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { generateVehicleAiReport } from "@/lib/api/claude";
import { aiCacheKey, readAiCache, writeAiCache } from "@/lib/api/ai-cache";

type Params = { params: { plate: string } };

function parseLocale(input: string | null): Locale {
  return input === "en" ? "en" : "nl";
}

export async function POST(request: Request, { params }: Params) {
  try {
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
