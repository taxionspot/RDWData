import { computeMarketValueV3 } from "@/lib/rdw/heuristics";

function parseFirstRegistration(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) {
    const normalized = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function applyMileageValuationOverride(localized: Record<string, unknown>, mileage: number | null): Record<string, unknown> {
  if (mileage === null) return localized;
  const vehicle = (localized.vehicle ?? {}) as Record<string, unknown>;
  const enriched = (localized.enriched ?? {}) as Record<string, unknown>;
  const firstRegistration = parseFirstRegistration(vehicle.firstRegistrationWorld);
  const ageYears =
    firstRegistration == null
      ? null
      : Math.max((Date.now() - firstRegistration.getTime()) / (1000 * 60 * 60 * 24 * 365.25), 0);

  const current = computeMarketValueV3({
    catalogPrice: Number(vehicle.cataloguePrice ?? 0) || null,
    ageYears,
    brand: (vehicle.brand as string | null | undefined) ?? null,
    fuelType: (vehicle.fuelType as string | null | undefined) ?? null,
    bodyType: (vehicle.bodyType as string | null | undefined) ?? null,
    mileage
  });

  let nextYearValue: number | null = null;
  if (ageYears != null) {
    const slope = Number(enriched.mileageSlopeKmPerYear ?? 0);
    const projectedMileage = Number.isFinite(slope) ? mileage + slope : mileage;
    const next = computeMarketValueV3({
      catalogPrice: Number(vehicle.cataloguePrice ?? 0) || null,
      ageYears: ageYears + 1,
      brand: (vehicle.brand as string | null | undefined) ?? null,
      fuelType: (vehicle.fuelType as string | null | undefined) ?? null,
      bodyType: (vehicle.bodyType as string | null | undefined) ?? null,
      mileage: projectedMileage
    });
    nextYearValue = next.value;
  }

  return {
    ...localized,
    enriched: {
      ...enriched,
      estimatedValueNow: current.value,
      estimatedValueMin: current.min,
      estimatedValueMax: current.max,
      estimatedValueNextYear: nextYearValue,
      marketValueConfidence: current.confidence,
      marketValueSe: current.se
    }
  };
}
