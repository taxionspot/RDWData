import test from "node:test";
import assert from "node:assert/strict";
import { toneToPdfWord, pdfGroupOrder, pdfSectionTitle } from "../lib/vehicle/pdf-presentation";
import { GROUPS } from "../lib/vehicle/groups";

test("toneToPdfWord maps tones to ASCII status words (no glyphs, survives grayscale)", () => {
  assert.equal(toneToPdfWord("ok"), "GOED");
  assert.equal(toneToPdfWord("warn"), "LET OP");
  assert.equal(toneToPdfWord("danger"), "SLECHT");
});

test("pdfGroupOrder lists every GROUPS section id in G1..G6 order", () => {
  const expected = GROUPS.flatMap((g) => g.sectionIds);
  assert.deepEqual(pdfGroupOrder(), expected);
});

test("pdfGroupOrder starts with the verdict group and never contains the dropped risico section", () => {
  const order = pdfGroupOrder();
  assert.equal(order[0], "overzicht");
  assert.equal(order[1], "ai-analyse");
  assert.equal(order.includes("risico" as never), false);
});

test("pdfSectionTitle returns honest Dutch and English titles for each section id", () => {
  assert.equal(pdfSectionTitle("overzicht", "nl"), "Voertuigoverzicht");
  assert.equal(pdfSectionTitle("overzicht", "en"), "Vehicle overview");
  assert.equal(pdfSectionTitle("markt", "nl"), "Marktwaarde en eerlijke prijs");
  assert.equal(pdfSectionTitle("kilometerstand", "en"), "Mileage and NAP");
  assert.equal(pdfSectionTitle("schade", "nl"), "Risicos en schade");
});
