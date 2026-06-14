import { NextResponse } from "next/server";
import { getVehicleProfile } from "@/lib/rdw/service";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { connectMongo } from "@/lib/db/mongodb";
import { fetchComparablePool, type ComparableCar } from "@/lib/listings/apify";

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

type Subject = {
  year: number | null;
  valueNow: number | null;
  mileage: number | null;
  fuel: string | null;
  bodyType: string | null;
};

function fuzzyFuelEqual(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const map = (s: string) => {
    const x = s.toLowerCase();
    if (x.includes("elektr") || x.includes("electric")) return "ev";
    if (x.includes("hybr")) return "hybrid";
    if (x.includes("diesel")) return "diesel";
    if (x.includes("benz") || x.includes("petrol") || x.includes("gasol")) return "petrol";
    if (x.includes("lpg")) return "lpg";
    return x;
  };
  return map(a) === map(b);
}

/** Lower score = more similar to the subject vehicle. */
function rank(pool: ComparableCar[], s: Subject): ComparableCar[] {
  const scored = pool.map((car) => {
    let score = 0;
    if (s.year != null && car.year != null) score += Math.abs(car.year - s.year) * 1.6;
    else score += 4;
    if (s.valueNow && car.priceEur) score += Math.min((Math.abs(car.priceEur - s.valueNow) / s.valueNow) * 100, 60);
    else score += 12;
    if (s.mileage && car.mileageKm != null) score += Math.min((Math.abs(car.mileageKm - s.mileage) / Math.max(s.mileage, 15000)) * 35, 35);
    else score += 8;
    if (s.fuel && car.fuelType) {
      if (!fuzzyFuelEqual(s.fuel, car.fuelType)) score += 8;
    } else score += 2;
    if (s.bodyType && car.bodyType && s.bodyType.toLowerCase().slice(0, 4) !== car.bodyType.toLowerCase().slice(0, 4)) score += 4;
    if (!car.imageUrl) score += 6; // prefer cards that actually have a photo
    if (!car.priceEur) score += 20;
    return { car, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.map((x) => x.car);
}

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

    const pool = await getPool(brand, model);
    // estimatedValueNow is used only server-side here to rank by price closeness;
    // it is never returned in this response (the cards show listing prices, not
    // our premium valuation).
    const ranked = rank(pool, {
      year: typeof v.year === "number" ? v.year : null,
      valueNow: typeof e.estimatedValueNow === "number" ? (e.estimatedValueNow as number) : null,
      mileage: typeof e.estimatedMileageNow === "number" ? (e.estimatedMileageNow as number) : null,
      fuel: typeof v.fuelType === "string" ? (v.fuelType as string) : null,
      bodyType: typeof v.bodyType === "string" ? (v.bodyType as string) : null
    });
    return NextResponse.json({ cars: ranked.slice(0, 9) });
  } catch {
    return NextResponse.json({ cars: [] });
  }
}
