import test from "node:test";
import assert from "node:assert/strict";
import { computeVehicleSignals } from "../lib/vehicle/signals";
import type { SignalInput } from "../lib/vehicle/signals";
import type { VehicleProfile } from "../lib/rdw/types";
import type { EnrichedData } from "../lib/rdw/heuristics";

// Fixed "now" = 2026-06-14T00:00:00Z so APK date math is deterministic.
const BASE_NOW = Date.UTC(2026, 5, 14);
const DAY = 24 * 60 * 60 * 1000;

function isoDaysFromBase(days: number): string {
  return new Date(BASE_NOW + days * DAY).toISOString().slice(0, 10);
}

type VehicleFields = Partial<VehicleProfile["vehicle"]>;

function makeEnriched(over: Partial<EnrichedData> = {}): EnrichedData {
  return {
    ageInMonths: null,
    ageString: null,
    isImported: false,
    maintenanceRiskScore: 4,
    estimatedValueNow: null,
    estimatedValueMin: null,
    estimatedValueMax: null,
    estimatedValueNextYear: null,
    marketValueConfidence: null,
    marketValueSe: null,
    estimatedMileageNow: null,
    estimatedMileageMin: null,
    estimatedMileageMax: null,
    mileageVerdict: "UNKNOWN",
    mileageUsageProfile: null,
    mileageSlopeKmPerYear: null,
    mileageAnomalies: [],
    apkPassChance: 85,
    repairChances: [],
    roadTaxEstQuarter: null,
    insuranceEstMonth: null,
    fuelEstMonth: null,
    knownIssues: [],
    ...over
  };
}

function makeProfile(
  vehicle: VehicleFields = {},
  opts: { enriched?: Partial<EnrichedData> | null; defects?: unknown[] } = {}
): VehicleProfile {
  const v = {
    wok: false,
    transferPossible: true,
    isTaxi: false,
    hasOpenRecall: false,
    recallsCount: 0,
    apkExpiryDate: isoDaysFromBase(365),
    napVerdict: "Logisch" as string | null,
    ...vehicle
  };
  const profile = {
    plate: "TEST01",
    displayPlate: "TEST-01",
    fromCache: false,
    enriched: opts.enriched === null ? undefined : makeEnriched(opts.enriched ?? {}),
    vehicle: v,
    inspections: [],
    defects: opts.defects ?? [],
    defectDescriptions: {},
    recalls: [],
    typeApprovals: [],
    raw: {
      main: [],
      fuel: [],
      apk: [],
      defects: [],
      recalls: [],
      body: [],
      typeApprovals: []
    }
  };
  return profile as unknown as VehicleProfile;
}

function input(
  profile: VehicleProfile,
  over: Partial<Omit<SignalInput, "profile">> = {}
): SignalInput {
  return { profile, nowMs: BASE_NOW, hasAccess: false, ...over };
}

test("clean car: all signals ok, no alerts, verdict ok", () => {
  const report = computeVehicleSignals(input(makeProfile()));

  const tones = Object.fromEntries(report.signals.map((s) => [s.key, s.tone]));
  assert.equal(tones.safety, "ok");
  assert.equal(tones.mileage, "ok");
  assert.equal(tones.apk, "ok");

  assert.equal(report.verdict.tone, "ok");
  assert.equal(report.verdict.headingNl, "Geen alarmsignalen gevonden");
  assert.equal(report.alerts.length, 0);

  assert.equal(report.summary.checked, 3);
  assert.equal(report.summary.needAttention, 0);
  assert.equal(report.summary.priceAffecting, 0);
});

test("clean car: no signal label or sub contains em-dash or en-dash", () => {
  const report = computeVehicleSignals(input(makeProfile()));
  const strings = report.signals.flatMap((s) => [s.labelNl, s.labelEn, s.subNl, s.subEn]);
  for (const s of strings) {
    assert.equal(s.includes("—"), false);
    assert.equal(s.includes("–"), false);
  }
});

test("clean car: fairPrice not included when no access", () => {
  const report = computeVehicleSignals(input(makeProfile()));
  assert.equal(report.signals.some((s) => s.key === "fairPrice"), false);
});

test("wok: danger safety + danger apk + verdict danger + wok/apk alerts", () => {
  const report = computeVehicleSignals(input(makeProfile({ wok: true })));
  const tones = Object.fromEntries(report.signals.map((s) => [s.key, s.tone]));
  assert.equal(tones.safety, "danger");
  assert.equal(tones.apk, "danger");
  assert.equal(report.verdict.tone, "danger");
  assert.equal(report.verdict.headingNl, "Pas op: serieuze aandachtspunten");
  assert.equal(report.alerts.some((a) => a.key === "wok" && a.tone === "danger" && a.group === "g8-apk"), true);
  // wok also makes the apk tone danger -> APK verloopt soon/expired may or may not fire;
  // the apkExpiryDate fixture is 365 days out, so no apk date alert, only the wok alert.
  assert.equal(report.alerts.some((a) => a.key === "apkExpired"), false);
  assert.equal(report.summary.priceAffecting >= 1, true); // v.wok counts
});

test("CONTRACT-NOTE transferPossible===false is danger (mapper bool: false = not possible)", () => {
  const report = computeVehicleSignals(input(makeProfile({ transferPossible: false })));
  const safety = report.signals.find((s) => s.key === "safety");
  assert.equal(safety?.tone, "danger");
  assert.equal(
    report.alerts.some((a) => a.key === "transferBlocked" && a.tone === "danger" && a.group === "g6-risico"),
    true
  );
});

test("CONTRACT-NOTE hasOpenRecall===true is warn (mapper notBool does NOT invert)", () => {
  // mapper.ts ln 17-21: notBool() body equals bool(); returns true for "Ja".
  // So hasOpenRecall:true means a recall is genuinely open -> warn, not ok.
  const report = computeVehicleSignals(input(makeProfile({ hasOpenRecall: true })));
  const safety = report.signals.find((s) => s.key === "safety");
  assert.equal(safety?.tone, "warn");
  assert.equal(report.alerts.some((a) => a.key === "openRecall" && a.tone === "warn"), true);
});

test("recallsCount > 0 also triggers warn safety + openRecall alert", () => {
  const report = computeVehicleSignals(input(makeProfile({ recallsCount: 2 })));
  assert.equal(report.signals.find((s) => s.key === "safety")?.tone, "warn");
  assert.equal(report.alerts.some((a) => a.key === "openRecall"), true);
});

test("isTaxi triggers warn safety + taxi alert in g6-risico", () => {
  const report = computeVehicleSignals(input(makeProfile({ isTaxi: true })));
  assert.equal(report.signals.find((s) => s.key === "safety")?.tone, "warn");
  assert.equal(report.alerts.some((a) => a.key === "taxi" && a.group === "g6-risico"), true);
});

test("defects present triggers warn safety", () => {
  const report = computeVehicleSignals(input(makeProfile({}, { defects: [{ x: 1 }] })));
  assert.equal(report.signals.find((s) => s.key === "safety")?.tone, "warn");
});

test("napVerdict Onlogisch: danger mileage + napImplausible alert + priceAffecting", () => {
  const report = computeVehicleSignals(input(makeProfile({ napVerdict: "Onlogisch" })));
  assert.equal(report.signals.find((s) => s.key === "mileage")?.tone, "danger");
  assert.equal(report.alerts.some((a) => a.key === "napImplausible" && a.tone === "danger" && a.group === "g7-km"), true);
  assert.equal(report.summary.priceAffecting >= 1, true); // mileageTone !== ok
});

test("napVerdict EN Implausible token is treated as danger", () => {
  const report = computeVehicleSignals(input(makeProfile({ napVerdict: "Implausible" })));
  assert.equal(report.signals.find((s) => s.key === "mileage")?.tone, "danger");
  assert.equal(report.alerts.some((a) => a.key === "napImplausible"), true);
});

test("napVerdict null: warn mileage + napNoVerdict alert", () => {
  const report = computeVehicleSignals(input(makeProfile({ napVerdict: null })));
  assert.equal(report.signals.find((s) => s.key === "mileage")?.tone, "warn");
  assert.equal(report.alerts.some((a) => a.key === "napNoVerdict" && a.tone === "warn"), true);
});

test('napVerdict "Geen oordeel" and EN "No verdict": warn mileage', () => {
  const nl = computeVehicleSignals(input(makeProfile({ napVerdict: "Geen oordeel" })));
  assert.equal(nl.signals.find((s) => s.key === "mileage")?.tone, "warn");
  const en = computeVehicleSignals(input(makeProfile({ napVerdict: "No verdict" })));
  assert.equal(en.signals.find((s) => s.key === "mileage")?.tone, "warn");
});

test("enriched.mileageVerdict TWIJFELACHTIG: warn mileage even when nap Logisch", () => {
  const report = computeVehicleSignals(
    input(makeProfile({ napVerdict: "Logisch" }, { enriched: { mileageVerdict: "TWIJFELACHTIG" } }))
  );
  assert.equal(report.signals.find((s) => s.key === "mileage")?.tone, "warn");
});

test("napVerdict EN Plausible token is ok", () => {
  const report = computeVehicleSignals(input(makeProfile({ napVerdict: "Plausible" })));
  assert.equal(report.signals.find((s) => s.key === "mileage")?.tone, "ok");
});

test("apk expired (yesterday): danger apk + apkExpired alert + verdict danger", () => {
  const report = computeVehicleSignals(input(makeProfile({ apkExpiryDate: isoDaysFromBase(-1) })));
  assert.equal(report.signals.find((s) => s.key === "apk")?.tone, "danger");
  assert.equal(report.alerts.some((a) => a.key === "apkExpired" && a.tone === "danger" && a.group === "g8-apk"), true);
  assert.equal(report.verdict.tone, "danger");
});

test("apk soon (within 30 days): warn apk + apkSoon alert", () => {
  const report = computeVehicleSignals(input(makeProfile({ apkExpiryDate: isoDaysFromBase(15) })));
  assert.equal(report.signals.find((s) => s.key === "apk")?.tone, "warn");
  assert.equal(report.alerts.some((a) => a.key === "apkSoon" && a.tone === "warn"), true);
});

test("apk valid (well beyond 30 days): ok apk + no apk date alert", () => {
  const report = computeVehicleSignals(input(makeProfile({ apkExpiryDate: isoDaysFromBase(200) })));
  assert.equal(report.signals.find((s) => s.key === "apk")?.tone, "ok");
  assert.equal(report.alerts.some((a) => a.key === "apkExpired" || a.key === "apkSoon"), false);
});

test("apk null expiry: warn apk", () => {
  const report = computeVehicleSignals(input(makeProfile({ apkExpiryDate: null })));
  assert.equal(report.signals.find((s) => s.key === "apk")?.tone, "warn");
});

test("import: warn safety + g6 import status + imported alert + priceAffecting", () => {
  const report = computeVehicleSignals(input(makeProfile({}, { enriched: { isImported: true } })));
  assert.equal(report.signals.find((s) => s.key === "safety")?.tone, "warn");
  assert.equal(report.groupStatus["g9-eigendom"].tone, "warn");
  assert.equal(report.groupStatus["g9-eigendom"].labelNl, "Geimporteerd, controleer papieren");
  assert.equal(report.alerts.some((a) => a.key === "imported" && a.group === "g9-eigendom"), true);
  assert.equal(report.summary.priceAffecting >= 1, true); // isImported counts
});

test("fairPrice signal included only when hasAccess AND estimatedValueNow present", () => {
  // hasAccess true but no value -> excluded
  const noValue = computeVehicleSignals(
    input(makeProfile({}, { enriched: { estimatedValueNow: null } }), { hasAccess: true })
  );
  assert.equal(noValue.signals.some((s) => s.key === "fairPrice"), false);

  // value present but no access -> excluded
  const noAccess = computeVehicleSignals(
    input(makeProfile({}, { enriched: { estimatedValueNow: 12000 } }), { hasAccess: false })
  );
  assert.equal(noAccess.signals.some((s) => s.key === "fairPrice"), false);

  // both -> included, tone ok, correct copy + group + affectsPrice
  const both = computeVehicleSignals(
    input(makeProfile({}, { enriched: { estimatedValueNow: 12000 } }), { hasAccess: true })
  );
  const fp = both.signals.find((s) => s.key === "fairPrice");
  assert.ok(fp);
  assert.equal(fp?.tone, "ok");
  assert.equal(fp?.labelNl, "Marktwaarde berekend");
  assert.equal(fp?.subNl, "vul je vraagprijs in voor een prijsoordeel");
  assert.equal(fp?.group, "g3-markt");
  assert.equal(fp?.affectsPrice, true);
});

test("fairPrice is excluded from summary.checked (always 3)", () => {
  const report = computeVehicleSignals(
    input(makeProfile({}, { enriched: { estimatedValueNow: 12000 } }), { hasAccess: true })
  );
  assert.equal(report.summary.checked, 3);
});

test("summary.needAttention counts safety/mileage/apk with tone !== ok", () => {
  // import (warn safety) + nap null (warn mileage) + apk soon (warn apk) = 3
  const report = computeVehicleSignals(
    input(
      makeProfile({ napVerdict: null, apkExpiryDate: isoDaysFromBase(10) }, { enriched: { isImported: true } })
    )
  );
  assert.equal(report.summary.needAttention, 3);
});

test("summary.priceAffecting counts isImported + mileage!=ok + wok", () => {
  // import + nap onlogisch + wok = all three truthy -> 3
  const report = computeVehicleSignals(
    input(makeProfile({ napVerdict: "Onlogisch", wok: true }, { enriched: { isImported: true } }))
  );
  assert.equal(report.summary.priceAffecting, 3);
});

test("verdict warn singular vs plural punt/punten copy", () => {
  // exactly one warn (apk soon, nap Logisch, no safety triggers) -> "1 punt"
  const one = computeVehicleSignals(input(makeProfile({ apkExpiryDate: isoDaysFromBase(10) })));
  assert.equal(one.verdict.tone, "warn");
  assert.equal(one.verdict.headingNl, "Redelijke koop, let op 1 punt");
  assert.equal(one.verdict.headingEn, "Reasonable buy, watch 1 point");

  // two warns (import warn safety + nap null warn mileage) -> "2 punten"
  const two = computeVehicleSignals(
    input(makeProfile({ napVerdict: null }, { enriched: { isImported: true } }))
  );
  assert.equal(two.verdict.tone, "warn");
  assert.equal(two.verdict.headingNl, "Redelijke koop, let op 2 punten");
  assert.equal(two.verdict.headingEn, "Reasonable buy, watch 2 points");
});

test("verdict tone is worst of safety/mileage/apk (danger beats warn)", () => {
  // warn safety (import) + danger mileage (onlogisch) -> danger
  const report = computeVehicleSignals(
    input(makeProfile({ napVerdict: "Onlogisch" }, { enriched: { isImported: true } }))
  );
  assert.equal(report.verdict.tone, "danger");
});

test("groupStatus has all nine group ids present", () => {
  const report = computeVehicleSignals(input(makeProfile()));
  const ids = Object.keys(report.groupStatus).sort();
  assert.deepEqual(ids, ["g1-overzicht", "g2-oordeel", "g3-markt", "g4-tekoop", "g5-schatting", "g6-risico", "g7-km", "g8-apk", "g9-eigendom"]);
});

test("groupStatus g2 mirrors verdict; g3 reflects access; g6/g7/g8 mirror signals", () => {
  const report = computeVehicleSignals(input(makeProfile()));
  assert.equal(report.groupStatus["g2-oordeel"].tone, report.verdict.tone);
  assert.equal(report.groupStatus["g2-oordeel"].labelNl, report.verdict.headingNl);

  // no access -> g3 unlock prompt
  assert.equal(report.groupStatus["g3-markt"].labelNl, "Ontgrendel de marktwaarde-analyse");

  assert.equal(report.groupStatus["g6-risico"].tone, report.signals.find((s) => s.key === "safety")?.tone);
  assert.equal(report.groupStatus["g7-km"].tone, report.signals.find((s) => s.key === "mileage")?.tone);
  assert.equal(report.groupStatus["g8-apk"].tone, report.signals.find((s) => s.key === "apk")?.tone);
});

test("groupStatus g3 reads 'Marktwaarde berekend' when hasAccess AND estimatedValueNow present", () => {
  const report = computeVehicleSignals(
    input(makeProfile({}, { enriched: { estimatedValueNow: 12000 } }), { hasAccess: true })
  );
  assert.equal(report.groupStatus["g3-markt"].labelNl, "Marktwaarde berekend");
});

test("groupStatus g3 reads unlock label when hasAccess but estimatedValueNow is null", () => {
  const report = computeVehicleSignals(
    input(makeProfile({}, { enriched: { estimatedValueNow: null } }), { hasAccess: true })
  );
  assert.equal(report.groupStatus["g3-markt"].labelNl, "Ontgrendel de marktwaarde-analyse");
});

test("clean car: groupStatus g9 reads RDW data complete (not imported)", () => {
  const report = computeVehicleSignals(input(makeProfile()));
  assert.equal(report.groupStatus["g9-eigendom"].tone, "ok");
  assert.equal(report.groupStatus["g9-eigendom"].labelNl, "RDW-voertuiggegevens compleet");
});

test("no alert label across the suite contains em-dash or en-dash", () => {
  const profiles = [
    makeProfile({ wok: true }),
    makeProfile({ transferPossible: false }),
    makeProfile({ hasOpenRecall: true }),
    makeProfile({ isTaxi: true, napVerdict: null, apkExpiryDate: isoDaysFromBase(-1) }, { enriched: { isImported: true } })
  ];
  for (const p of profiles) {
    const report = computeVehicleSignals(input(p));
    for (const a of report.alerts) {
      assert.equal(a.labelNl.includes("—"), false);
      assert.equal(a.labelNl.includes("–"), false);
      assert.equal(a.labelEn.includes("—"), false);
      assert.equal(a.labelEn.includes("–"), false);
    }
  }
});

// C1: ONLOGISCH mileage verdict (our own rollback detection) must be treated as danger.
test("C1a: enriched.mileageVerdict ONLOGISCH with napVerdict Logisch -> mileage danger + danger alert + verdict danger", () => {
  const report = computeVehicleSignals(
    input(makeProfile({ napVerdict: "Logisch" }, { enriched: { mileageVerdict: "ONLOGISCH" } }))
  );
  assert.equal(report.signals.find((s) => s.key === "mileage")?.tone, "danger");
  assert.equal(
    report.alerts.some((a) => a.key === "napImplausible" && a.tone === "danger" && a.group === "g7-km"),
    true
  );
  assert.equal(report.verdict.tone, "danger");
});

test("C1b: enriched.mileageVerdict TWIJFELACHTIG with napVerdict Logisch -> mileage warn + warn alert", () => {
  const report = computeVehicleSignals(
    input(makeProfile({ napVerdict: "Logisch" }, { enriched: { mileageVerdict: "TWIJFELACHTIG" } }))
  );
  assert.equal(report.signals.find((s) => s.key === "mileage")?.tone, "warn");
  assert.equal(
    report.alerts.some((a) => a.key === "napNoVerdict" && a.tone === "warn" && a.group === "g7-km"),
    true
  );
});

// m4: APK expiry equals exactly "today" (expiry === nowMs).
// The condition is expiry < nowMs (strict less-than), so equal means NOT expired yet.
// With no other triggers, expiry - nowMs = 0 which is <= 30 * DAY_MS -> warn.
test("m4: apkExpiryDate equals today (expiry === nowMs) -> warn apk (within 30-day window)", () => {
  const todayIso = new Date(BASE_NOW).toISOString().slice(0, 10);
  const report = computeVehicleSignals(input(makeProfile({ apkExpiryDate: todayIso })));
  assert.equal(report.signals.find((s) => s.key === "apk")?.tone, "warn");
});

// m2: enriched: null (absent enriched) must not throw and must yield sane defaults.
test("m2: enriched absent (null) -> report produced without throwing, sane defaults", () => {
  const report = computeVehicleSignals(input(makeProfile({}, { enriched: null })));
  assert.ok(report, "report should be defined");
  assert.equal(typeof report.verdict.tone, "string");
  assert.equal(report.summary.checked, 3);
  assert.equal(report.signals.find((s) => s.key === "safety")?.tone, "ok");
  assert.equal(report.signals.find((s) => s.key === "mileage")?.tone, "ok");
  assert.equal(report.signals.some((s) => s.key === "fairPrice"), false);
  assert.equal(report.groupStatus["g9-eigendom"].labelNl, "RDW-voertuiggegevens compleet");
});
