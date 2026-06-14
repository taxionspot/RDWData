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
