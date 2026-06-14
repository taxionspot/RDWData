import test from "node:test";
import assert from "node:assert/strict";
import { toneToPdfWord, pdfGroupOrder, pdfSectionTitle } from "../lib/vehicle/pdf-presentation";
import { GROUPS } from "../lib/vehicle/groups";

test("toneToPdfWord maps tones to ASCII status words (no glyphs, survives grayscale)", () => {
  assert.equal(toneToPdfWord("ok"), "GOED");
  assert.equal(toneToPdfWord("warn"), "LET OP");
  assert.equal(toneToPdfWord("danger"), "SLECHT");
});

test("pdfGroupOrder lists every GROUPS section id in G1..G9 order", () => {
  const expected = GROUPS.flatMap((g) => g.sectionIds);
  assert.deepEqual(pdfGroupOrder(), expected);
});

test("pdfGroupOrder starts with the identity group and never contains the dropped risico section", () => {
  const order = pdfGroupOrder();
  assert.equal(order[0], "overzicht");
  assert.equal(order[1], "ai-analyse");
  assert.equal(order.includes("risico" as never), false);
});

test("pdfGroupOrder 9-group order matches GROUPS definition exactly (G1-G9)", () => {
  // The PDF order is driven from GROUPS, so this test validates that pdfGroupOrder()
  // returns the same section ids as GROUPS.flatMap(g => g.sectionIds) in order.
  // Current order: g1-overzicht=[overzicht], g2-oordeel=[ai-analyse],
  // g3-markt=[markt], g4-tekoop=[te-koop], g5-schatting=[schatting],
  // g6-risico=[schade], g7-km=[kilometerstand], g8-apk=[apk,apk-intelligence],
  // g9-eigendom=[eigendom,specs]
  const order = pdfGroupOrder();
  const expected = GROUPS.flatMap((g) => g.sectionIds);
  assert.deepEqual(order, expected);
  // Also verify key positions:
  assert.equal(order[0], "overzicht");
  assert.equal(order[1], "ai-analyse");
  assert.equal(order[2], "markt");
  assert.equal(order[3], "te-koop");
  assert.equal(order[4], "schatting");
  assert.equal(order[5], "schade");
  assert.equal(order[6], "kilometerstand");
  assert.equal(order[7], "apk");
  assert.equal(order[8], "apk-intelligence");
  assert.equal(order[9], "eigendom");
  assert.equal(order[10], "specs");
});

test("pdfSectionTitle returns honest Dutch and English titles for each section id", () => {
  assert.equal(pdfSectionTitle("overzicht", "nl"), "Voertuigoverzicht");
  assert.equal(pdfSectionTitle("overzicht", "en"), "Vehicle overview");
  assert.equal(pdfSectionTitle("markt", "nl"), "Marktwaarde en eerlijke prijs");
  assert.equal(pdfSectionTitle("kilometerstand", "en"), "Mileage and NAP");
  assert.equal(pdfSectionTitle("schade", "nl"), "Risicos en schade");
  assert.equal(pdfSectionTitle("schatting", "nl"), "Schatting en risico");
  assert.equal(pdfSectionTitle("schatting", "en"), "Estimate and risk");
});
