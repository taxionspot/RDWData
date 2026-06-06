import test from "node:test";
import assert from "node:assert/strict";
import { classifyFuel, estimateRoadTaxQuarter } from "../lib/rdw/heuristics";

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
