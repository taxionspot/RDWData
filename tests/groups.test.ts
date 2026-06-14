import test from "node:test";
import assert from "node:assert/strict";
import { GROUPS } from "../lib/vehicle/groups";
import type { GroupDef, GroupId, ReportSectionId } from "../lib/vehicle/groups";

test("GROUPS has exactly the six locked ids in order", () => {
  const ids = GROUPS.map((g) => g.id);
  assert.deepEqual(ids, [
    "g1-verdict",
    "g2-markt",
    "g3-risico",
    "g4-km",
    "g5-apk",
    "g6-voertuig"
  ]);
});

test("GROUPS labels are exact NL and EN strings", () => {
  const byId = (id: GroupId) => GROUPS.find((g) => g.id === id) as GroupDef;
  assert.equal(byId("g1-verdict").labelNl, "Overzicht & oordeel");
  assert.equal(byId("g1-verdict").labelEn, "Overview & verdict");
  assert.equal(byId("g2-markt").labelNl, "Marktwaarde & eerlijke prijs");
  assert.equal(byId("g2-markt").labelEn, "Market value & fair price");
  assert.equal(byId("g3-risico").labelNl, "Risicos & schade");
  assert.equal(byId("g3-risico").labelEn, "Risks & damage");
  assert.equal(byId("g4-km").labelNl, "Kilometerstand & NAP");
  assert.equal(byId("g4-km").labelEn, "Mileage & NAP");
  assert.equal(byId("g5-apk").labelNl, "APK-historie & rijwaardigheid");
  assert.equal(byId("g5-apk").labelEn, "MOT history & roadworthiness");
  assert.equal(byId("g6-voertuig").labelNl, "Eigendom & voertuiggegevens");
  assert.equal(byId("g6-voertuig").labelEn, "Ownership & vehicle data");
});

test("GROUPS labels contain no em-dash or en-dash", () => {
  for (const g of GROUPS) {
    assert.equal(g.labelNl.includes("—"), false, `${g.id} labelNl has em-dash`);
    assert.equal(g.labelNl.includes("–"), false, `${g.id} labelNl has en-dash`);
    assert.equal(g.labelEn.includes("—"), false, `${g.id} labelEn has em-dash`);
    assert.equal(g.labelEn.includes("–"), false, `${g.id} labelEn has en-dash`);
  }
});

test("GROUPS lockKeys match the locked contract", () => {
  const byId = (id: GroupId) => GROUPS.find((g) => g.id === id) as GroupDef;
  assert.equal(byId("g1-verdict").lockKey, null);
  assert.equal(byId("g2-markt").lockKey, "marketAnalysis");
  assert.equal(byId("g3-risico").lockKey, "damageHistory");
  assert.equal(byId("g4-km").lockKey, "mileageHistory");
  assert.equal(byId("g5-apk").lockKey, "inspectionTimeline");
  assert.equal(byId("g6-voertuig").lockKey, "ownershipHistory");
});

test("GROUPS defaultOpen: g1 and g2 open, g3-g6 collapsed", () => {
  const byId = (id: GroupId) => GROUPS.find((g) => g.id === id) as GroupDef;
  assert.equal(byId("g1-verdict").defaultOpen, true);
  assert.equal(byId("g2-markt").defaultOpen, true);
  assert.equal(byId("g3-risico").defaultOpen, false);
  assert.equal(byId("g4-km").defaultOpen, false);
  assert.equal(byId("g5-apk").defaultOpen, false);
  assert.equal(byId("g6-voertuig").defaultOpen, false);
});

test("GROUPS sectionIds match the locked contract", () => {
  const byId = (id: GroupId) => GROUPS.find((g) => g.id === id) as GroupDef;
  assert.deepEqual(byId("g1-verdict").sectionIds, ["overzicht", "ai-analyse"]);
  assert.deepEqual(byId("g2-markt").sectionIds, ["markt", "te-koop"]);
  assert.deepEqual(byId("g3-risico").sectionIds, ["schade"]);
  assert.deepEqual(byId("g4-km").sectionIds, ["kilometerstand"]);
  assert.deepEqual(byId("g5-apk").sectionIds, ["apk", "apk-intelligence"]);
  assert.deepEqual(byId("g6-voertuig").sectionIds, ["eigendom", "specs"]);
});

test('the dropped "risico" sectionId is absent from every group', () => {
  const allSectionIds = GROUPS.flatMap((g) => g.sectionIds);
  assert.equal(allSectionIds.includes("risico" as ReportSectionId), false);
});

test("no sectionId appears in more than one group", () => {
  const allSectionIds = GROUPS.flatMap((g) => g.sectionIds);
  const unique = new Set(allSectionIds);
  assert.equal(unique.size, allSectionIds.length);
});
