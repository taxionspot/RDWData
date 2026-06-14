import { NextResponse } from "next/server";
import { getVehicleProfile } from "@/lib/rdw/service";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { connectMongo } from "@/lib/db/mongodb";
import { fetchComparablePool, type ComparableCar } from "@/lib/listings/apify";
import { hasPaidPlateAccess } from "@/lib/payments/server-access";
import { selectComparables } from "@/lib/listings/comparable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MONTHLY_RUN_CAP = Number(process.env.APIFY_MONTHLY_RUN_CAP || "2000");

function parseLocale(input: string | null): Locale {
  return input === "en" ? "en" : "nl";
}

/**
 * Returns the cached pool for brand+model, or fetches it from Apify on a miss
 * (subject to the monthly run cap). Never throws: returns [] on any failure so
 * the UI can fall back to plain deeplinks.
 */
async function getPool(brand: string, model: string): Promise<ComparableCar[]> {
  const key = `${brand}|${model}`.toLowerCase();
  try {
    await connectMongo();
    const { ComparableListingsCacheModel } = await import("@/models/ComparableListingsCache");
    const cached = await ComparableListingsCacheModel.findById(key).lean();
    const fresh = cached?.expiresAt && new Date(cached.expiresAt).getTime() > Date.now();
    if (fresh) return (cached?.cars as ComparableCar[]) ?? [];

    // Cost cap: stop fetching once this month's run budget is spent.
    const monthKey = new Date().toISOString().slice(0, 7);
    const { ApifyUsageModel } = await import("@/models/ApifyUsage");
    const usage = await ApifyUsageModel.findById(monthKey).lean();
    if (usage && usage.runs >= MONTHLY_RUN_CAP) {
      return (cached?.cars as ComparableCar[]) ?? [];
    }

    const cars = await fetchComparablePool(brand, model);
    if (cars.length) {
      await ComparableListingsCacheModel.findByIdAndUpdate(
        key,
        { _id: key, cars, fetchedAt: new Date(), expiresAt: new Date(Date.now() + CACHE_TTL_MS) },
        { upsert: true }
      );
      await ApifyUsageModel.findByIdAndUpdate(
        monthKey,
        { $inc: { runs: 1 }, $setOnInsert: { month: monthKey } },
        { upsert: true }
      );
    }
    return cars;
  } catch {
    return [];
  }
}

// rank and selectComparables are imported from @/lib/listings/comparable

export async function GET(request: Request, { params }: { params: { plate: string } }) {
  try {
    const url = new URL(request.url);
    const plate = parsePlateOrThrow(params.plate);
    const locale = parseLocale(url.searchParams.get("lang"));
    const profile = await getVehicleProfile(plate);
    const localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
    const v = (localized.vehicle ?? {}) as Record<string, unknown>;
    const e = (localized.enriched ?? {}) as Record<string, unknown>;
    const brand = typeof v.brand === "string" ? v.brand : null;
    const model = typeof v.tradeName === "string" ? v.tradeName : null;
    if (!brand || !model) return NextResponse.json({ cars: [] });

    // Comparable listings are premium: only paying visitors (and the sample
    // plate) get them. This also means the paid Apify actor is never called for
    // unpaid visitors, which keeps the cost down.
    if (!(await hasPaidPlateAccess(plate))) {
      return NextResponse.json({ cars: [] });
    }

    const pool = await getPool(brand, model);
    // estimatedValueNow is used only server-side here to rank by price closeness;
    // it is never returned in this response (the cards show listing prices, not
    // our premium valuation).
    const subject = {
      year: typeof v.year === "number" ? v.year : null,
      valueNow: typeof e.estimatedValueNow === "number" ? (e.estimatedValueNow as number) : null,
      mileage: typeof e.estimatedMileageNow === "number" ? (e.estimatedMileageNow as number) : null,
      fuel: typeof v.fuelType === "string" ? (v.fuelType as string) : null,
      bodyType: typeof v.bodyType === "string" ? (v.bodyType as string) : null
    };
    // selectComparables applies the price/km/fuel hard-filter + fallback ladder
    // before ranking. Cache key is still brand|model only (do NOT bake bands in).
    const selected = selectComparables(pool, subject);
    return NextResponse.json({ cars: selected });
  } catch {
    return NextResponse.json({ cars: [] });
  }
}
