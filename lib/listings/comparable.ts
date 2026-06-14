/**
 * Shared comparable-car ranking and filtering logic.
 * Used by the comparable API route and the PDF workstream.
 * Client-safe imports only (no Next.js / React).
 */

/**
 * A normalized "comparable car for sale". Defined here (shared module) to avoid
 * a circular dependency: apify.ts -> deeplinks.ts -> comparable.ts.
 * apify.ts re-exports this type.
 */
export type ComparableCar = {
  title: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  priceEur: number | null;
  mileageKm: number | null;
  fuelType: string | null;
  bodyType: string | null;
  city: string | null;
  region: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  source: string | null;
};

// ---------------------------------------------------------------------------
// Constants (one place)
// ---------------------------------------------------------------------------

/** Price band for hard filter: +-30% of subject estimated value. */
export const PRICE_BAND = 0.30;
/** Wider price band used in fallback ladder step 3. */
export const PRICE_BAND_WIDE = 0.50;
/** Mileage band as a fraction of subject mileage. */
export const KM_BAND_PCT = 0.40;
/** Absolute mileage floor so low-km subjects don't hit an impossibly tight band. */
export const KM_BAND_FLOOR = 40_000;
/** Minimum number of results before the fallback ladder stops narrowing. */
export const MIN_CARDS = 4;
/** Maximum results returned by selectComparables. UI slices to 6. */
export const MAX_RETURN = 9;

// ---------------------------------------------------------------------------
// Fuel normalisation
// ---------------------------------------------------------------------------

/**
 * Map a raw fuelType string to a canonical token.
 * Shared by the filter AND by deeplinks so both agree on the token.
 */
export function normalizeFuel(s: string | null | undefined): string | null {
  if (!s) return null;
  const x = s.toLowerCase();
  if (x.includes("elektr") || x.includes("electric")) return "ev";
  if (x.includes("hybr")) return "hybrid";
  if (x.includes("diesel")) return "diesel";
  if (x.includes("benz") || x.includes("petrol") || x.includes("gasol")) return "petrol";
  if (x.includes("lpg")) return "lpg";
  return x;
}

/**
 * Fuzzy fuel equality: two fuels are equal if their canonical tokens match.
 * Returns false (not equal) when either value is null/empty, so the caller
 * can decide whether null counts as a pass.
 */
export function fuzzyFuelEqual(a: string | null, b: string | null): boolean {
  const na = normalizeFuel(a);
  const nb = normalizeFuel(b);
  if (!na || !nb) return false;
  return na === nb;
}

// ---------------------------------------------------------------------------
// Subject reference shape
// ---------------------------------------------------------------------------

export type Subject = {
  year: number | null;
  /** Subject estimated value (premium field). null = skip price band. */
  valueNow: number | null;
  /** Subject estimated mileage. null = skip km band. */
  mileage: number | null;
  fuel: string | null;
  bodyType: string | null;
};

// ---------------------------------------------------------------------------
// Ranking (lower score = more similar)
// ---------------------------------------------------------------------------

/**
 * Score each car in the pool against the subject; return pool sorted best-first.
 * Penalties for missing priceEur/imageUrl kept from original route.
 */
export function rank(pool: ComparableCar[], s: Subject): ComparableCar[] {
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
    if (!car.imageUrl) score += 6;
    if (!car.priceEur) score += 20;
    return { car, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.map((x) => x.car);
}

// ---------------------------------------------------------------------------
// Hard-filter helpers
// ---------------------------------------------------------------------------

/**
 * NULL-AS-PASS rule: a car passes a band check when its value is null (unknown)
 * OR within the band. Only a KNOWN out-of-band value drops the car.
 * When the subject reference itself is null, the band is skipped entirely.
 */

function passesPrice(car: ComparableCar, valueNow: number | null, band: number): boolean {
  if (valueNow == null) return true; // skip band
  if (car.priceEur == null) return true; // null = pass
  return car.priceEur >= valueNow * (1 - band) && car.priceEur <= valueNow * (1 + band);
}

function passesMileage(car: ComparableCar, mileage: number | null): boolean {
  if (mileage == null) return true; // skip band
  if (car.mileageKm == null) return true; // null = pass
  const delta = Math.max(KM_BAND_PCT * mileage, KM_BAND_FLOOR);
  return car.mileageKm >= mileage - delta && car.mileageKm <= mileage + delta;
}

function passesFuel(car: ComparableCar, fuel: string | null): boolean {
  if (fuel == null) return true; // skip band
  if (car.fuelType == null) return true; // null = pass
  return fuzzyFuelEqual(fuel, car.fuelType);
}

// ---------------------------------------------------------------------------
// Fallback ladder
// ---------------------------------------------------------------------------

/**
 * Select the best comparable cars from a raw Apify pool, applying hard filters
 * before ranking. Returns at most MAX_RETURN (9) results.
 *
 * Fallback ladder (stops at the first step that yields >= MIN_CARDS results):
 *   1. price +-30%  AND km band  AND fuel
 *   2. price +-30%  AND fuel     (drop km, least-reliable scraped field)
 *   3. price +-50%  AND fuel     (widen price, keep fuel)
 *   4. price +-50%              (drop fuel, keep wide price)
 *   5. no hard filter            (pure rank, reproduces today's behaviour)
 *
 * NULL-AS-PASS is mandatory: a car with a null field always passes that band.
 * Never returns fewer results than today's pure rank() unless the pool itself
 * is empty.
 */
export function selectComparables(pool: ComparableCar[], subject: Subject): ComparableCar[] {
  if (pool.length === 0) return [];

  const { valueNow, mileage, fuel } = subject;

  const apply = (
    usePrice: boolean,
    priceBandValue: number,
    useKm: boolean,
    useFuel: boolean
  ): ComparableCar[] => {
    const survivors = pool.filter((car) => {
      if (usePrice && !passesPrice(car, valueNow, priceBandValue)) return false;
      if (useKm && !passesMileage(car, mileage)) return false;
      if (useFuel && !passesFuel(car, fuel)) return false;
      return true;
    });
    return rank(survivors, subject).slice(0, MAX_RETURN);
  };

  // Step 1: strict (price +-30% + km + fuel)
  const s1 = apply(true, PRICE_BAND, true, true);
  if (s1.length >= MIN_CARDS) return s1;

  // Step 2: drop km (price +-30% + fuel)
  const s2 = apply(true, PRICE_BAND, false, true);
  if (s2.length >= MIN_CARDS) return s2;

  // Step 3: widen price to +-50% + fuel
  const s3 = apply(true, PRICE_BAND_WIDE, false, true);
  if (s3.length >= MIN_CARDS) return s3;

  // Step 4: wide price + no fuel (price +-50%, fuel dropped)
  const s4 = apply(true, PRICE_BAND_WIDE, false, false);
  if (s4.length >= MIN_CARDS) return s4;

  // Step 5: no hard filter, pure rank (reproduces today's behaviour exactly)
  return rank(pool, subject).slice(0, MAX_RETURN);
}
