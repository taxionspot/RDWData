import test from "node:test";
import assert from "node:assert/strict";
import { classifyFuel } from "../lib/rdw/heuristics";

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
