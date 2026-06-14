## Phase 1 — Server wiring + JudgmentBlock (BLUF)

**Goal:** Compute the deterministic `VehicleSignalReport` server-side on the RAW (pre-localization) `VehicleProfile` inside `app/api/vehicle/[plate]/route.ts`, attach it as a free `signals` field on the JSON response (with `fairPrice` only when the plate is paid), expose it through `hooks/useVehicleLookup`, and render a new free `JudgmentBlock` (BLUF: verdict heading + tappable colored signal rows + alerts list + summary teaser) at the very top of `FullReportScreen` after `ScanIntro`. Full nav wiring (controlled open state, expand-all, group jump) lands in Phase 2; here `onJump` is a temporary `scrollIntoView` by group id.

> EXECUTION NOTE (full-plan order): Phase 0 already builds `lib/vehicle/groups.ts`, `lib/vehicle/signals.ts`, their tests, and the `tsconfig.test.json` allowlist. When running the whole plan in order, SKIP Tasks 1.1, 1.2 and 1.3 below (they re-create the Phase 0 foundation) and START at Task 1.4. The canonical foundation is Phase 0's `signals.ts`/`groups.ts`. Tasks 1.1-1.3 are kept only so Phase 1 can also be executed standalone.

**Files touched:**
- `tsconfig.test.json` (MODIFY — add `lib/vehicle/groups.ts`, `lib/vehicle/signals.ts` to the `include` allowlist so the new pure libs compile for unit tests)
- `lib/vehicle/groups.ts` (NEW — locked `GROUPS`/`GroupDef`/`GroupId`/`ReportSectionId` module; imported type-only)
- `lib/vehicle/signals.ts` (NEW — locked pure `computeVehicleSignals` + all signal types)
- `tests/signals.test.ts` (NEW — TDD for `computeVehicleSignals`)
- `tests/groups.test.ts` (NEW — TDD for the `GROUPS` table contract)
- `lib/store/services/vehicleApi.ts` (MODIFY — response type `VehicleProfile` -> `VehicleLookupResponse` carrying optional `signals`)
- `app/api/vehicle/[plate]/route.ts` (MODIFY — call `computeVehicleSignals` on the raw profile in the base branch + the unpaid-AI branch + the paid-AI branch; attach `signals`)
- `components/vehicle/JudgmentBlock.tsx` (NEW — free BLUF block)
- `components/vehicle/JudgmentBlock.module.css` (NEW — tone CSS mirroring `TrustBadges.module.css`)
- `components/vehicle/FullReportScreen.tsx` (MODIFY — mount `JudgmentBlock` after `ScanIntro`, before the nav/sections)

> NOTE on TDD scope: `groups.ts`, `signals.ts` are pure logic and ARE test-driven. `JudgmentBlock.tsx` / CSS and the `FullReportScreen` mount are React/CSS and are verified per the CLAUDE.md headless-Chromium workflow + `npm run typecheck` + `npm run build`, NOT via `node --test`.

> CONTRACT-NOTE confirmed before wiring (from reading `lib/rdw/mapper.ts` ln 13-21, 223-227): `notBool()` (ln 17-21) is byte-for-byte identical to `bool()` despite its name/comment, so `hasOpenRecall = notBool(openstaande_terugroepactie_indicator)` is `true` ONLY when the RDW indicator is "Ja" (correct). `transferPossible = bool(m.tenaamstellen_mogelijk)` (ln 224) is `true` when "Ja", so `transferPossible === false` correctly means transfer is NOT possible. Both match the locked thresholds, so `safety` treats BOTH `vehicle.wok` and `vehicle.transferPossible === false` as danger as specified. No defensive TODO downgrade is needed.

---

### Task 1.1: Add the two new lib files to the test compile allowlist

**Files:** `tsconfig.test.json`

- [ ] MODIFY `tsconfig.test.json`. The current `include` array is (ln 19-26):

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

  Replace it with (adds the two new pure libs so `tsc -p tsconfig.test.json` compiles them and the tests can import them):

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

- [ ] This is a config-only change; no test runs yet (the lib files do not exist, that is the next task's failing-test step). Commit:

```bash
cd /c/Users/Sabur/sites/kentekenrapport && git add tsconfig.test.json && git commit -m "test: allowlist lib/vehicle/groups.ts + signals.ts for unit compile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.2: TDD the GROUPS table (lib/vehicle/groups.ts)

**Files:** `tests/groups.test.ts`, `lib/vehicle/groups.ts`

- [ ] WRITE the failing test `tests/groups.test.ts` (asserts the exact locked `GROUPS` contents, including order, lockKey, defaultOpen and sectionIds, and that the dropped `"risico"` sectionId is in no group):

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { GROUPS } from "../lib/vehicle/groups";

test("GROUPS has the six locked groups in order", () => {
  assert.deepEqual(
    GROUPS.map((g) => g.id),
    ["g1-verdict", "g2-markt", "g3-risico", "g4-km", "g5-apk", "g6-voertuig"]
  );
});

test("GROUPS carry the locked lockKey / defaultOpen / sectionIds", () => {
  const byId = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

  assert.equal(byId["g1-verdict"].lockKey, null);
  assert.equal(byId["g1-verdict"].defaultOpen, true);
  assert.deepEqual(byId["g1-verdict"].sectionIds, ["overzicht", "ai-analyse"]);

  assert.equal(byId["g2-markt"].lockKey, "marketAnalysis");
  assert.equal(byId["g2-markt"].defaultOpen, true);
  assert.deepEqual(byId["g2-markt"].sectionIds, ["markt", "te-koop"]);

  assert.equal(byId["g3-risico"].lockKey, "damageHistory");
  assert.equal(byId["g3-risico"].defaultOpen, false);
  assert.deepEqual(byId["g3-risico"].sectionIds, ["schade"]);

  assert.equal(byId["g4-km"].lockKey, "mileageHistory");
  assert.equal(byId["g4-km"].defaultOpen, false);
  assert.deepEqual(byId["g4-km"].sectionIds, ["kilometerstand"]);

  assert.equal(byId["g5-apk"].lockKey, "inspectionTimeline");
  assert.equal(byId["g5-apk"].defaultOpen, false);
  assert.deepEqual(byId["g5-apk"].sectionIds, ["apk", "apk-intelligence"]);

  assert.equal(byId["g6-voertuig"].lockKey, "ownershipHistory");
  assert.equal(byId["g6-voertuig"].defaultOpen, false);
  assert.deepEqual(byId["g6-voertuig"].sectionIds, ["eigendom", "specs"]);
});

test("the dropped risico sectionId is in no group", () => {
  const all = GROUPS.flatMap((g) => g.sectionIds);
  assert.equal(all.includes("risico" as never), false);
});

test("labels carry no en/em-dash", () => {
  for (const g of GROUPS) {
    assert.equal(g.labelNl.includes("–"), false);
    assert.equal(g.labelNl.includes("—"), false);
    assert.equal(g.labelEn.includes("–"), false);
    assert.equal(g.labelEn.includes("—"), false);
  }
});
```

- [ ] RUN the test, expect a FAIL (module does not exist yet -> `tsc` cannot resolve `../lib/vehicle/groups`):

```bash
cd /c/Users/Sabur/sites/kentekenrapport && npm test
```

  Expected: `tsc -p tsconfig.test.json` errors with `error TS2307: Cannot find module '../lib/vehicle/groups'` (build fails before any test runs). This is the expected red.

- [ ] IMPLEMENT `lib/vehicle/groups.ts` (COMPLETE file, exact locked contents; apostrophe in "Risicos" is a plain ASCII text without any dash):

```ts
import type { PublicSiteSettings } from "../site-settings/defaults";

export type GroupId = "g1-verdict" | "g2-markt" | "g3-risico" | "g4-km" | "g5-apk" | "g6-voertuig";

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

/**
 * The six accordion groups of the redesigned report. The GROUP lockKey only
 * drives the header lock chip + nav lock icon + collapsed teaser; per-section
 * premium gating stays per-section by each section's own lockKey (no double
 * gating). "acties" is the free footer, rendered after the groups and is not a
 * member of any group. The old "risico" sectionId (RiskOverviewScreen) is
 * dropped from the report and intentionally appears in no group.
 */
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

- [ ] RUN the test, expect PASS:

```bash
cd /c/Users/Sabur/sites/kentekenrapport && npm test
```

  Expected: the four `groups.test.ts` tests pass (alongside the existing `mapper.test.ts`); `# fail 0`.

- [ ] Commit:

```bash
cd /c/Users/Sabur/sites/kentekenrapport && git add lib/vehicle/groups.ts tests/groups.test.ts && git commit -m "feat(report): add locked GROUPS table (lib/vehicle/groups.ts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.3: TDD computeVehicleSignals — safety/mileage/apk + verdict + summary

**Files:** `tests/signals.test.ts`, `lib/vehicle/signals.ts`

This task builds the deterministic core. `fairPrice`, `alerts` and `groupStatus` are added/extended in Task 1.4 against the same file (TDD continues there). We split only the test additions; the implementation file is written complete once in this task and only one extra block is needed in 1.4 if any helper differs (it will not; the full file ships here).

- [ ] WRITE the failing test `tests/signals.test.ts`. It builds minimal `VehicleProfile` fixtures (only the fields the thresholds read) via a helper, then asserts the locked safety/mileage/apk tones, the verdict tone+heading, and the summary counts. `nowMs` is fixed so the APK date math is deterministic (no `Date.now()`):

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { computeVehicleSignals, type SignalKey, type SignalTone } from "../lib/vehicle/signals";
import type { VehicleProfile } from "../lib/rdw/types";

// 2026-06-14T12:00:00Z, the date the plan is written; APK math keys off this.
const NOW = Date.UTC(2026, 5, 14, 12, 0, 0);

type V = VehicleProfile["vehicle"];
type E = NonNullable<VehicleProfile["enriched"]>;

function vehicle(over: Partial<V> = {}): V {
  return {
    brand: "TOYOTA",
    tradeName: "YARIS",
    typeCode: null,
    variant: null,
    uitvoering: null,
    year: 2015,
    color: { primary: null, secondary: null },
    bodyType: null,
    doors: null,
    seats: null,
    axles: null,
    fuelType: "Benzine",
    co2: null,
    energyLabel: null,
    consumptionCombined: null,
    emissionStandard: null,
    transmission: null,
    transmissionCode: null,
    gears: null,
    factoryModelName: null,
    engine: { displacement: null, cylinders: null, powerKw: null },
    dimensions: { wheels: null, wheelbase: null, length: null, width: null, height: null },
    weight: { empty: null, max: null, payload: null, readyToDrive: null, powerToMassRatio: null },
    apkExpiryDate: "2027-01-01",
    owners: { count: null },
    firstRegistrationNL: null,
    firstRegistrationWorld: null,
    exportIndicator: false,
    wok: false,
    transferPossible: true,
    insured: true,
    isTaxi: false,
    hasOpenRecall: false,
    napVerdict: "Logisch",
    napLastYear: null,
    cataloguePrice: null,
    recallsCount: 0,
    ...over
  };
}

function profile(over: Partial<V> = {}, enriched: Partial<E> | null = null): VehicleProfile {
  const base = {
    plate: "16RSL9",
    displayPlate: "16-RSL-9",
    fromCache: false,
    vehicle: vehicle(over),
    inspections: [],
    defects: [],
    defectDescriptions: {},
    recalls: [],
    typeApprovals: [],
    raw: { main: [], fuel: [], apk: [], defects: [], recalls: [], body: [], typeApprovals: [] }
  } as VehicleProfile;
  if (enriched) base.enriched = enriched as E;
  return base;
}

function tone(report: ReturnType<typeof computeVehicleSignals>, key: SignalKey): SignalTone | undefined {
  return report.signals.find((s) => s.key === key)?.tone;
}

test("clean car: all three free signals ok, verdict ok, no alerts", () => {
  const r = computeVehicleSignals({ profile: profile(), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "safety"), "ok");
  assert.equal(tone(r, "mileage"), "ok");
  assert.equal(tone(r, "apk"), "ok");
  assert.equal(r.verdict.tone, "ok");
  assert.equal(r.verdict.headingNl, "Geen alarmsignalen gevonden");
  assert.deepEqual(r.alerts, []);
  assert.equal(r.summary.checked, 3);
  assert.equal(r.summary.needAttention, 0);
});

test("safety danger on WOK", () => {
  const r = computeVehicleSignals({ profile: profile({ wok: true }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "safety"), "danger");
});

test("safety danger when transfer not possible", () => {
  const r = computeVehicleSignals({ profile: profile({ transferPossible: false }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "safety"), "danger");
});

test("safety warn on open recall", () => {
  const r = computeVehicleSignals({ profile: profile({ hasOpenRecall: true }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "safety"), "warn");
});

test("safety warn on import (enriched)", () => {
  const r = computeVehicleSignals({ profile: profile({}, { isImported: true }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "safety"), "warn");
});

test("mileage danger on Onlogisch (NL token)", () => {
  const r = computeVehicleSignals({ profile: profile({ napVerdict: "Onlogisch" }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "mileage"), "danger");
});

test("mileage danger on Implausible (EN token)", () => {
  const r = computeVehicleSignals({ profile: profile({ napVerdict: "Implausible" }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "mileage"), "danger");
});

test("mileage warn on null napVerdict", () => {
  const r = computeVehicleSignals({ profile: profile({ napVerdict: null }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "mileage"), "warn");
});

test("mileage warn on enriched TWIJFELACHTIG even when nap logical", () => {
  const r = computeVehicleSignals({
    profile: profile({ napVerdict: "Logisch" }, { mileageVerdict: "TWIJFELACHTIG" }),
    nowMs: NOW,
    hasAccess: false
  });
  assert.equal(tone(r, "mileage"), "warn");
});

test("apk danger when expired", () => {
  const r = computeVehicleSignals({ profile: profile({ apkExpiryDate: "2026-01-01" }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "apk"), "danger");
});

test("apk warn when within 30 days", () => {
  const r = computeVehicleSignals({ profile: profile({ apkExpiryDate: "2026-06-30" }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "apk"), "warn");
});

test("apk warn when expiry date is null", () => {
  const r = computeVehicleSignals({ profile: profile({ apkExpiryDate: null }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "apk"), "warn");
});

test("apk ok when more than 30 days away", () => {
  const r = computeVehicleSignals({ profile: profile({ apkExpiryDate: "2027-01-01" }), nowMs: NOW, hasAccess: false });
  assert.equal(tone(r, "apk"), "ok");
});

test("verdict tone is the worst of safety/mileage/apk", () => {
  const r = computeVehicleSignals({
    profile: profile({ napVerdict: "Onlogisch", hasOpenRecall: true }),
    nowMs: NOW,
    hasAccess: false
  });
  // mileage danger beats safety warn
  assert.equal(r.verdict.tone, "danger");
  assert.equal(r.verdict.headingNl, "Pas op: serieuze aandachtspunten");
});

test("warn verdict heading pluralises needAttention", () => {
  // one warn (recall), zero danger -> verdict warn, 1 point
  const r1 = computeVehicleSignals({ profile: profile({ hasOpenRecall: true }), nowMs: NOW, hasAccess: false });
  assert.equal(r1.verdict.tone, "warn");
  assert.equal(r1.verdict.headingNl, "Redelijke koop, let op 1 punt");
  // two warns (recall + import) -> 2 punten
  const r2 = computeVehicleSignals({
    profile: profile({ hasOpenRecall: true, napVerdict: null }),
    nowMs: NOW,
    hasAccess: false
  });
  assert.equal(r2.verdict.tone, "warn");
  assert.equal(r2.verdict.headingNl, "Redelijke koop, let op 2 punten");
});

test("summary needAttention counts non-ok of the three free lines", () => {
  const r = computeVehicleSignals({
    profile: profile({ napVerdict: "Onlogisch", apkExpiryDate: "2026-01-01" }),
    nowMs: NOW,
    hasAccess: false
  });
  assert.equal(r.summary.checked, 3);
  assert.equal(r.summary.needAttention, 2); // mileage + apk
});

test("summary priceAffecting = truthy of [isImported, mileage!=ok, wok]", () => {
  const r = computeVehicleSignals({
    profile: profile({ wok: true, napVerdict: "Onlogisch" }, { isImported: true }),
    nowMs: NOW,
    hasAccess: false
  });
  assert.equal(r.summary.priceAffecting, 3);
});

test("fairPrice signal absent without access", () => {
  const r = computeVehicleSignals({
    profile: profile({}, { estimatedValueNow: 6150 }),
    nowMs: NOW,
    hasAccess: false
  });
  assert.equal(r.signals.find((s) => s.key === "fairPrice"), undefined);
});

test("fairPrice signal present with access AND a value", () => {
  const r = computeVehicleSignals({
    profile: profile({}, { estimatedValueNow: 6150 }),
    nowMs: NOW,
    hasAccess: true
  });
  const fp = r.signals.find((s) => s.key === "fairPrice");
  assert.ok(fp);
  assert.equal(fp!.tone, "ok");
  assert.equal(fp!.affectsPrice, true);
  assert.equal(fp!.labelNl, "Marktwaarde berekend");
  // checked stays 3 (fairPrice excluded from the deterministic count)
  assert.equal(r.summary.checked, 3);
});

test("fairPrice absent with access but no value", () => {
  const r = computeVehicleSignals({
    profile: profile({}, { estimatedValueNow: null }),
    nowMs: NOW,
    hasAccess: true
  });
  assert.equal(r.signals.find((s) => s.key === "fairPrice"), undefined);
});

test("no en/em-dash in any emitted label/sub/heading", () => {
  const r = computeVehicleSignals({
    profile: profile({ wok: true, napVerdict: "Onlogisch", apkExpiryDate: "2026-01-01" }, { isImported: true }),
    nowMs: NOW,
    hasAccess: true
  });
  const texts: string[] = [r.verdict.headingNl, r.verdict.headingEn];
  for (const s of r.signals) texts.push(s.labelNl, s.labelEn, s.subNl, s.subEn);
  for (const a of r.alerts) texts.push(a.labelNl, a.labelEn);
  for (const gid of Object.keys(r.groupStatus) as Array<keyof typeof r.groupStatus>) {
    texts.push(r.groupStatus[gid].labelNl, r.groupStatus[gid].labelEn);
  }
  for (const t of texts) {
    assert.equal(t.includes("–"), false, `en-dash in: ${t}`);
    assert.equal(t.includes("—"), false, `em-dash in: ${t}`);
  }
});
```

- [ ] WRITE the alerts + groupStatus tests in the same file `tests/signals.test.ts` (append these so the full locked contract is covered before implementation):

```ts
test("alerts list the real exceptions with group + tone", () => {
  const r = computeVehicleSignals({
    profile: profile({
      wok: true,
      transferPossible: false,
      hasOpenRecall: true,
      isTaxi: true,
      napVerdict: "Onlogisch",
      apkExpiryDate: "2026-01-01"
    }, { isImported: true }),
    nowMs: NOW,
    hasAccess: false
  });
  const byKey = Object.fromEntries(r.alerts.map((a) => [a.key, a]));
  assert.equal(byKey["wok"].tone, "danger");
  assert.equal(byKey["wok"].group, "g5-apk");
  assert.equal(byKey["transfer"].tone, "danger");
  assert.equal(byKey["transfer"].group, "g3-risico");
  assert.equal(byKey["recall"].tone, "warn");
  assert.equal(byKey["recall"].group, "g3-risico");
  assert.equal(byKey["import"].tone, "warn");
  assert.equal(byKey["import"].group, "g6-voertuig");
  assert.equal(byKey["taxi"].tone, "warn");
  assert.equal(byKey["taxi"].group, "g3-risico");
  assert.equal(byKey["nap"].tone, "danger");
  assert.equal(byKey["nap"].group, "g4-km");
  assert.equal(byKey["apk"].tone, "danger");
  assert.equal(byKey["apk"].group, "g5-apk");
});

test("alerts empty when verdict ok", () => {
  const r = computeVehicleSignals({ profile: profile(), nowMs: NOW, hasAccess: false });
  assert.deepEqual(r.alerts, []);
});

test("groupStatus has every group; g2 depends on access", () => {
  const locked = computeVehicleSignals({ profile: profile(), nowMs: NOW, hasAccess: false });
  assert.deepEqual(
    Object.keys(locked.groupStatus).sort(),
    ["g1-verdict", "g2-markt", "g3-risico", "g4-km", "g5-apk", "g6-voertuig"]
  );
  assert.equal(locked.groupStatus["g2-markt"].labelNl, "Ontgrendel de marktwaarde-analyse");
  const paid = computeVehicleSignals({ profile: profile(), nowMs: NOW, hasAccess: true });
  assert.equal(paid.groupStatus["g2-markt"].labelNl, "Marktwaarde berekend");
});

test("groupStatus g3/g4/g5 mirror the signal tones; g6 reflects import", () => {
  const r = computeVehicleSignals({
    profile: profile({ wok: true, napVerdict: "Onlogisch" }, { isImported: true }),
    nowMs: NOW,
    hasAccess: false
  });
  assert.equal(r.groupStatus["g3-risico"].tone, "danger"); // safety danger (wok)
  assert.equal(r.groupStatus["g4-km"].tone, "danger"); // mileage danger
  assert.equal(r.groupStatus["g5-apk"].tone, "danger"); // apk danger (wok forces it)
  assert.equal(r.groupStatus["g6-voertuig"].tone, "warn"); // imported
  assert.equal(r.groupStatus["g1-verdict"].tone, r.verdict.tone);
});
```

- [ ] RUN, expect FAIL (module missing):

```bash
cd /c/Users/Sabur/sites/kentekenrapport && npm test
```

  Expected: `error TS2307: Cannot find module '../lib/vehicle/signals'`. Red as intended.

- [ ] IMPLEMENT `lib/vehicle/signals.ts` (COMPLETE file; imports are TYPE-ONLY/light so the test build stays small: only `VehicleProfile` type and `GroupId` type):

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

function worst(...tones: SignalTone[]): SignalTone {
  if (tones.includes("danger")) return "danger";
  if (tones.includes("warn")) return "warn";
  return "ok";
}

/** Parse an ISO yyyy-mm-dd date at UTC midnight; null on missing/malformed. */
function parseIsoDateMs(value: string | null): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Deterministic, locale-agnostic signal report. Pure: takes nowMs as a
 * parameter (never reads Date.now/Math.random) so the server computes it on the
 * RAW pre-localization profile and the client renders the JSON without any
 * hydration risk. The same function feeds the web JudgmentBlock and the PDF.
 */
export function computeVehicleSignals(input: SignalInput): VehicleSignalReport {
  const { profile, nowMs, hasAccess } = input;
  const v = profile.vehicle;
  const enriched = profile.enriched;

  const isImported = Boolean(enriched?.isImported);
  const defectsCount = Array.isArray(profile.defects) ? profile.defects.length : 0;

  // --- safety (group g3-risico, affectsPrice false) ---
  let safetyTone: SignalTone;
  if (v.wok || v.transferPossible === false) {
    safetyTone = "danger";
  } else if (v.hasOpenRecall || v.recallsCount > 0 || v.isTaxi || isImported || defectsCount > 0) {
    safetyTone = "warn";
  } else {
    safetyTone = "ok";
  }
  const safety: Signal = {
    key: "safety",
    tone: safetyTone,
    group: "g3-risico",
    affectsPrice: false,
    labelNl: "Veiligheid en status",
    labelEn: "Safety and status",
    subNl:
      safetyTone === "danger"
        ? "Officiele blokkade gevonden, lees de risicos"
        : safetyTone === "warn"
        ? "Let op een of meer aandachtspunten"
        : "Geen blokkades in de RDW-registratie",
    subEn:
      safetyTone === "danger"
        ? "Official block found, read the risks"
        : safetyTone === "warn"
        ? "One or more points need attention"
        : "No blocks in the RDW registration"
  };

  // --- mileage (group g4-km, affectsPrice true) ---
  const nap = v.napVerdict;
  const napImplausible = nap === "Onlogisch" || nap === "Implausible";
  const napNoVerdict = nap === null || nap === "Geen oordeel" || nap === "No verdict";
  const napPlausible = nap === "Logisch" || nap === "Plausible";
  const enrichedDoubt = enriched?.mileageVerdict === "TWIJFELACHTIG";
  let mileageTone: SignalTone;
  if (napImplausible) {
    mileageTone = "danger";
  } else if (napNoVerdict || enrichedDoubt) {
    mileageTone = "warn";
  } else if (napPlausible) {
    mileageTone = "ok";
  } else {
    // unknown token defensively treated as no-verdict
    mileageTone = "warn";
  }
  const mileage: Signal = {
    key: "mileage",
    tone: mileageTone,
    group: "g4-km",
    affectsPrice: true,
    labelNl: "Kilometerstand en NAP",
    labelEn: "Mileage and NAP",
    subNl:
      mileageTone === "danger"
        ? "NAP wijst op een onlogische tellerstand"
        : mileageTone === "warn"
        ? "Geen sluitend NAP-oordeel beschikbaar"
        : "NAP-registraties lopen logisch op",
    subEn:
      mileageTone === "danger"
        ? "NAP flags an implausible odometer"
        : mileageTone === "warn"
        ? "No conclusive NAP verdict available"
        : "NAP readings rise logically"
  };

  // --- apk (group g5-apk, affectsPrice false) ---
  const apkMs = parseIsoDateMs(v.apkExpiryDate);
  let apkTone: SignalTone;
  if ((apkMs !== null && apkMs < nowMs) || v.wok) {
    apkTone = "danger";
  } else if (apkMs === null || apkMs - nowMs <= 30 * DAY_MS) {
    apkTone = "warn";
  } else {
    apkTone = "ok";
  }
  const apk: Signal = {
    key: "apk",
    tone: apkTone,
    group: "g5-apk",
    affectsPrice: false,
    labelNl: "APK-geldigheid",
    labelEn: "MOT validity",
    subNl:
      apkTone === "danger"
        ? "Geen geldige APK op dit moment"
        : apkTone === "warn"
        ? "APK verloopt binnenkort of is onbekend"
        : "APK ruim geldig",
    subEn:
      apkTone === "danger"
        ? "No valid MOT at this time"
        : apkTone === "warn"
        ? "MOT expires soon or is unknown"
        : "MOT valid for a while"
  };

  const signals: Signal[] = [safety, mileage, apk];

  // --- fairPrice (group g2-markt, affectsPrice true) ---
  // Only when paid AND the formula produced a value. The euro number itself
  // never leaves the client; this signal only confirms a value exists.
  if (hasAccess && enriched?.estimatedValueNow != null) {
    signals.push({
      key: "fairPrice",
      tone: "ok",
      group: "g2-markt",
      affectsPrice: true,
      labelNl: "Marktwaarde berekend",
      labelEn: "Market value calculated",
      subNl: "vul je vraagprijs in voor een prijsoordeel",
      subEn: "enter the asking price for a price verdict"
    });
  }

  // --- summary ---
  const checked = 3; // safety, mileage, apk are the deterministic free lines
  const needAttention = [safetyTone, mileageTone, apkTone].filter((t) => t !== "ok").length;
  const priceAffecting = [isImported, mileageTone !== "ok", v.wok].filter(Boolean).length;
  const summary: SignalSummary = { checked, needAttention, priceAffecting };

  // --- verdict ---
  const verdictTone = worst(safetyTone, mileageTone, apkTone);
  const verdict: Verdict =
    verdictTone === "ok"
      ? { tone: "ok", headingNl: "Geen alarmsignalen gevonden", headingEn: "No warning signals found" }
      : verdictTone === "warn"
      ? {
          tone: "warn",
          headingNl: `Redelijke koop, let op ${needAttention} punt${needAttention === 1 ? "" : "en"}`,
          headingEn: `Reasonable buy, mind ${needAttention} point${needAttention === 1 ? "" : "s"}`
        }
      : {
          tone: "danger",
          headingNl: "Pas op: serieuze aandachtspunten",
          headingEn: "Caution: serious points to check"
        };

  // --- alerts (risico-bij-uitzondering: only the real exceptions) ---
  const alerts: Alert[] = [];
  if (v.wok) {
    alerts.push({ key: "wok", tone: "danger", group: "g5-apk", labelNl: "Geen geldige APK (WOK)", labelEn: "No valid MOT (WOK)" });
  }
  if (v.transferPossible === false) {
    alerts.push({
      key: "transfer",
      tone: "danger",
      group: "g3-risico",
      labelNl: "Tenaamstelling niet mogelijk",
      labelEn: "Registration transfer not possible"
    });
  }
  if (v.hasOpenRecall || v.recallsCount > 0) {
    alerts.push({
      key: "recall",
      tone: "warn",
      group: "g3-risico",
      labelNl: "Openstaande terugroepactie",
      labelEn: "Open recall"
    });
  }
  if (isImported) {
    alerts.push({ key: "import", tone: "warn", group: "g6-voertuig", labelNl: "Geimporteerd voertuig", labelEn: "Imported vehicle" });
  }
  if (v.isTaxi) {
    alerts.push({ key: "taxi", tone: "warn", group: "g3-risico", labelNl: "Taxiverleden", labelEn: "Taxi history" });
  }
  if (napImplausible) {
    alerts.push({ key: "nap", tone: "danger", group: "g4-km", labelNl: "Tellerstand onlogisch", labelEn: "Odometer implausible" });
  } else if (napNoVerdict) {
    alerts.push({ key: "nap", tone: "warn", group: "g4-km", labelNl: "Geen NAP-oordeel", labelEn: "No NAP verdict" });
  }
  if (apkTone === "danger") {
    alerts.push({ key: "apk", tone: "danger", group: "g5-apk", labelNl: "APK verlopen", labelEn: "MOT expired" });
  } else if (apkTone === "warn") {
    alerts.push({ key: "apk", tone: "warn", group: "g5-apk", labelNl: "APK verloopt binnenkort", labelEn: "MOT expires soon" });
  }

  // --- groupStatus (every GroupId present) ---
  const groupStatus: Record<GroupId, GroupStatus> = {
    "g1-verdict": { tone: verdict.tone, labelNl: verdict.headingNl, labelEn: verdict.headingEn },
    "g2-markt": hasAccess
      ? { tone: "ok", labelNl: "Marktwaarde berekend", labelEn: "Market value calculated" }
      : { tone: "ok", labelNl: "Ontgrendel de marktwaarde-analyse", labelEn: "Unlock the market value analysis" },
    "g3-risico": { tone: safety.tone, labelNl: safety.labelNl, labelEn: safety.labelEn },
    "g4-km": { tone: mileage.tone, labelNl: mileage.labelNl, labelEn: mileage.labelEn },
    "g5-apk": { tone: apk.tone, labelNl: apk.labelNl, labelEn: apk.labelEn },
    "g6-voertuig": isImported
      ? { tone: "warn", labelNl: "Geimporteerd, controleer papieren", labelEn: "Imported, check the paperwork" }
      : { tone: "ok", labelNl: "RDW-voertuiggegevens compleet", labelEn: "RDW vehicle data complete" }
  };

  return { verdict, signals, alerts, summary, groupStatus };
}
```

- [ ] RUN, expect PASS (all `signals.test.ts` + `groups.test.ts` + `mapper.test.ts`):

```bash
cd /c/Users/Sabur/sites/kentekenrapport && npm test
```

  Expected: every test passes, `# fail 0`. (The `alerts` test reads `recallsCount` via the fixture default 0; the recall alert fires on `hasOpenRecall: true`.)

- [ ] Commit:

```bash
cd /c/Users/Sabur/sites/kentekenrapport && git add lib/vehicle/signals.ts tests/signals.test.ts && git commit -m "feat(report): add deterministic computeVehicleSignals (lib/vehicle/signals.ts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.4: Widen the vehicle API response type to carry signals

**Files:** `lib/store/services/vehicleApi.ts`

The RTK query is currently typed `builder.query<VehicleProfile, VehicleLookupQuery>` (ln 15). The route will attach a top-level `signals` field. Add a response type so `data.signals` is typed for `useVehicleLookup` consumers and `JudgmentBlock`.

- [ ] MODIFY `lib/store/services/vehicleApi.ts`. Current head (ln 1-9):

```ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { VehicleProfile } from "@/lib/rdw/types";
import type { Locale } from "@/lib/i18n/messages";

type VehicleLookupQuery = {
  plate: string;
  lang: Locale;
  mileage?: number | null;
};
```

  Replace with (adds the `VehicleSignalReport` import + an exported `VehicleLookupResponse` intersection that also tolerates the optional `aiInsights`/`aiValuation` the AI branch returns):

```ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { VehicleProfile } from "@/lib/rdw/types";
import type { VehicleSignalReport } from "@/lib/vehicle/signals";
import type { Locale } from "@/lib/i18n/messages";

type VehicleLookupQuery = {
  plate: string;
  lang: Locale;
  mileage?: number | null;
};

// The single-plate route returns the localized VehicleProfile plus a free,
// server-computed signals report. The AI branch additionally returns
// aiInsights/aiValuation (consumed via useAiReport, typed loosely here).
export type VehicleLookupResponse = VehicleProfile & {
  signals?: VehicleSignalReport;
  aiInsights?: unknown;
  aiValuation?: unknown;
};
```

- [ ] MODIFY the endpoint generic (ln 15) from:

```ts
    getVehicleByPlate: builder.query<VehicleProfile, VehicleLookupQuery>({
```

  to:

```ts
    getVehicleByPlate: builder.query<VehicleLookupResponse, VehicleLookupQuery>({
```

- [ ] VERIFY typecheck stays clean (the response widens, every existing `data?.vehicle` / `data?.enriched` access still resolves):

```bash
cd /c/Users/Sabur/sites/kentekenrapport && npm run typecheck
```

  Expected: no output, exit 0.

- [ ] Commit:

```bash
cd /c/Users/Sabur/sites/kentekenrapport && git add lib/store/services/vehicleApi.ts && git commit -m "feat(report): type vehicle API response with optional signals

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.5: Attach server-computed signals in the vehicle route

**Files:** `app/api/vehicle/[plate]/route.ts`

Signals are computed on the RAW profile (`getVehicleProfile(plate)` output, BEFORE `localizeVehicleProfile`) so the NL/EN napVerdict tokens never get in the way, and `nowMs` comes from server `Date.now()` once per request. Redaction + gating stay exactly as they are; `signals` is a NEW top-level field added alongside the already-built JSON. The base branch (ln 243-254), the unpaid-AI branch (ln 289-299) and the paid-AI branch (ln 301-306) each return JSON, so all three get `signals` (fairPrice only fires when `hasAccess`/`hasAiAccess` is true).

- [ ] MODIFY the import block. Current ln 14-20:

```ts
import { hasPaidPlateAccess } from "@/lib/payments/server-access";
import { redactPremiumValue } from "@/lib/api/premium-value";
import { cookies } from "next/headers";
import { USER_SESSION_COOKIE, verifyUserSession } from "@/lib/user/auth";
import { ReportDownloadModel } from "@/models/ReportDownload";
import { sendEmail } from "@/lib/email/resend";
import { isSamplePlate } from "@/lib/sample";
```

  Add the signals import (insert after the `redactPremiumValue` line):

```ts
import { hasPaidPlateAccess } from "@/lib/payments/server-access";
import { redactPremiumValue } from "@/lib/api/premium-value";
import { computeVehicleSignals } from "@/lib/vehicle/signals";
import { cookies } from "next/headers";
import { USER_SESSION_COOKIE, verifyUserSession } from "@/lib/user/auth";
import { ReportDownloadModel } from "@/models/ReportDownload";
import { sendEmail } from "@/lib/email/resend";
import { isSamplePlate } from "@/lib/sample";
```

- [ ] MODIFY the base (no-AI, no-download) branch. Current ln 243-254:

```ts
    if (!includeAi && !downloadReport) {
      const profile = await getVehicleProfile(plate);
      const localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
      // Log our derived value (full, pre-redaction) for the market time-series,
      // and resolve access in parallel. The market value is premium: strip it
      // unless this browser paid for the plate.
      const [hasAccess] = await Promise.all([
        hasPaidPlateAccess(plate),
        logMarketAggregate(plate, locale, localized)
      ]);
      return NextResponse.json(redactPremiumValue(localized, hasAccess));
    }
```

  Replace with (compute signals on the RAW `profile` after access resolves; attach as a free top-level field):

```ts
    if (!includeAi && !downloadReport) {
      const profile = await getVehicleProfile(plate);
      const localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
      // Log our derived value (full, pre-redaction) for the market time-series,
      // and resolve access in parallel. The market value is premium: strip it
      // unless this browser paid for the plate.
      const [hasAccess] = await Promise.all([
        hasPaidPlateAccess(plate),
        logMarketAggregate(plate, locale, localized)
      ]);
      // Signals are computed on the RAW (pre-localization) profile so the
      // napVerdict thresholds never see EN tokens, and shipped as a FREE field
      // (fairPrice only appears when the plate is paid). nowMs is the single
      // server timestamp so the client renders without hydration drift.
      const signals = computeVehicleSignals({ profile, nowMs: Date.now(), hasAccess });
      return NextResponse.json({ ...redactPremiumValue(localized, hasAccess), signals });
    }
```

- [ ] MODIFY the unpaid-AI branch. Current ln 289-299:

```ts
    const hasAiAccess = await hasPaidPlateAccess(plate);
    if (!hasAiAccess) {
      const profile = await getVehicleProfile(plate);
      let localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
      localized = applyMileageValuationOverride(localized, userMileage);
      // No access: also strip the premium market value from this (AI) branch.
      return NextResponse.json({
        ...redactPremiumValue(localized, false),
        aiInsights: null,
        aiValuation: null
      });
    }
```

  Replace with (add free signals here too, hasAccess false so no fairPrice):

```ts
    const hasAiAccess = await hasPaidPlateAccess(plate);
    if (!hasAiAccess) {
      const profile = await getVehicleProfile(plate);
      let localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
      localized = applyMileageValuationOverride(localized, userMileage);
      const signals = computeVehicleSignals({ profile, nowMs: Date.now(), hasAccess: false });
      // No access: also strip the premium market value from this (AI) branch.
      return NextResponse.json({
        ...redactPremiumValue(localized, false),
        signals,
        aiInsights: null,
        aiValuation: null
      });
    }
```

- [ ] MODIFY the paid-AI branch. Current ln 301-306:

```ts
    const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(plate, locale, userMileage);
    return NextResponse.json({
      ...localized,
      aiInsights,
      aiValuation
    });
```

  Replace with (recompute the raw profile once for signals; `buildLocalizedWithAi` does its own `getVehicleProfile` for the localized+AI payload, so fetch the raw profile here for the deterministic signals; `getVehicleProfile` is the 24h-cached path per CLAUDE.md so the second call is cache-served):

```ts
    const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(plate, locale, userMileage);
    // hasAiAccess is true on this branch -> fairPrice may appear. Signals run on
    // the RAW (cache-served) profile, not the localized/AI-overridden object.
    const rawProfile = await getVehicleProfile(plate);
    const signals = computeVehicleSignals({ profile: rawProfile, nowMs: Date.now(), hasAccess: true });
    return NextResponse.json({
      ...localized,
      signals,
      aiInsights,
      aiValuation
    });
```

- [ ] VERIFY typecheck + production build (build also runs the route's type inference; MongoDB-less build succeeds per CLAUDE.md):

```bash
cd /c/Users/Sabur/sites/kentekenrapport && npm run typecheck && npm run build
```

  Expected: typecheck no output exit 0; `next build` completes with "Compiled successfully" / exit 0.

- [ ] Commit:

```bash
cd /c/Users/Sabur/sites/kentekenrapport && git add "app/api/vehicle/[plate]/route.ts" && git commit -m "feat(report): attach server-computed signals to vehicle API (free, raw profile)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.6: Build JudgmentBlock.module.css (tone CSS mirroring TrustBadges)

**Files:** `components/vehicle/JudgmentBlock.module.css`

Mirrors the `ok/warn/danger` color tokens from `TrustBadges.module.css` (ln 49-74) so the BLUF block matches the existing tone language. Yellow stays out (warn uses amber #d97706 only as the existing TrustBadges does). No gradients beyond the existing palette.

- [ ] WRITE `components/vehicle/JudgmentBlock.module.css` (COMPLETE file):

```css
.block {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 18px 20px;
  border-radius: 16px;
  border: 1px solid var(--kr-line, #e2e8f2);
  background: #fff;
  margin: 0 0 18px;
}

/* Verdict heading */
.verdict {
  display: flex;
  align-items: center;
  gap: 11px;
}

.verdictIcon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
}

.verdictHeading {
  font-weight: 800;
  font-size: 18px;
  line-height: 1.25;
  color: #0f172a;
  min-width: 0;
}

.verdictOk .verdictIcon {
  background: #dcfce7;
  color: #16a34a;
}
.verdictWarn .verdictIcon {
  background: #fef3c7;
  color: #d97706;
}
.verdictDanger .verdictIcon {
  background: #fee2e2;
  color: #dc2626;
}

/* Signal rows */
.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  text-align: left;
  padding: 11px 13px;
  border-radius: 12px;
  border: 1px solid var(--kr-line, #e2e8f2);
  background: #f8fafc;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.row:hover {
  border-color: #cbd5e1;
}

.rowIcon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
}

.rowText {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}

.rowLabel {
  font-weight: 700;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.25;
}

.rowSub {
  font-size: 12px;
  color: #5b6b84;
  line-height: 1.4;
}

.rowChip {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.ok {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.ok .rowIcon {
  background: #dcfce7;
  color: #16a34a;
}
.ok .rowChip {
  background: #dcfce7;
  color: #15803d;
}

.warn {
  border-color: #fde68a;
  background: #fffbeb;
}
.warn .rowIcon {
  background: #fef3c7;
  color: #d97706;
}
.warn .rowChip {
  background: #fef3c7;
  color: #b45309;
}

.danger {
  border-color: #fecaca;
  background: #fef2f2;
}
.danger .rowIcon {
  background: #fee2e2;
  color: #dc2626;
}
.danger .rowChip {
  background: #fee2e2;
  color: #b91c1c;
}

/* Alerts (risico-bij-uitzondering) */
.alerts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 13px;
  border-radius: 12px;
  border: 1px solid #fecaca;
  background: #fef2f2;
}

.alertsTitle {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #b91c1c;
}

.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #0f172a;
}

.alertDot {
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
.alertWarn .alertDot {
  color: #d97706;
}
.alertDanger .alertDot {
  color: #dc2626;
}

/* Summary teaser line */
.teaser {
  font-size: 13px;
  color: #5b6b84;
  line-height: 1.5;
  margin: 0;
}
.teaserStrong {
  color: #0f172a;
  font-weight: 700;
}
```

- [ ] No standalone command for a CSS module file; it is verified together with the component in Task 1.8. Commit alongside the component (single commit in 1.7).

---

### Task 1.7: Build JudgmentBlock.tsx (free BLUF block)

**Files:** `components/vehicle/JudgmentBlock.tsx`

Reads the server `signals` (`VehicleSignalReport`) from `useVehicleLookup(plate).data.signals`; renders verdict heading colored by tone, the `signals[]` as tappable colored rows (`onJump(signal.group)`), the `alerts[]` list, and the summary teaser. `useAiReport(plate)` refines the heading after unlock (when `insights.summary` exists). Tone is icon + word + color (never color alone). `lucide-react` icons. No fake blur. Props per the locked contract: `{ plate; locale; onJump }`.

- [ ] WRITE `components/vehicle/JudgmentBlock.tsx` (COMPLETE file):

```tsx
"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { useAiReport } from "@/hooks/useAiReport";
import type { Signal, SignalTone, VehicleSignalReport } from "@/lib/vehicle/signals";
import type { GroupId } from "@/lib/vehicle/groups";
import styles from "./JudgmentBlock.module.css";

type Props = {
  plate: string;
  locale: "nl" | "en";
  onJump: (groupId: string) => void;
};

const VERDICT_CLASS: Record<SignalTone, string> = {
  ok: styles.verdictOk,
  warn: styles.verdictWarn,
  danger: styles.verdictDanger
};

const TONE_WORD: Record<SignalTone, { nl: string; en: string }> = {
  ok: { nl: "In orde", en: "OK" },
  warn: { nl: "Let op", en: "Attention" },
  danger: { nl: "Risico", en: "Risk" }
};

function ToneIcon({ tone, size }: { tone: SignalTone; size: number }) {
  if (tone === "ok") return <CheckCircle2 size={size} />;
  if (tone === "warn") return <AlertTriangle size={size} />;
  return <ShieldAlert size={size} />;
}

/**
 * BLUF (bottom line up front): the free verdict block at the very top of the
 * report. Reads the server-computed signals (no client recompute, no
 * Date.now/random -> no hydration risk) and refines only the heading text from
 * the AI summary after unlock. Tone is always icon + word + color for
 * accessibility, never color alone. No fake blur: every driver here is free.
 */
export function JudgmentBlock({ plate, locale, onJump }: Props) {
  const nl = locale === "nl";
  const { data } = useVehicleLookup(plate);
  const { insights } = useAiReport(plate);

  const report = (data as { signals?: VehicleSignalReport } | undefined)?.signals;
  if (!report) return null;

  const { verdict, signals, alerts, summary } = report;

  // After unlock the AI summary may refine the heading; fall back to the
  // deterministic honest heading otherwise.
  const aiHeading = insights?.summary?.trim();
  const heading = aiHeading && aiHeading.length > 0 ? aiHeading : nl ? verdict.headingNl : verdict.headingEn;

  const teaserParts: string[] = [];
  teaserParts.push(
    nl
      ? `Wij controleerden ${summary.checked} signalen.`
      : `We checked ${summary.checked} signals.`
  );
  teaserParts.push(
    nl
      ? `${summary.needAttention} ${summary.needAttention === 1 ? "vraagt" : "vragen"} aandacht.`
      : `${summary.needAttention} need${summary.needAttention === 1 ? "s" : ""} attention.`
  );

  return (
    <section className={styles.block} aria-label={nl ? "Oordeel" : "Verdict"}>
      <div className={`${styles.verdict} ${VERDICT_CLASS[verdict.tone]}`}>
        <span className={styles.verdictIcon}>
          {verdict.tone === "ok" ? <ShieldCheck size={22} /> : <ToneIcon tone={verdict.tone} size={22} />}
        </span>
        <h2 className={styles.verdictHeading}>{heading}</h2>
      </div>

      <div className={styles.rows}>
        {signals.map((signal: Signal) => {
          const word = nl ? TONE_WORD[signal.tone].nl : TONE_WORD[signal.tone].en;
          return (
            <button
              key={signal.key}
              type="button"
              className={`${styles.row} ${styles[signal.tone]}`}
              onClick={() => onJump(signal.group as GroupId)}
            >
              <span className={styles.rowIcon}>
                <ToneIcon tone={signal.tone} size={17} />
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{nl ? signal.labelNl : signal.labelEn}</span>
                <span className={styles.rowSub}>{nl ? signal.subNl : signal.subEn}</span>
              </span>
              <span className={styles.rowChip}>{word}</span>
            </button>
          );
        })}
      </div>

      {alerts.length > 0 ? (
        <div className={styles.alerts}>
          <span className={styles.alertsTitle}>{nl ? "Risicos bij uitzondering" : "Exception risks"}</span>
          {alerts.map((alert) => (
            <span
              key={alert.key}
              className={`${styles.alert} ${alert.tone === "danger" ? styles.alertDanger : styles.alertWarn}`}
            >
              <span className={styles.alertDot}>
                <ToneIcon tone={alert.tone} size={14} />
              </span>
              {nl ? alert.labelNl : alert.labelEn}
            </span>
          ))}
        </div>
      ) : null}

      <p className={styles.teaser}>
        {teaserParts.join(" ")}
        {summary.priceAffecting > 0 ? (
          <span className={styles.teaserStrong}>
            {nl ? " 1 raakt de eerlijke prijs." : " 1 affects the fair price."}
          </span>
        ) : null}
      </p>
    </section>
  );
}
```

> Note on `insights?.summary`: `AiInsights.summary` is a `string` (see `hooks/useAiReport.ts` ln 8). `useAiReport` returns `null` insights pre-unlock, so `aiHeading` is undefined and the deterministic heading shows. No euro number ever enters this block.

- [ ] Commit the component + its CSS together:

```bash
cd /c/Users/Sabur/sites/kentekenrapport && git add components/vehicle/JudgmentBlock.tsx components/vehicle/JudgmentBlock.module.css && git commit -m "feat(report): add free JudgmentBlock BLUF (verdict + signal rows + alerts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.8: Mount JudgmentBlock at the top of FullReportScreen

**Files:** `components/vehicle/FullReportScreen.tsx`

Mount after `<ScanIntro>` (ln 418), before `<div className={styles.container}>` / nav. `onJump` is the Phase-1 temporary scroll-by-group-id (`document.getElementById(groupId).scrollIntoView(...)`); full nav wiring (controlled open state + expand-all + open-then-scroll) lands in Phase 2. Because the group accordion does not exist yet in Phase 1, the temporary `onJump` falls back to the section id closest to that group (the first sectionId of the group) so a row tap still scrolls somewhere meaningful in the current layout.

- [ ] MODIFY the import block of `FullReportScreen.tsx`. Add the `JudgmentBlock` import next to the other vehicle-screen imports. Current ln 42-45:

```tsx
import { ReportSectionNav } from "./ReportSectionNav";
import { TrustBadges } from "./TrustBadges";
import { ComparableListings } from "./ComparableListings";
import styles from "./FullReportScreen.module.css";
```

  Replace with:

```tsx
import { ReportSectionNav } from "./ReportSectionNav";
import { TrustBadges } from "./TrustBadges";
import { ComparableListings } from "./ComparableListings";
import { JudgmentBlock } from "./JudgmentBlock";
import { GROUPS } from "@/lib/vehicle/groups";
import styles from "./FullReportScreen.module.css";
```

- [ ] MODIFY the render: insert the temporary `onJump` handler and `<JudgmentBlock>` right after `<ScanIntro>`. Current ln 416-421:

```tsx
  return (
    <div className={styles.page}>
      <ScanIntro plate={normalized} />

      <div className={styles.container}>
        <ReportSectionNav items={navItems} />
```

  Replace with (Phase-1 onJump maps a groupId to that group's first sectionId, which DOES exist in the current section layout, and scrolls it into view; Phase 2 replaces this with open-then-scroll on the group header):

```tsx
  // Phase 1 temporary jump: the group accordion lands in Phase 2, so map a
  // group id to its first section id (which exists in the current layout) and
  // scroll there. Phase 2 will open the group then scroll its header.
  const jumpToGroup = (groupId: string) => {
    const group = GROUPS.find((g) => g.id === groupId);
    const targetId = group?.sectionIds[0] ?? groupId;
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.page}>
      <ScanIntro plate={normalized} />

      <div className={styles.container}>
        <JudgmentBlock plate={normalized} locale={locale} onJump={jumpToGroup} />

        <ReportSectionNav items={navItems} />
```

- [ ] VERIFY typecheck + build:

```bash
cd /c/Users/Sabur/sites/kentekenrapport && npm run typecheck && npm run build
```

  Expected: typecheck no output exit 0; `next build` "Compiled successfully" exit 0.

- [ ] VERIFY headless Chromium per CLAUDE.md (production mode, desktop 1380 + mobile 390, mocked route payload, assert no pageerror, verdict heading + 3 signal rows render, a row click scrolls). Create `scripts/verify-judgment.mjs`:

```js
import { chromium } from "playwright";
import { spawn } from "node:child_process";

// Minimal production payload mimicking /api/vehicle/<plate> with the new
// signals field (raw RDW-shape; only what the report screens read).
const PLATE = "16RSL9";
const PAYLOAD = {
  plate: PLATE,
  displayPlate: "16-RSL-9",
  fromCache: false,
  enriched: { isImported: false, mileageVerdict: "LOGISCH", estimatedValueNow: null },
  vehicle: {
    brand: "TOYOTA", tradeName: "YARIS", year: 2015, color: { primary: null, secondary: null },
    fuelType: "Benzine", emissionStandard: "EURO 5 F", apkExpiryDate: "2027-01-01",
    owners: { count: null }, exportIndicator: false, wok: false, transferPossible: true,
    insured: true, isTaxi: false, hasOpenRecall: false, napVerdict: "Logisch", napLastYear: null,
    cataloguePrice: 18000, recallsCount: 0, engine: {}, dimensions: {}, weight: {}
  },
  inspections: [], defects: [], defectDescriptions: {}, recalls: [], typeApprovals: [],
  raw: { main: [], fuel: [], apk: [], defects: [], recalls: [], body: [], typeApprovals: [] },
  signals: {
    verdict: { tone: "warn", headingNl: "Redelijke koop, let op 1 punt", headingEn: "Reasonable buy, mind 1 point" },
    signals: [
      { key: "safety", tone: "ok", group: "g3-risico", affectsPrice: false, labelNl: "Veiligheid en status", labelEn: "Safety and status", subNl: "Geen blokkades in de RDW-registratie", subEn: "No blocks" },
      { key: "mileage", tone: "warn", group: "g4-km", affectsPrice: true, labelNl: "Kilometerstand en NAP", labelEn: "Mileage and NAP", subNl: "Geen sluitend NAP-oordeel beschikbaar", subEn: "No verdict" },
      { key: "apk", tone: "ok", group: "g5-apk", affectsPrice: false, labelNl: "APK-geldigheid", labelEn: "MOT validity", subNl: "APK ruim geldig", subEn: "MOT valid" }
    ],
    alerts: [{ key: "nap", tone: "warn", group: "g4-km", labelNl: "Geen NAP-oordeel", labelEn: "No NAP verdict" }],
    summary: { checked: 3, needAttention: 1, priceAffecting: 0 },
    groupStatus: {
      "g1-verdict": { tone: "warn", labelNl: "Redelijke koop, let op 1 punt", labelEn: "Reasonable buy" },
      "g2-markt": { tone: "ok", labelNl: "Ontgrendel de marktwaarde-analyse", labelEn: "Unlock" },
      "g3-risico": { tone: "ok", labelNl: "Veiligheid en status", labelEn: "Safety" },
      "g4-km": { tone: "warn", labelNl: "Kilometerstand en NAP", labelEn: "Mileage" },
      "g5-apk": { tone: "ok", labelNl: "APK-geldigheid", labelEn: "MOT" },
      "g6-voertuig": { tone: "ok", labelNl: "RDW-voertuiggegevens compleet", labelEn: "Complete" }
    }
  }
};

const server = spawn("npx", ["next", "start", "-p", "3210"], { stdio: "inherit", shell: true });
await new Promise((r) => setTimeout(r, 6000));

const browser = await chromium.launch();
let failed = false;
for (const [w, h, name] of [[1380, 900, "desktop"], [390, 844, "mobile"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.error(`[${name}] pageerror`, e.message); failed = true; });
  // Mock every vehicle API call with our payload (covers ?include_ai too).
  await page.route("**/api/vehicle/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PAYLOAD) })
  );
  await page.goto(`http://localhost:3210/search/${PLATE}`, { waitUntil: "networkidle" });
  // Skip the ScanIntro overlay if present.
  const skip = page.getByRole("button", { name: /Overslaan|Skip/ });
  if (await skip.count()) await skip.first().click().catch(() => {});
  await page.waitForTimeout(800);
  const heading = await page.getByText("Redelijke koop, let op 1 punt").count();
  const rows = await page.locator("section[aria-label='Oordeel'] button").count();
  console.log(`[${name}] verdict heading=${heading} signalRows=${rows}`);
  if (heading < 1) { console.error(`[${name}] MISSING verdict heading`); failed = true; }
  if (rows < 3) { console.error(`[${name}] expected >=3 signal rows, got ${rows}`); failed = true; }
  // Row click should scroll (kilometerstand section comes into view).
  const before = await page.evaluate(() => window.scrollY);
  await page.locator("section[aria-label='Oordeel'] button").nth(1).click();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => window.scrollY);
  console.log(`[${name}] scrollY ${before} -> ${after}`);
  if (after === before) { console.error(`[${name}] row click did not scroll`); failed = true; }
  await ctx.close();
}
await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
```

  Run it (the route path is the existing report route; adjust `/search/<plate>` only if the report URL differs in this repo):

```bash
cd /c/Users/Sabur/sites/kentekenrapport && npm run build && npm i --no-save playwright@1.56.1 && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-judgment.mjs
```

  Expected output: for both `desktop` and `mobile`: `verdict heading=1 signalRows=3`, a `scrollY A -> B` with `B != A`, no `pageerror` lines, and process exit 0. (Sandbox cannot reach RDW/Mongo, but the route is fully mocked, so this runs offline.)

- [ ] Remove the throwaway verify script (it is not production code):

```bash
cd /c/Users/Sabur/sites/kentekenrapport && rm -f scripts/verify-judgment.mjs
```

- [ ] Commit:

```bash
cd /c/Users/Sabur/sites/kentekenrapport && git add components/vehicle/FullReportScreen.tsx && git commit -m "feat(report): mount JudgmentBlock at top of report (temp scroll jump; full nav in Phase 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.9: Phase-1 final gate (full test + typecheck + build)

**Files:** none (verification only)

- [ ] RUN the full unit suite, typecheck, and production build together:

```bash
cd /c/Users/Sabur/sites/kentekenrapport && npm test && npm run typecheck && npm run build
```

  Expected: `npm test` -> `# fail 0` (mapper + groups + signals); `npm run typecheck` -> no output, exit 0; `npm run build` -> "Compiled successfully", exit 0.

- [ ] Confirm the working tree is clean (all Phase-1 commits landed, no stray throwaway files):

```bash
cd /c/Users/Sabur/sites/kentekenrapport && git status --porcelain
```

  Expected: empty output.

**Phase 1 done.** Phase 2 will: convert sections into the six `GROUPS` accordion (`ReportGroup.tsx` with always-in-DOM headers), add `FullReportScreen` controlled `openGroups` state + expand/collapse-all, make `ReportSectionNav` group-level with `onJump`/`onExpandAll`/`allOpen` and scrollspy on group headers, replace the temporary `jumpToGroup` with open-then-scroll, extract `ReportTeaser.tsx`, remove `RiskOverviewScreen`/orphans from the report, and wire `groupStatus` into group header status lines.
