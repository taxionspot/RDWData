## Phase 0 — Foundation: signals.ts + groups.ts (pure, TDD)

**Goal:** Build the two pure, deterministic, React-free foundation modules that the entire A-hybrid redesign hangs on: `lib/vehicle/groups.ts` (the locked group taxonomy that drives nav, accordions and the per-group lock chips) and `lib/vehicle/signals.ts` (the locked `computeVehicleSignals` engine that the server attaches to the vehicle API JSON and that BOTH the web JudgmentBlock and the PDF reuse). Everything is computed on the RAW pre-localization `VehicleProfile` with `nowMs` injected as a parameter (no `Date.now()`/`Math.random()` at module level, so there is zero hydration risk). This phase ships nothing user-visible: it only lands the two modules plus a thorough unit-test suite, all green.

**Files touched:**
- `lib/vehicle/groups.ts` (NEW)
- `lib/vehicle/signals.ts` (NEW)
- `tests/groups.test.ts` (NEW)
- `tests/signals.test.ts` (NEW)
- `tsconfig.test.json` (MODIFY: add the two new lib files to the `include` allowlist)

**Pre-read findings these tasks rely on (cited from the real files):**
- `lib/rdw/mapper.ts` ln 13-21: `notBool()` is a misnomer. Its body is byte-for-byte identical to `bool()` (returns `true` for `"ja"/"j"/true/"yes"`). It does NOT invert. The comment on ln 18 ("means NO open recall") is wrong/stale.
- `lib/rdw/mapper.ts` ln 227: `hasOpenRecall: notBool(m.openstaande_terugroepactie_indicator)` therefore equals `true` exactly when the RDW indicator is "Ja" (an open recall really exists). Treating `hasOpenRecall===true` as a warn signal is CORRECT.
- `lib/rdw/mapper.ts` ln 224: `transferPossible: bool(m.tenaamstellen_mogelijk)` equals `true` when "Ja". So `transferPossible===false` genuinely means "tenaamstelling niet mogelijk" and is a real danger. Semantics are sound; we wire it as a danger driver (with a documentation test, see Task 0.4).
- `lib/rdw/mapper.ts` ln 223: `wok: bool(m.wacht_op_keuren)` -> `true` when WOK active.
- `lib/rdw/types.ts` ln 82: `napVerdict: string | null` with NL tokens `"Logisch" | "Onlogisch" | "Geen oordeel"`.
- `lib/i18n/vehicle.ts` ln 27-31: EN tokens are `Logisch->"Plausible"`, `Onlogisch->"Implausible"`, `"Geen oordeel"->"No verdict"`.
- `lib/rdw/heuristics.ts` ln 6 + ln 30: `enriched.mileageVerdict: MileageVerdict = "LOGISCH" | "TWIJFELACHTIG" | "ONLOGISCH" | "UNKNOWN"`; `enriched.isImported: boolean` (ln 17); `enriched.estimatedValueNow: number | null` (ln 20).
- `lib/site-settings/defaults.ts` ln 7-17: `PublicSiteSettings["lockSections"]` keys include `marketAnalysis`, `damageHistory`, `mileageHistory`, `inspectionTimeline`, `ownershipHistory` (the five group lockKeys we use), plus `riskOverview`, `vehicleComparison`, `technicalSpecs`, `reportDownload`.
- `tests/mapper.test.ts` ln 1-4: the test idiom is `import test from "node:test"; import assert from "node:assert/strict"; import { fn } from "../lib/...";`.
- `tsconfig.test.json` ln 19-26: `include` is an explicit allowlist; a new lib file is invisible to the test compiler unless added.

---

### Task 0.1: Add the two new lib files to the test-compiler allowlist

**Files:** `tsconfig.test.json`

`tsconfig.test.json` ln 19-26 is an explicit `include` allowlist; `tsc -p tsconfig.test.json` will not compile `lib/vehicle/groups.ts` or `lib/vehicle/signals.ts` (and the tests that import them will fail to build) unless we list them. We add both now so the later test runs can compile. `groups.ts` and `signals.ts` import only types from existing-and-already-included modules (`../site-settings/defaults`, `../rdw/types`) plus the local `./groups`, so the build stays small.

- [ ] Edit `tsconfig.test.json`. Replace the `include` array (currently ln 19-26):

```json
  "include": [
    "tests/**/*.ts",
    "lib/api/api-error.ts",
    "lib/api/plate.ts",
    "lib/rdw/normalize.ts",
    "lib/rdw/mapper.ts",
    "lib/rdw/types.ts"
  ],
```

with:

```json
  "include": [
    "tests/**/*.ts",
    "lib/api/api-error.ts",
    "lib/api/plate.ts",
    "lib/rdw/normalize.ts",
    "lib/rdw/mapper.ts",
    "lib/rdw/types.ts",
    "lib/vehicle/groups.ts",
    "lib/vehicle/signals.ts"
  ],
```

- [ ] Commit:

```bash
git -C "C:/Users/Sabur/sites/kentekenrapport" add tsconfig.test.json
git -C "C:/Users/Sabur/sites/kentekenrapport" commit -m "$(cat <<'EOF'
test(config): allow lib/vehicle/{groups,signals}.ts in test compiler

Foundation for the A-hybrid report redesign: the signals + groups
modules are unit-tested, so they must be in the tsconfig.test.json
include allowlist.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 0.2: Failing test for `lib/vehicle/groups.ts` (locked GROUPS contract)

**Files:** `tests/groups.test.ts` (NEW)

Write the test FIRST. It asserts the exact ids, order, labels, lockKeys, defaultOpen flags and sectionIds of the locked `GROUPS` array, and that the dropped `"risico"` sectionId appears in NO group. This compiles against a `lib/vehicle/groups.ts` that does not exist yet, so both `tsc` and the test will fail.

- [ ] Create `tests/groups.test.ts`:

```ts
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
```

- [ ] Run it and confirm it FAILS to compile (module does not exist yet):

```bash
npm --prefix "C:/Users/Sabur/sites/kentekenrapport" test
```

Expected: `tsc -p tsconfig.test.json` errors with `error TS2307: Cannot find module '../lib/vehicle/groups' or its corresponding type declarations.` (node --test never runs). This is the expected RED.

---

### Task 0.3: Implement `lib/vehicle/groups.ts` (make 0.2 pass)

**Files:** `lib/vehicle/groups.ts` (NEW)

Minimal implementation of the locked contract. Pure data, no React, type-only import of `PublicSiteSettings` from `../site-settings/defaults`. Note the apostrophe in "Risicos" is a plain ASCII apostrophe (no em-dash), per the contract note.

- [ ] Create `lib/vehicle/groups.ts`:

```ts
import type { PublicSiteSettings } from "../site-settings/defaults";

export type GroupId =
  | "g1-verdict"
  | "g2-markt"
  | "g3-risico"
  | "g4-km"
  | "g5-apk"
  | "g6-voertuig";

export type ReportSectionId =
  | "overzicht"
  | "ai-analyse"
  | "markt"
  | "te-koop"
  | "kilometerstand"
  | "apk"
  | "risico"
  | "schade"
  | "eigendom"
  | "apk-intelligence"
  | "specs"
  | "acties";

export type GroupDef = {
  id: GroupId;
  labelNl: string;
  labelEn: string;
  lockKey: keyof PublicSiteSettings["lockSections"] | null;
  defaultOpen: boolean;
  sectionIds: ReportSectionId[];
};

export const GROUPS: GroupDef[] = [
  {
    id: "g1-verdict",
    labelNl: "Overzicht & oordeel",
    labelEn: "Overview & verdict",
    lockKey: null,
    defaultOpen: true,
    sectionIds: ["overzicht", "ai-analyse"]
  },
  {
    id: "g2-markt",
    labelNl: "Marktwaarde & eerlijke prijs",
    labelEn: "Market value & fair price",
    lockKey: "marketAnalysis",
    defaultOpen: true,
    sectionIds: ["markt", "te-koop"]
  },
  {
    id: "g3-risico",
    labelNl: "Risicos & schade",
    labelEn: "Risks & damage",
    lockKey: "damageHistory",
    defaultOpen: false,
    sectionIds: ["schade"]
  },
  {
    id: "g4-km",
    labelNl: "Kilometerstand & NAP",
    labelEn: "Mileage & NAP",
    lockKey: "mileageHistory",
    defaultOpen: false,
    sectionIds: ["kilometerstand"]
  },
  {
    id: "g5-apk",
    labelNl: "APK-historie & rijwaardigheid",
    labelEn: "MOT history & roadworthiness",
    lockKey: "inspectionTimeline",
    defaultOpen: false,
    sectionIds: ["apk", "apk-intelligence"]
  },
  {
    id: "g6-voertuig",
    labelNl: "Eigendom & voertuiggegevens",
    labelEn: "Ownership & vehicle data",
    lockKey: "ownershipHistory",
    defaultOpen: false,
    sectionIds: ["eigendom", "specs"]
  }
];
```

- [ ] Run the test and confirm GREEN for the groups suite:

```bash
npm --prefix "C:/Users/Sabur/sites/kentekenrapport" test
```

Expected: `tsc` compiles clean and node --test prints all 8 `groups.test.ts` cases as `ok` (`# pass 8` for that file; the existing `mapper.test.ts` also passes).

- [ ] Commit:

```bash
git -C "C:/Users/Sabur/sites/kentekenrapport" add lib/vehicle/groups.ts tests/groups.test.ts
git -C "C:/Users/Sabur/sites/kentekenrapport" commit -m "$(cat <<'EOF'
feat(vehicle): add locked GROUPS taxonomy (groups.ts) with tests

Six report groups (g1-verdict..g6-voertuig) with NL/EN labels,
per-group lockKey, defaultOpen and sectionIds. Drops the old
"risico" sectionId. Pure data, no React, type-only settings import.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 0.4: Failing test scaffold + clean-car case for `lib/vehicle/signals.ts`

**Files:** `tests/signals.test.ts` (NEW)

Write the failing test first. This task lands the shared fixture helper and the simplest case (a clean car: all signals ok, empty alerts, verdict ok, summary counts). It compiles against a not-yet-existing `lib/vehicle/signals.ts`, so it is RED.

The fixture builds a minimal object cast as `VehicleProfile` (we only populate the fields `computeVehicleSignals` reads; the cast is acceptable in tests). `BASE_NOW` is a fixed epoch so the apk date math is deterministic.

- [ ] Create `tests/signals.test.ts`:

```ts
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
```

- [ ] Run it and confirm it FAILS to compile (module does not exist yet):

```bash
npm --prefix "C:/Users/Sabur/sites/kentekenrapport" test
```

Expected: `error TS2307: Cannot find module '../lib/vehicle/signals' or its corresponding type declarations.` This is the expected RED.

---

### Task 0.5: Implement `lib/vehicle/signals.ts` (make 0.4 pass + full thresholds)

**Files:** `lib/vehicle/signals.ts` (NEW)

Full implementation of the locked `computeVehicleSignals`. Pure and deterministic: it reads only `input.profile` (RAW fields), `input.nowMs` and `input.hasAccess`. It defensively accepts BOTH NL and EN `napVerdict` tokens (per `lib/i18n/vehicle.ts` ln 27-31). APK math parses the ISO `yyyy-mm-dd` against `nowMs`. Type-only imports keep the test build small.

CONTRACT-NOTE wired here: per `mapper.ts` ln 17-21, `hasOpenRecall` does NOT invert (it is `true` only when a recall is genuinely open), so it is wired as a warn driver directly. `transferPossible===false` is wired as a danger driver (mapper ln 224 confirms `false` = transfer not possible). Both findings are documented by tests in Task 0.6.

- [ ] Create `lib/vehicle/signals.ts`:

```ts
import type { VehicleProfile } from "../rdw/types";
import type { GroupId } from "./groups";

export type SignalTone = "ok" | "warn" | "danger";
export type SignalKey = "safety" | "fairPrice" | "mileage" | "apk";

export type Signal = {
  key: SignalKey;
  tone: SignalTone;
  labelNl: string;
  labelEn: string;
  subNl: string;
  subEn: string;
  group: GroupId;
  affectsPrice: boolean;
};

export type Alert = {
  key: string;
  tone: SignalTone;
  labelNl: string;
  labelEn: string;
  group: GroupId;
};

export type Verdict = {
  tone: SignalTone;
  headingNl: string;
  headingEn: string;
};

export type SignalSummary = {
  checked: number;
  needAttention: number;
  priceAffecting: number;
};

export type GroupStatus = {
  tone: SignalTone;
  labelNl: string;
  labelEn: string;
};

export type VehicleSignalReport = {
  verdict: Verdict;
  signals: Signal[];
  alerts: Alert[];
  summary: SignalSummary;
  groupStatus: Record<GroupId, GroupStatus>;
};

export type SignalInput = {
  profile: VehicleProfile;
  nowMs: number;
  hasAccess: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function worst(a: SignalTone, b: SignalTone): SignalTone {
  const rank: Record<SignalTone, number> = { ok: 0, warn: 1, danger: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/** Parse an ISO yyyy-mm-dd date to epoch ms at UTC midnight; null if unparseable. */
function parseApkMs(value: string | null): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

function isImplausibleNap(napVerdict: string | null): boolean {
  return napVerdict === "Onlogisch" || napVerdict === "Implausible";
}

function isNoNapVerdict(napVerdict: string | null): boolean {
  return (
    napVerdict === null ||
    napVerdict === "Geen oordeel" ||
    napVerdict === "No verdict"
  );
}

function isPlausibleNap(napVerdict: string | null): boolean {
  return napVerdict === "Logisch" || napVerdict === "Plausible";
}

function computeSafetyTone(profile: VehicleProfile): SignalTone {
  const v = profile.vehicle;
  if (v.wok || v.transferPossible === false) return "danger";
  if (
    v.hasOpenRecall ||
    v.recallsCount > 0 ||
    v.isTaxi ||
    profile.enriched?.isImported ||
    (profile.defects?.length ?? 0) > 0
  ) {
    return "warn";
  }
  return "ok";
}

function computeMileageTone(profile: VehicleProfile): SignalTone {
  const nap = profile.vehicle.napVerdict;
  if (isImplausibleNap(nap)) return "danger";
  if (isNoNapVerdict(nap) || profile.enriched?.mileageVerdict === "TWIJFELACHTIG") {
    return "warn";
  }
  if (isPlausibleNap(nap)) return "ok";
  return "ok";
}

function computeApkTone(profile: VehicleProfile, nowMs: number): SignalTone {
  const v = profile.vehicle;
  const expiry = parseApkMs(v.apkExpiryDate);
  if (v.wok) return "danger";
  if (expiry !== null && expiry < nowMs) return "danger";
  if (v.apkExpiryDate === null) return "warn";
  if (expiry !== null && expiry - nowMs <= 30 * DAY_MS) return "warn";
  return "ok";
}

export function computeVehicleSignals(input: SignalInput): VehicleSignalReport {
  const { profile, nowMs, hasAccess } = input;
  const v = profile.vehicle;
  const enriched = profile.enriched;

  const safetyTone = computeSafetyTone(profile);
  const mileageTone = computeMileageTone(profile);
  const apkTone = computeApkTone(profile, nowMs);

  const signals: Signal[] = [
    {
      key: "safety",
      tone: safetyTone,
      labelNl: "Veiligheid en status",
      labelEn: "Safety and status",
      subNl: "Officiele RDW-statusvlaggen",
      subEn: "Official RDW status flags",
      group: "g3-risico",
      affectsPrice: false
    },
    {
      key: "mileage",
      tone: mileageTone,
      labelNl: "Kilometerstand (NAP)",
      labelEn: "Mileage (NAP)",
      subNl: "Nationale APK-tellerstandcontrole",
      subEn: "National odometer check",
      group: "g4-km",
      affectsPrice: true
    },
    {
      key: "apk",
      tone: apkTone,
      labelNl: "APK-geldigheid",
      labelEn: "MOT validity",
      subNl: "Geldigheid van de keuring",
      subEn: "Inspection validity",
      group: "g5-apk",
      affectsPrice: false
    }
  ];

  if (hasAccess && enriched?.estimatedValueNow != null) {
    signals.push({
      key: "fairPrice",
      tone: "ok",
      labelNl: "Marktwaarde berekend",
      labelEn: "Market value calculated",
      subNl: "vul je vraagprijs in voor een prijsoordeel",
      subEn: "enter the asking price for a price verdict",
      group: "g2-markt",
      affectsPrice: true
    });
  }

  // Alerts: risico-bij-uitzondering, only the real exceptions.
  const alerts: Alert[] = [];
  if (v.wok) {
    alerts.push({
      key: "wok",
      tone: "danger",
      labelNl: "Geen geldige APK (WOK)",
      labelEn: "No valid MOT (WOK)",
      group: "g5-apk"
    });
  }
  if (v.transferPossible === false) {
    alerts.push({
      key: "transferBlocked",
      tone: "danger",
      labelNl: "Tenaamstelling niet mogelijk",
      labelEn: "Registration transfer not possible",
      group: "g3-risico"
    });
  }
  if (v.hasOpenRecall || v.recallsCount > 0) {
    alerts.push({
      key: "openRecall",
      tone: "warn",
      labelNl: "Openstaande terugroepactie",
      labelEn: "Open recall",
      group: "g3-risico"
    });
  }
  if (enriched?.isImported) {
    alerts.push({
      key: "imported",
      tone: "warn",
      labelNl: "Geimporteerd voertuig",
      labelEn: "Imported vehicle",
      group: "g6-voertuig"
    });
  }
  if (v.isTaxi) {
    alerts.push({
      key: "taxi",
      tone: "warn",
      labelNl: "Taxiverleden",
      labelEn: "Taxi history",
      group: "g3-risico"
    });
  }
  if (isImplausibleNap(v.napVerdict)) {
    alerts.push({
      key: "napImplausible",
      tone: "danger",
      labelNl: "Tellerstand onlogisch",
      labelEn: "Implausible mileage",
      group: "g4-km"
    });
  } else if (isNoNapVerdict(v.napVerdict)) {
    alerts.push({
      key: "napNoVerdict",
      tone: "warn",
      labelNl: "Geen NAP-oordeel",
      labelEn: "No NAP verdict",
      group: "g4-km"
    });
  }
  const apkExpiry = parseApkMs(v.apkExpiryDate);
  if (apkExpiry !== null && apkExpiry < nowMs) {
    alerts.push({
      key: "apkExpired",
      tone: "danger",
      labelNl: "APK verlopen",
      labelEn: "MOT expired",
      group: "g5-apk"
    });
  } else if (apkExpiry !== null && apkExpiry - nowMs <= 30 * DAY_MS) {
    alerts.push({
      key: "apkSoon",
      tone: "warn",
      labelNl: "APK verloopt binnenkort",
      labelEn: "MOT expires soon",
      group: "g5-apk"
    });
  }

  // Summary.
  const deterministic: SignalTone[] = [safetyTone, mileageTone, apkTone];
  const needAttention = deterministic.filter((t) => t !== "ok").length;
  const priceAffecting = [
    !!enriched?.isImported,
    mileageTone !== "ok",
    v.wok
  ].filter(Boolean).length;
  const summary: SignalSummary = { checked: 3, needAttention, priceAffecting };

  // Verdict.
  const verdictTone = worst(worst(safetyTone, mileageTone), apkTone);
  let headingNl: string;
  let headingEn: string;
  if (verdictTone === "ok") {
    headingNl = "Geen alarmsignalen gevonden";
    headingEn = "No warning signals found";
  } else if (verdictTone === "warn") {
    const puntNl = needAttention === 1 ? "punt" : "punten";
    const puntEn = needAttention === 1 ? "point" : "points";
    headingNl = "Redelijke koop, let op " + needAttention + " " + puntNl;
    headingEn = "Reasonable buy, watch " + needAttention + " " + puntEn;
  } else {
    headingNl = "Pas op: serieuze aandachtspunten";
    headingEn = "Caution: serious points of attention";
  }
  const verdict: Verdict = { tone: verdictTone, headingNl, headingEn };

  // Group status (every GroupId present).
  const safetyStatus: GroupStatus = {
    tone: safetyTone,
    labelNl: signals[0].labelNl,
    labelEn: signals[0].labelEn
  };
  const mileageStatus: GroupStatus = {
    tone: mileageTone,
    labelNl: signals[1].labelNl,
    labelEn: signals[1].labelEn
  };
  const apkStatus: GroupStatus = {
    tone: apkTone,
    labelNl: signals[2].labelNl,
    labelEn: signals[2].labelEn
  };

  const groupStatus: Record<GroupId, GroupStatus> = {
    "g1-verdict": { tone: verdictTone, labelNl: headingNl, labelEn: headingEn },
    "g2-markt": hasAccess
      ? { tone: "ok", labelNl: "Marktwaarde berekend", labelEn: "Market value calculated" }
      : {
          tone: "ok",
          labelNl: "Ontgrendel de marktwaarde-analyse",
          labelEn: "Unlock the market value analysis"
        },
    "g3-risico": safetyStatus,
    "g4-km": mileageStatus,
    "g5-apk": apkStatus,
    "g6-voertuig": enriched?.isImported
      ? {
          tone: "warn",
          labelNl: "Geimporteerd, controleer papieren",
          labelEn: "Imported, check the paperwork"
        }
      : {
          tone: "ok",
          labelNl: "RDW-voertuiggegevens compleet",
          labelEn: "RDW vehicle data complete"
        }
  };

  return { verdict, signals, alerts, summary, groupStatus };
}
```

- [ ] Run the test and confirm the Task 0.4 cases now pass:

```bash
npm --prefix "C:/Users/Sabur/sites/kentekenrapport" test
```

Expected: `tsc` clean; node --test prints the three `signals.test.ts` cases from Task 0.4 as `ok` (alongside the already-green `groups.test.ts` and `mapper.test.ts`).

- [ ] Commit:

```bash
git -C "C:/Users/Sabur/sites/kentekenrapport" add lib/vehicle/signals.ts tests/signals.test.ts
git -C "C:/Users/Sabur/sites/kentekenrapport" commit -m "$(cat <<'EOF'
feat(vehicle): add computeVehicleSignals engine (signals.ts)

Pure, deterministic signal engine on the RAW VehicleProfile with
nowMs injected (no hydration risk). Computes safety/mileage/apk
signals, optional fairPrice, exception alerts, summary, verdict and
per-group status. Accepts both NL and EN napVerdict tokens.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 0.6: Threshold + edge-case test coverage for signals.ts (TDD, expand suite)

**Files:** `tests/signals.test.ts` (MODIFY: append cases)

Add the full threshold matrix. Because Task 0.5 already implements every branch, these cases will pass immediately after they compile (this is the verification net that locks the contract; if any case fails it signals an implementation bug to fix before commit). Append the following block to the END of `tests/signals.test.ts` (after the three Task 0.4 cases, using the same fixture helpers already in the file).

- [ ] Append to `tests/signals.test.ts`:

```ts
test("wok: danger safety + danger apk + verdict danger + wok/apk alerts", () => {
  const report = computeVehicleSignals(input(makeProfile({ wok: true })));
  const tones = Object.fromEntries(report.signals.map((s) => [s.key, s.tone]));
  assert.equal(tones.safety, "danger");
  assert.equal(tones.apk, "danger");
  assert.equal(report.verdict.tone, "danger");
  assert.equal(report.verdict.headingNl, "Pas op: serieuze aandachtspunten");
  assert.equal(report.alerts.some((a) => a.key === "wok" && a.tone === "danger" && a.group === "g5-apk"), true);
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
    report.alerts.some((a) => a.key === "transferBlocked" && a.tone === "danger" && a.group === "g3-risico"),
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

test("isTaxi triggers warn safety + taxi alert in g3", () => {
  const report = computeVehicleSignals(input(makeProfile({ isTaxi: true })));
  assert.equal(report.signals.find((s) => s.key === "safety")?.tone, "warn");
  assert.equal(report.alerts.some((a) => a.key === "taxi" && a.group === "g3-risico"), true);
});

test("defects present triggers warn safety", () => {
  const report = computeVehicleSignals(input(makeProfile({}, { defects: [{ x: 1 }] })));
  assert.equal(report.signals.find((s) => s.key === "safety")?.tone, "warn");
});

test("napVerdict Onlogisch: danger mileage + napImplausible alert + priceAffecting", () => {
  const report = computeVehicleSignals(input(makeProfile({ napVerdict: "Onlogisch" })));
  assert.equal(report.signals.find((s) => s.key === "mileage")?.tone, "danger");
  assert.equal(report.alerts.some((a) => a.key === "napImplausible" && a.tone === "danger" && a.group === "g4-km"), true);
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
  assert.equal(report.alerts.some((a) => a.key === "apkExpired" && a.tone === "danger" && a.group === "g5-apk"), true);
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
  assert.equal(report.groupStatus["g6-voertuig"].tone, "warn");
  assert.equal(report.groupStatus["g6-voertuig"].labelNl, "Geimporteerd, controleer papieren");
  assert.equal(report.alerts.some((a) => a.key === "imported" && a.group === "g6-voertuig"), true);
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
  assert.equal(fp?.group, "g2-markt");
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

test("groupStatus has all six group ids present", () => {
  const report = computeVehicleSignals(input(makeProfile()));
  const ids = Object.keys(report.groupStatus).sort();
  assert.deepEqual(ids, ["g1-verdict", "g2-markt", "g3-risico", "g4-km", "g5-apk", "g6-voertuig"]);
});

test("groupStatus g1 mirrors verdict; g2 reflects access; g3/g4/g5 mirror signals", () => {
  const report = computeVehicleSignals(input(makeProfile()));
  assert.equal(report.groupStatus["g1-verdict"].tone, report.verdict.tone);
  assert.equal(report.groupStatus["g1-verdict"].labelNl, report.verdict.headingNl);

  // no access -> g2 unlock prompt
  assert.equal(report.groupStatus["g2-markt"].labelNl, "Ontgrendel de marktwaarde-analyse");

  assert.equal(report.groupStatus["g3-risico"].tone, report.signals.find((s) => s.key === "safety")?.tone);
  assert.equal(report.groupStatus["g4-km"].tone, report.signals.find((s) => s.key === "mileage")?.tone);
  assert.equal(report.groupStatus["g5-apk"].tone, report.signals.find((s) => s.key === "apk")?.tone);
});

test("groupStatus g2 reads 'Marktwaarde berekend' when hasAccess", () => {
  const report = computeVehicleSignals(input(makeProfile(), { hasAccess: true }));
  assert.equal(report.groupStatus["g2-markt"].labelNl, "Marktwaarde berekend");
});

test("clean car: groupStatus g6 reads RDW data complete (not imported)", () => {
  const report = computeVehicleSignals(input(makeProfile()));
  assert.equal(report.groupStatus["g6-voertuig"].tone, "ok");
  assert.equal(report.groupStatus["g6-voertuig"].labelNl, "RDW-voertuiggegevens compleet");
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
```

- [ ] Run the full suite and confirm everything is GREEN:

```bash
npm --prefix "C:/Users/Sabur/sites/kentekenrapport" test
```

Expected: `tsc` clean; node --test reports all `signals.test.ts` cases (the three from 0.4 plus the ~28 appended here), all `groups.test.ts` cases, and the existing `mapper.test.ts` case as `ok`, with a final `# fail 0`.

- [ ] If any case fails, fix `lib/vehicle/signals.ts` to satisfy the locked contract (do NOT loosen the test) and re-run until green, then commit:

```bash
git -C "C:/Users/Sabur/sites/kentekenrapport" add tests/signals.test.ts lib/vehicle/signals.ts
git -C "C:/Users/Sabur/sites/kentekenrapport" commit -m "$(cat <<'EOF'
test(vehicle): full threshold matrix for computeVehicleSignals

Covers wok, transferPossible (contract-note), hasOpenRecall non-
inversion (contract-note), recalls, taxi, defects, NAP NL+EN tokens,
TWIJFELACHTIG, apk expired/soon/valid/null, import, fairPrice gating,
summary counts, verdict tone + singular/plural copy, and groupStatus
for all six groups. No em-dash/en-dash in any signal or alert copy.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 0.7: Whole-project typecheck gate (no regression from the new modules)

**Files:** none (verification only)

The two new modules will be imported by the app build (`app/api/vehicle/[plate]/route.ts`, JudgmentBlock, PDF) in later phases. Confirm now that they typecheck cleanly inside the real Next.js tsconfig too (the test tsconfig is a subset), so nothing downstream breaks.

- [ ] Run the project typecheck and confirm clean:

```bash
npm --prefix "C:/Users/Sabur/sites/kentekenrapport" run typecheck
```

Expected: exits 0 with no errors. (If `typecheck` is not a script, fall back to `npx --prefix "C:/Users/Sabur/sites/kentekenrapport" tsc --noEmit -p "C:/Users/Sabur/sites/kentekenrapport/tsconfig.json"`; expected clean.)

- [ ] No commit needed (verification step only). Phase 0 is complete: `groups.ts` and `signals.ts` exist, are fully unit-tested and green, and typecheck inside both the test and app configs.
