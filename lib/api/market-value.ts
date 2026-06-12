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

type ValuationLike = {
  estimatedValueNow: number;
  estimatedValueMin: number;
  estimatedValueMax: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
};

/**
 * The market value shown anywhere (web, PDF, e-mail, negotiation coach) is
 * ALWAYS our own formula (computeMarketValueV3 via enriched.estimatedValue*).
 * AI may only explain that value, never invent its own amounts. AI numbers
 * survive only when the formula has no value (e.g. missing catalogue price).
 */
export function alignValuationWithFormula<T extends ValuationLike>(
  localized: Record<string, unknown>,
  valuation: T | null | undefined
): T | null {
  if (!valuation) return null;
  const enriched = (localized.enriched ?? {}) as Record<string, unknown>;
  const now = Number(enriched.estimatedValueNow);
  if (!Number.isFinite(now) || now <= 0) return valuation;
  const min = Number(enriched.estimatedValueMin);
  const max = Number(enriched.estimatedValueMax);
  const confidence = enriched.marketValueConfidence;
  return {
    ...valuation,
    estimatedValueNow: Math.round(now),
    estimatedValueMin: Number.isFinite(min) && min > 0 ? Math.round(min) : Math.round(now * 0.9),
    estimatedValueMax: Number.isFinite(max) && max > 0 ? Math.round(max) : Math.round(now * 1.1),
    confidence:
      confidence === "HIGH" || confidence === "MEDIUM" || confidence === "LOW" ? confidence : valuation.confidence
  };
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
