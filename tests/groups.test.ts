import test from "node:test";
import assert from "node:assert/strict";
import { GROUPS } from "../lib/vehicle/groups";
import type { GroupDef, GroupId, ReportSectionId } from "../lib/vehicle/groups";

test("GROUPS has exactly the nine ids in order", () => {
  const ids = GROUPS.map((g) => g.id);
  assert.deepEqual(ids, [
    "g1-overzicht",
    "g2-oordeel",
    "g3-markt",
    "g4-tekoop",
    "g5-schatting",
    "g6-risico",
    "g7-km",
    "g8-apk",
    "g9-eigendom"
  ]);
});

test("GROUPS labels are exact NL and EN strings", () => {
  const byId = (id: GroupId) => GROUPS.find((g) => g.id === id) as GroupDef;
  assert.equal(byId("g1-overzicht").labelNl, "Voertuig & kerngegevens");
  assert.equal(byId("g1-overzicht").labelEn, "Vehicle & key data");
  assert.equal(byId("g2-oordeel").labelNl, "Oordeel & inzicht");
  assert.equal(byId("g2-oordeel").labelEn, "Verdict & insight");
  assert.equal(byId("g3-markt").labelNl, "Marktwaarde");
  assert.equal(byId("g3-markt").labelEn, "Market value");
  assert.equal(byId("g4-tekoop").labelNl, "Vergelijkbaar aanbod");
  assert.equal(byId("g4-tekoop").labelEn, "Comparable listings");
  assert.equal(byId("g5-schatting").labelNl, "Schatting & risico");
  assert.equal(byId("g5-schatting").labelEn, "Estimate & risk");
  assert.equal(byId("g6-risico").labelNl, "Risico's & schade");
  assert.equal(byId("g6-risico").labelEn, "Risks & damage");
  assert.equal(byId("g7-km").labelNl, "Kilometerstand & NAP");
  assert.equal(byId("g7-km").labelEn, "Mileage & NAP");
  assert.equal(byId("g8-apk").labelNl, "APK-historie + statistiek");
  assert.equal(byId("g8-apk").labelEn, "MOT history + statistics");
  assert.equal(byId("g9-eigendom").labelNl, "Eigendom & voertuiggegevens");
  assert.equal(byId("g9-eigendom").labelEn, "Ownership & vehicle data");
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
  assert.equal(byId("g1-overzicht").lockKey, null);
  assert.equal(byId("g2-oordeel").lockKey, "riskOverview");
  assert.equal(byId("g3-markt").lockKey, "marketAnalysis");
  assert.equal(byId("g4-tekoop").lockKey, "marketAnalysis");
  assert.equal(byId("g5-schatting").lockKey, "marketAnalysis");
  assert.equal(byId("g6-risico").lockKey, "damageHistory");
  assert.equal(byId("g7-km").lockKey, "mileageHistory");
  assert.equal(byId("g8-apk").lockKey, "inspectionTimeline");
  assert.equal(byId("g9-eigendom").lockKey, "ownershipHistory");
});

test("GROUPS defaultOpen: g1/g2/g3/g4 open, g5-g9 collapsed", () => {
  const byId = (id: GroupId) => GROUPS.find((g) => g.id === id) as GroupDef;
  assert.equal(byId("g1-overzicht").defaultOpen, true);
  assert.equal(byId("g2-oordeel").defaultOpen, true);
  assert.equal(byId("g3-markt").defaultOpen, true);
  assert.equal(byId("g4-tekoop").defaultOpen, true);
  assert.equal(byId("g5-schatting").defaultOpen, false);
  assert.equal(byId("g6-risico").defaultOpen, false);
  assert.equal(byId("g7-km").defaultOpen, false);
  assert.equal(byId("g8-apk").defaultOpen, false);
  assert.equal(byId("g9-eigendom").defaultOpen, false);
});

test("GROUPS sectionIds match the locked contract", () => {
  const byId = (id: GroupId) => GROUPS.find((g) => g.id === id) as GroupDef;
  assert.deepEqual(byId("g1-overzicht").sectionIds, ["overzicht"]);
  assert.deepEqual(byId("g2-oordeel").sectionIds, ["ai-analyse"]);
  assert.deepEqual(byId("g3-markt").sectionIds, ["markt"]);
  assert.deepEqual(byId("g4-tekoop").sectionIds, ["te-koop"]);
  assert.deepEqual(byId("g5-schatting").sectionIds, ["schatting"]);
  assert.deepEqual(byId("g6-risico").sectionIds, ["schade"]);
  assert.deepEqual(byId("g7-km").sectionIds, ["kilometerstand"]);
  assert.deepEqual(byId("g8-apk").sectionIds, ["apk", "apk-intelligence"]);
  assert.deepEqual(byId("g9-eigendom").sectionIds, ["eigendom", "specs"]);
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
