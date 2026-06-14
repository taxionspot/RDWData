import test from "node:test";
import assert from "node:assert/strict";
import {
  selectComparables,
  normalizeFuel,
  fuzzyFuelEqual,
  PRICE_BAND,
  PRICE_BAND_WIDE,
  KM_BAND_PCT,
  KM_BAND_FLOOR,
  MIN_CARDS,
  MAX_RETURN,
  type ComparableCar,
  type Subject
} from "../lib/listings/comparable";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCar(overrides: Partial<ComparableCar> = {}): ComparableCar {
  return {
    title: "Test Auto",
    brand: "BMW",
    model: "3 Serie",
    year: 2018,
    priceEur: 15000,
    mileageKm: 80000,
    fuelType: "Diesel",
    bodyType: "Sedan",
    city: "Amsterdam",
    region: "Noord-Holland",
    imageUrl: "https://example.com/img.jpg",
    sourceUrl: "https://example.com/listing",
    source: "gaspedaal.nl",
    ...overrides
  };
}

const baseSubject: Subject = {
  year: 2018,
  valueNow: 15000,
  mileage: 80000,
  fuel: "Diesel",
  bodyType: "Sedan"
};

// ---------------------------------------------------------------------------
// normalizeFuel
// ---------------------------------------------------------------------------

test("normalizeFuel: returns canonical tokens", () => {
  assert.equal(normalizeFuel("Benzine"), "petrol");
  assert.equal(normalizeFuel("petrol"), "petrol");
  assert.equal(normalizeFuel("GASOLINE"), "petrol");
  assert.equal(normalizeFuel("Diesel"), "diesel");
  assert.equal(normalizeFuel("diesel"), "diesel");
  assert.equal(normalizeFuel("Elektrisch"), "ev");
  assert.equal(normalizeFuel("electric"), "ev");
  assert.equal(normalizeFuel("Hybrid"), "hybrid");
  assert.equal(normalizeFuel("Hybride"), "hybrid");
  assert.equal(normalizeFuel("LPG"), "lpg");
  assert.equal(normalizeFuel(null), null);
  assert.equal(normalizeFuel(undefined), null);
  assert.equal(normalizeFuel(""), null);
});

// ---------------------------------------------------------------------------
// fuzzyFuelEqual
// ---------------------------------------------------------------------------

test("fuzzyFuelEqual: same canonical fuel returns true", () => {
  assert.equal(fuzzyFuelEqual("Diesel", "diesel"), true);
  assert.equal(fuzzyFuelEqual("Benzine", "petrol"), true);
  assert.equal(fuzzyFuelEqual("Elektrisch", "electric"), true);
  assert.equal(fuzzyFuelEqual("Hybrid", "Hybride"), true);
});

test("fuzzyFuelEqual: different fuels return false", () => {
  assert.equal(fuzzyFuelEqual("Diesel", "Benzine"), false);
  assert.equal(fuzzyFuelEqual("Diesel", "electric"), false);
});

test("fuzzyFuelEqual: null values return false", () => {
  assert.equal(fuzzyFuelEqual(null, "diesel"), false);
  assert.equal(fuzzyFuelEqual("diesel", null), false);
  assert.equal(fuzzyFuelEqual(null, null), false);
});

// ---------------------------------------------------------------------------
// selectComparables - constants
// ---------------------------------------------------------------------------

test("constants are set correctly", () => {
  assert.equal(PRICE_BAND, 0.30);
  assert.equal(PRICE_BAND_WIDE, 0.50);
  assert.equal(KM_BAND_PCT, 0.40);
  assert.equal(KM_BAND_FLOOR, 40000);
  assert.equal(MIN_CARDS, 4);
  assert.equal(MAX_RETURN, 9);
});

// ---------------------------------------------------------------------------
// selectComparables - empty pool
// ---------------------------------------------------------------------------

test("selectComparables: returns [] for empty pool (never crashes)", () => {
  const result = selectComparables([], baseSubject);
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// selectComparables - step 1 (strict: price + km + fuel)
// ---------------------------------------------------------------------------

test("selectComparables step 1: returns matching cars (price/km/fuel all within band)", () => {
  const pool = [
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" })
  ];
  const result = selectComparables(pool, baseSubject);
  assert.equal(result.length, 4);
});

test("selectComparables step 1: excludes cars with price way out of band", () => {
  // Subject value 15000; band +-30% = [10500, 19500]
  const goodCar = makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" });
  const expensiveCar = makeCar({ priceEur: 30000, mileageKm: 80000, fuelType: "Diesel" });
  const pool = [goodCar, goodCar, goodCar, goodCar, expensiveCar];
  const result = selectComparables(pool, baseSubject);
  // All 4 good cars pass; expensive car dropped
  assert.ok(result.every((c) => c.priceEur === 15000));
});

test("selectComparables step 1: excludes cars with fuel mismatch", () => {
  const goodCar = makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" });
  const wrongFuel = makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Benzine" });
  const pool = [goodCar, goodCar, goodCar, goodCar, wrongFuel];
  const result = selectComparables(pool, baseSubject);
  assert.ok(result.every((c) => c.fuelType === "Diesel" || c.fuelType === null));
});

test("selectComparables step 1: excludes cars with km way out of band", () => {
  // Subject mileage 80000; delta = max(0.40*80000, 40000) = 40000; band = [40000, 120000]
  const goodCar = makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" });
  const highKm = makeCar({ priceEur: 15000, mileageKm: 200000, fuelType: "Diesel" });
  const pool = [goodCar, goodCar, goodCar, goodCar, highKm];
  const result = selectComparables(pool, baseSubject);
  assert.ok(result.every((c) => (c.mileageKm ?? 0) <= 120000));
});

// ---------------------------------------------------------------------------
// selectComparables - NULL-AS-PASS (mandatory)
// ---------------------------------------------------------------------------

test("NULL-AS-PASS: car with null priceEur passes price band", () => {
  // 4 good + 1 with null price; the null-price car should pass the band
  const pool = [
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: null, mileageKm: 80000, fuelType: "Diesel" })
  ];
  const result = selectComparables(pool, baseSubject);
  assert.equal(result.length, 4);
  const hasNull = result.some((c) => c.priceEur === null);
  assert.equal(hasNull, true);
});

test("NULL-AS-PASS: car with null mileageKm passes km band", () => {
  const pool = [
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: null, fuelType: "Diesel" })
  ];
  const result = selectComparables(pool, baseSubject);
  assert.equal(result.length, 4);
});

test("NULL-AS-PASS: car with null fuelType passes fuel band", () => {
  const pool = [
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: null })
  ];
  const result = selectComparables(pool, baseSubject);
  assert.equal(result.length, 4);
  const hasNull = result.some((c) => c.fuelType === null);
  assert.equal(hasNull, true);
});

test("NULL-AS-PASS: subject valueNow null -> price band skipped entirely", () => {
  const subject: Subject = { ...baseSubject, valueNow: null };
  // All cars pass price check regardless of their price
  const pool = [
    makeCar({ priceEur: 100, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 99999, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 500, mileageKm: 80000, fuelType: "Diesel" })
  ];
  const result = selectComparables(pool, subject);
  assert.equal(result.length, 4);
});

test("NULL-AS-PASS: subject mileage null -> km band skipped entirely", () => {
  const subject: Subject = { ...baseSubject, mileage: null };
  const pool = [
    makeCar({ priceEur: 15000, mileageKm: 1000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 999999, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 150000, fuelType: "Diesel" })
  ];
  const result = selectComparables(pool, subject);
  assert.equal(result.length, 4);
});

test("NULL-AS-PASS: subject fuel null -> fuel band skipped entirely", () => {
  const subject: Subject = { ...baseSubject, fuel: null };
  const pool = [
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Benzine" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Elektrisch" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: null })
  ];
  const result = selectComparables(pool, subject);
  assert.equal(result.length, 4);
});

// ---------------------------------------------------------------------------
// selectComparables - fallback ladder
// ---------------------------------------------------------------------------

test("fallback ladder step 2: drops km when step 1 yields < MIN_CARDS", () => {
  // Only 2 cars pass strict (price+km+fuel), but 4 pass when km is dropped.
  // km band: [40000, 120000]; strict: 2 in band, 2 outside
  const subject: Subject = { ...baseSubject, mileage: 80000 };
  const pool = [
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 200000, fuelType: "Diesel" }), // km out of band
    makeCar({ priceEur: 15000, mileageKm: 5000, fuelType: "Diesel" })    // km out of band (under floor but floor=40000 so 80000-40000=40000, 5000 < 40000 -> out)
  ];
  const result = selectComparables(pool, subject);
  // Step 1: 2 cars. Step 2 (drop km): all 4 pass price+fuel -> returns 4
  assert.equal(result.length, 4);
});

test("fallback ladder step 3: widens price to 50% when steps 1+2 yield < MIN_CARDS", () => {
  // No km subject, so steps 1 vs 2 are same (km skipped). Fuel=diesel, price band:
  // Step 1/2: [10500, 19500]; step 3: [7500, 22500]
  const subject: Subject = { ...baseSubject, mileage: null };
  const pool = [
    makeCar({ priceEur: 20000, mileageKm: null, fuelType: "Diesel" }), // step1 fail (20000 > 19500), step3 pass (20000 <= 22500)
    makeCar({ priceEur: 20500, mileageKm: null, fuelType: "Diesel" }), // step1 fail, step3 pass
    makeCar({ priceEur: 21000, mileageKm: null, fuelType: "Diesel" }), // step3 pass
    makeCar({ priceEur: 22000, mileageKm: null, fuelType: "Diesel" })  // step3 pass
  ];
  const result = selectComparables(pool, subject);
  // Steps 1+2: 0 cars. Step 3 (price +-50% + fuel): all 4 pass. Returns 4.
  assert.equal(result.length, 4);
});

test("fallback ladder step 4: drops fuel when step 3 still yields < MIN_CARDS", () => {
  // 3 diesel in price +-50%, 1 petrol in price +-50%. Steps 1-3 give 3 (< 4), step 4 gives 4.
  const subject: Subject = { ...baseSubject, mileage: null };
  const pool = [
    makeCar({ priceEur: 20000, mileageKm: null, fuelType: "Diesel" }),
    makeCar({ priceEur: 21000, mileageKm: null, fuelType: "Diesel" }),
    makeCar({ priceEur: 22000, mileageKm: null, fuelType: "Diesel" }),
    makeCar({ priceEur: 22000, mileageKm: null, fuelType: "Benzine" }) // fuel mismatch; passes step 4
  ];
  const result = selectComparables(pool, subject);
  // Steps 1+2: 0. Step 3 (fuel=diesel, price +-50%): 3 diesel. Step 4 (drop fuel): 4.
  assert.equal(result.length, 4);
});

test("fallback ladder step 5: pure rank when all steps yield < MIN_CARDS (never returns 0 for non-empty pool)", () => {
  // 3 cars, all failing every filter (e.g. extreme price AND different fuel).
  // Pool has 3 entries; step 5 returns all 3 (pure rank, no filter).
  const subject: Subject = { ...baseSubject, mileage: null };
  const pool = [
    makeCar({ priceEur: 100000, mileageKm: null, fuelType: "Elektrisch" }),
    makeCar({ priceEur: 100000, mileageKm: null, fuelType: "Benzine" }),
    makeCar({ priceEur: 100000, mileageKm: null, fuelType: "LPG" })
  ];
  const result = selectComparables(pool, subject);
  // All steps give 0 survivors. Step 5 = pure rank, returns all 3.
  assert.equal(result.length, 3);
  assert.ok(result.length > 0, "must never return 0 for a non-empty pool");
});

// ---------------------------------------------------------------------------
// selectComparables - never returns 0 for a non-empty pool
// ---------------------------------------------------------------------------

test("never returns 0 when pool has at least 1 car", () => {
  const pool = [makeCar({ priceEur: 999999, mileageKm: 999999, fuelType: "Waterstof" })];
  const result = selectComparables(pool, baseSubject);
  assert.ok(result.length >= 1, "must return at least 1 car when pool is non-empty");
});

// ---------------------------------------------------------------------------
// selectComparables - MAX_RETURN cap
// ---------------------------------------------------------------------------

test("returns at most MAX_RETURN (9) cars", () => {
  const pool = Array.from({ length: 20 }, (_, i) =>
    makeCar({ priceEur: 15000, mileageKm: 80000, fuelType: "Diesel", title: `Car ${i}` })
  );
  const result = selectComparables(pool, baseSubject);
  assert.ok(result.length <= MAX_RETURN, `expected <= ${MAX_RETURN}, got ${result.length}`);
});

// ---------------------------------------------------------------------------
// selectComparables - km band floor
// ---------------------------------------------------------------------------

test("km band floor: low-km subject uses 40000 floor, not percentage", () => {
  // Subject mileage = 10000; 40% = 4000 < floor=40000, so band = [0, 50000]
  // A car with 45000 km should pass (within floor-delta).
  const subject: Subject = { ...baseSubject, mileage: 10000 };
  const pool = [
    makeCar({ priceEur: 15000, mileageKm: 45000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 45000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 45000, fuelType: "Diesel" }),
    makeCar({ priceEur: 15000, mileageKm: 45000, fuelType: "Diesel" })
  ];
  const result = selectComparables(pool, subject);
  assert.equal(result.length, 4);
});

// ---------------------------------------------------------------------------
// selectComparables - price band exact boundary
// ---------------------------------------------------------------------------

test("price band +-30%: boundary values pass and just-outside values fail", () => {
  const valueNow = 10000;
  const subject: Subject = { ...baseSubject, valueNow, mileage: null, fuel: null };
  // Lower bound: 7000 (exactly 0.70 * 10000 = pass); 6999 = fail
  // Upper bound: 13000 (exactly 1.30 * 10000 = pass); 13001 = fail
  const passLow = makeCar({ priceEur: 7000, mileageKm: null, fuelType: null });
  const failLow = makeCar({ priceEur: 6999, mileageKm: null, fuelType: null });
  const passHigh = makeCar({ priceEur: 13000, mileageKm: null, fuelType: null });
  const failHigh = makeCar({ priceEur: 13001, mileageKm: null, fuelType: null });

  // Pool that ensures we hit step 1 (fuel+km both null in subject -> skipped)
  const pool4Pass = [passLow, passHigh, passLow, passHigh, failLow, failHigh];
  const result = selectComparables(pool4Pass, subject);
  assert.ok(result.every((c) => c.priceEur === 7000 || c.priceEur === 13000),
    "boundary values should pass; just-outside values should be excluded");
});
