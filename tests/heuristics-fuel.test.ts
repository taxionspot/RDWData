import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyFuel,
  estimateRoadTaxQuarter,
  computeConditionAdjustment,
  computeMarketValueV3,
  estimateAnnualKm
} from "../lib/rdw/heuristics";

test("classifyFuel detects single fuels", () => {
  assert.equal(classifyFuel("Benzine").isPetrol, true);
  assert.equal(classifyFuel("Diesel").isDiesel, true);
  assert.equal(classifyFuel("Elektriciteit").isElectric, true);
  assert.equal(classifyFuel("LPG").isLpg, true);
});

test("classifyFuel treats combined petrol+electric as a (plug-in) hybrid", () => {
  const k = classifyFuel("Benzine / Elektriciteit");
  assert.equal(k.isPetrol, true);
  assert.equal(k.isElectric, true);
  assert.equal(k.isHybrid, true);
});

test("classifyFuel is robust to casing and null/empty", () => {
  assert.equal(classifyFuel("diesel").isDiesel, true);
  assert.equal(classifyFuel(null).isPetrol, false);
  assert.equal(classifyFuel("").isElectric, false);
});

test("estimateRoadTaxQuarter: null for missing weight, sane ranges, fuel ordering", () => {
  assert.equal(estimateRoadTaxQuarter(0, "Benzine"), null);
  assert.equal(estimateRoadTaxQuarter(null, "Benzine"), null);

  const petrol = estimateRoadTaxQuarter(1200, "Benzine");
  assert.ok(petrol && petrol.min > 0 && petrol.max > petrol.min);

  // Diesel surcharge makes it more expensive than petrol at the same weight.
  const diesel = estimateRoadTaxQuarter(1200, "Diesel");
  assert.ok(diesel && diesel.min > petrol!.min);

  // A pure EV is far cheaper than the petrol equivalent.
  const ev = estimateRoadTaxQuarter(1500, "Elektriciteit");
  const petrol1500 = estimateRoadTaxQuarter(1500, "Benzine");
  assert.ok(ev && petrol1500 && ev.max < petrol1500.min);
});

test("computeConditionAdjustment: clean vehicle is neutral", () => {
  const clean = computeConditionAdjustment({
    napVerdict: "Logisch",
    mileageVerdict: "LOGISCH",
    wok: false,
    isImported: false,
    ownersCount: 1,
    apkExpiryDate: null,
    hasOpenRecall: false
  });
  assert.equal(clean.factor, 1);
  assert.equal(clean.forceLowConfidence, false);
  assert.equal(clean.reasons.length, 0);
});

test("computeConditionAdjustment: illogical odometer discounts and forces LOW confidence", () => {
  const cond = computeConditionAdjustment({
    napVerdict: "Onlogisch",
    mileageVerdict: "LOGISCH",
    wok: false,
    isImported: false,
    ownersCount: 2,
    apkExpiryDate: null,
    hasOpenRecall: false
  });
  assert.ok(cond.factor < 0.7);
  assert.equal(cond.forceLowConfidence, true);
});

test("computeConditionAdjustment: stacked negatives are floored at 0.40", () => {
  const worst = computeConditionAdjustment({
    napVerdict: "Onlogisch",
    mileageVerdict: "ONLOGISCH",
    wok: true,
    isImported: true,
    ownersCount: 9,
    apkExpiryDate: "2000-01-01",
    hasOpenRecall: true
  });
  assert.equal(worst.factor, 0.4);
  assert.equal(worst.forceLowConfidence, true);
});

test("estimateAnnualKm: taxi dominates, diesel > petrol, sane band", () => {
  const taxi = estimateAnnualKm({ fuelType: "Diesel", bodyType: "stationwagen", isTaxi: true });
  assert.equal(taxi, 45000); // taxi overrides everything

  const petrol = estimateAnnualKm({ fuelType: "Benzine", bodyType: null, isTaxi: false });
  const diesel = estimateAnnualKm({ fuelType: "Diesel", bodyType: null, isTaxi: false });
  assert.equal(petrol, 13500); // base NL average
  assert.ok(diesel > petrol); // diesels are driven more

  const van = estimateAnnualKm({ fuelType: "Diesel", bodyType: "bestelauto", isTaxi: false });
  assert.ok(van > diesel); // vans more again
});

test("computeMarketValueV3: an ex-taxi (high estimated km) is worth far less than a low-km car", () => {
  const base = {
    catalogPrice: 35000,
    ageYears: 8.5,
    brand: "Kia",
    fuelType: "Diesel",
    bodyType: "stationwagen" as string | null
  };
  // ~382k km estimated for an 8.5y diesel taxi vs a modest 100k km car.
  const exTaxi = computeMarketValueV3({ ...base, mileage: 382000, mileageEstimated: true });
  const lowKm = computeMarketValueV3({ ...base, mileage: 100000, mileageEstimated: true });
  assert.ok(exTaxi.value && lowKm.value && exTaxi.value < lowKm.value * 0.7);
  // A value built on an estimated mileage is never HIGH confidence.
  assert.notEqual(exTaxi.confidence, "HIGH");
});

test("computeMarketValueV3: estimated mileage widens uncertainty vs a measured one", () => {
  const params = {
    catalogPrice: 30000,
    ageYears: 5,
    brand: "Volkswagen",
    fuelType: "Benzine",
    bodyType: null as string | null,
    mileage: 80000
  };
  const measured = computeMarketValueV3({ ...params, mileageEstimated: false });
  const estimated = computeMarketValueV3({ ...params, mileageEstimated: true });
  assert.ok(measured.se != null && estimated.se != null && estimated.se > measured.se);
});

test("computeMarketValueV3: condition discount lowers value vs baseline", () => {
  const params = {
    catalogPrice: 30000,
    ageYears: 5,
    brand: "Volkswagen",
    fuelType: "Benzine",
    bodyType: null as string | null,
    mileage: 80000
  };
  const base = computeMarketValueV3(params);
  const cond = computeConditionAdjustment({
    napVerdict: "Onlogisch",
    mileageVerdict: "ONLOGISCH",
    wok: false,
    isImported: false,
    ownersCount: 2,
    apkExpiryDate: null,
    hasOpenRecall: false
  });
  const adjusted = computeMarketValueV3({ ...params, condition: cond });
  assert.ok(base.value && adjusted.value && adjusted.value < base.value);
  assert.equal(adjusted.confidence, "LOW");
});
