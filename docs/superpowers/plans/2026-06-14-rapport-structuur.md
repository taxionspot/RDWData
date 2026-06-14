# A-hybrid rapport-structuur , Implementatieplan (master)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. The detailed, bite-sized tasks live in the six phase files in [`2026-06-14-rapport-structuur/`](2026-06-14-rapport-structuur/). Steps use checkbox (`- [ ]`) syntax. Read this master first (execution order + corrections), then execute the phases in order.

**Goal:** Rebuild the kentekenrapport report into the "A-hybrid" structure from [the design spec](../specs/2026-06-14-rapport-structuur-design.md): a free judgment-first block (BLUF) on top, six collapsible theme groups each showing an always-visible colored status line, a sticky jump-nav with "expand all", an honest teaser and paywall (no fake blur, no money-back), and a PDF that is the fully-expanded paper twin in the same order.

**Architecture:** One deterministic signal engine (`lib/vehicle/signals.ts`) is computed SERVER-SIDE on the raw `VehicleProfile` (with `nowMs` injected) and attached to the API response. The web `JudgmentBlock`, every group status line, the teaser, and the PDF all read that one report object. This removes hydration risk, NL/EN ambiguity, and duplicated logic. The grouping taxonomy lives in `lib/vehicle/groups.ts`. Per-section premium gating stays exactly where it is today (each section self-wraps in `PremiumLock`); the new group layer only adds the accordion, the status line, and the nav grouping.

**Tech stack:** Next.js 14 App Router, TypeScript, MongoDB/Mongoose, CSS Modules, `lucide-react`, `pdf-lib`, RTK Query. Unit tests via `node --test` over `tsconfig.test.json` (the pure logic is TDD'd; React/CSS is verified in the browser preview).

---

## 1. Execution order + corrections (READ FIRST)

Execute the phases strictly in order. Each phase ends green (tests + typecheck + build) and is independently committable.

| # | Phase file | Leaves the app | 
|---|---|---|
| 0 | `phase-0-foundation-signals-groups.md` | `signals.ts` + `groups.ts` + full unit tests, nothing user-visible yet |
| 1 | `phase-1-server-signals-and-judgment-block.md` | server attaches `signals`; free `JudgmentBlock` renders at the top |
| 2 | `phase-2-accordion-groups-and-nav.md` | six accordion groups + jump-nav + expand-all; `risico` + orphans dropped from the report |
| 3 | `phase-3-teaser-and-paywall-honesty.md` | real `ReportTeaser`; de-blurred honest `PremiumLock`; one paywall modal; reviews slot |
| 4 | `phase-4-section-fixes-and-cleanup.md` | `embedded` bugs fixed; inner accordions reconciled with group-collapse |
| 5 | `phase-5-pdf-mirror.md` | PDF page 1 = judgment block; body re-grouped G1..G6; TOC |

**Three corrections that override the per-phase wording (banners are also in the phase files):**

1. **Phase 1 starts at Task 1.4.** Phase 0 is the canonical foundation: it creates `lib/vehicle/groups.ts`, `lib/vehicle/signals.ts`, `tests/groups.test.ts`, `tests/signals.test.ts`, and the `tsconfig.test.json` allowlist. Phase 1 Tasks 1.1, 1.2, 1.3 re-create that same foundation (kept only for standalone execution). When running the full plan, SKIP Phase 1 Tasks 1.1-1.3 and begin at Task 1.4 (vehicleApi response type), then 1.5 (route wiring), 1.6 (JudgmentBlock CSS), 1.7 (JudgmentBlock.tsx), 1.8 (mount), 1.9 (gate).

2. **Phase 2: skip the JudgmentBlock stub.** `JudgmentBlock.tsx` is built in Phase 1, so by Phase 2 it already exists. Import and render the real `./JudgmentBlock`; do NOT create the temporary stub.

3. **Phase 5: do not put `pdf-report.ts` in the test allowlist.** Extract the pure helpers (`toneToPdfWord`, `accentForTone`, `inkForTone`, `pdfGroupOrder`, `pdfSectionTitle`) into a NEW standalone module `lib/vehicle/pdf-presentation.ts` that imports only `SignalTone` (from `lib/vehicle/signals`) and `GROUPS`/`GroupId` (from `lib/vehicle/groups`). `pdf-report.ts` imports them from there. Add only `lib/vehicle/pdf-presentation.ts` to `tsconfig.test.json` (keep all Phase 0 entries); the test imports the helpers from `../lib/vehicle/pdf-presentation`. This keeps pdf-lib out of the unit-test compile.

---

## 2. Locked technical contracts (single source of truth)

All phases implement these exact signatures. Do not rename types, functions, props, or keys.

### `lib/vehicle/groups.ts`
```ts
export type GroupId = "g1-verdict" | "g2-markt" | "g3-risico" | "g4-km" | "g5-apk" | "g6-voertuig";
export type ReportSectionId = "overzicht" | "ai-analyse" | "markt" | "te-koop" | "kilometerstand"
  | "apk" | "risico" | "schade" | "eigendom" | "apk-intelligence" | "specs" | "acties";
export type GroupDef = { id: GroupId; labelNl: string; labelEn: string;
  lockKey: keyof PublicSiteSettings["lockSections"] | null; defaultOpen: boolean; sectionIds: ReportSectionId[] };
export const GROUPS: GroupDef[];
```
GROUPS contents: g1-verdict (lockKey null, open, [overzicht, ai-analyse]); g2-markt ("marketAnalysis", open, [markt, te-koop]); g3-risico ("damageHistory", collapsed, [schade]); g4-km ("mileageHistory", collapsed, [kilometerstand]); g5-apk ("inspectionTimeline", collapsed, [apk, apk-intelligence]); g6-voertuig ("ownershipHistory", collapsed, [eigendom, specs]). `risico` (RiskOverviewScreen) is dropped from the report and appears in no group. `acties` is the free footer, outside GROUPS.

### `lib/vehicle/signals.ts`
```ts
export type SignalTone = "ok" | "warn" | "danger";
export type SignalKey = "safety" | "fairPrice" | "mileage" | "apk";
export type Signal = { key: SignalKey; tone: SignalTone; labelNl; labelEn; subNl; subEn; group: GroupId; affectsPrice: boolean };
export type Alert = { key: string; tone: SignalTone; labelNl; labelEn; group: GroupId };
export type Verdict = { tone: SignalTone; headingNl; headingEn };
export type SignalSummary = { checked: number; needAttention: number; priceAffecting: number };
export type GroupStatus = { tone: SignalTone; labelNl; labelEn };
export type VehicleSignalReport = { verdict; signals: Signal[]; alerts: Alert[]; summary: SignalSummary; groupStatus: Record<GroupId, GroupStatus> };
export type SignalInput = { profile: VehicleProfile; nowMs: number; hasAccess: boolean };
export function computeVehicleSignals(input: SignalInput): VehicleSignalReport;
```
Thresholds (computed on the RAW profile; EN napVerdict tokens accepted defensively):
- **safety** (g3, affectsPrice false): danger if `wok` or `transferPossible === false`; warn if `hasOpenRecall` or `recallsCount > 0` or `isTaxi` or `enriched.isImported` or `defects.length > 0`; else ok.
- **mileage** (g4, affectsPrice true): danger if `napVerdict` Onlogisch/Implausible; warn if null/"Geen oordeel"/"No verdict" or `enriched.mileageVerdict === "TWIJFELACHTIG"`; ok if Logisch/Plausible.
- **apk** (g5, affectsPrice false): danger if expiry < now or `wok`; warn if within 30 days or date null; else ok. (Never colored by the fabricated `apkPassChance`.)
- **fairPrice** (g2, affectsPrice true): present ONLY when `hasAccess && enriched.estimatedValueNow != null`; tone ok; the euro number never leaves the client.
- **summary**: checked = 3; needAttention = non-ok among safety/mileage/apk; priceAffecting = truthy count of [isImported, mileage != ok, wok].
- **verdict.tone** = worst of safety/mileage/apk.
- **alerts** = only the real exceptions (risico-bij-uitzondering); empty when verdict ok.
- **groupStatus** = every GroupId; g1 mirrors verdict, g2 reflects access, g3/g4/g5 mirror the signals, g6 reflects import.

### Response carrier
The vehicle API attaches `signals` as a free top-level field. The RTK query return type widens to `VehicleLookupResponse = VehicleProfile & { signals?: VehicleSignalReport; aiInsights?: unknown; aiValuation?: unknown }` (Phase 1 Task 1.4). Components read `data.signals` defensively (optional-chained). The signals object is locale-agnostic in transit (it carries labelNl/labelEn/subNl/subEn); the component picks by locale.

### Component contracts
- `JudgmentBlock.tsx` props `{ plate; locale; onJump: (groupId: string) => void }`. Free; top of report; reads `data.signals`; renders verdict heading + tappable colored signal rows (tap -> `onJump(group)`) + alerts list + summary teaser ("Wij controleerden N signalen. M vragen aandacht." plus " 1 raakt de eerlijke prijs." when priceAffecting > 0). Tone = icon + word + color. No fake blur. After unlock, `useAiReport` may refine the heading.
- `ReportGroup.tsx` props `{ group: GroupDef; index; status: GroupStatus; isPremium; open; onToggle: (id: GroupId) => void; locale; children }`. Header (with `id={group.id}`) is ALWAYS in the DOM (so scrollspy + scrollIntoView can target it when collapsed); body collapses; body wrapped in `SectionErrorBoundary`.
- `ReportSectionNav` items become group-level `{ id, label, locked }` + props `onJump`, `onExpandAll`, `allOpen`; scrollspy observes group headers.
- `FullReportScreen` owns `openGroups: Record<GroupId, boolean>` seeded from `defaultOpen`; `onJump(groupId)` opens the group then scrolls its header.

---

## 3. Cross-phase conventions

- **Verification.** Prefer the in-editor browser preview tools (`preview_start`, reload, `preview_console_logs`, `preview_snapshot`, `preview_screenshot`) at desktop (~1380px) and mobile (~390px) widths. The phase files include throwaway `scripts/verify-*.mjs` Playwright scripts as an alternative for headless/CI; either is acceptable, neither is committed. Pure logic is verified by `npm test`; every phase also runs `npm run typecheck` and `npm run build` (a MongoDB-less build logs 500s for DB routes, which is normal per CLAUDE.md and still exits 0).
- **Server gating is the real boundary, never weaken it.** `redactPremiumValue` nulls the 6 premium value fields; `hasPaidPlateAccess` is the per-buyer cookie check; the PDF 402 gate stays FIRST. The free teaser/BLUF derive from FLAGS only, never reconstruct the euro value.
- **No double-gating.** Each section screen already self-wraps in `PremiumLock` (its own `sectionKey`). The group `lockKey` only drives the header lock chip + nav lock icon + collapsed teaser. Do not add a second `PremiumLock` in the FullReportScreen registry.
- **Scroll offset = one value (132px).** Align `FullReportScreen.module.css scroll-margin-top`, `globals.css scroll-padding-top`, and the nav observer `rootMargin` to clear the sticky header (`top:58px`) + the in-report nav. Preserve all `min-width:0; max-width:100%` overflow guards (the 13-June mobile fix) so the accordion never reintroduces horizontal scroll.
- **Sample plate `H223JZ`** (`lib/sample.ts`) renders fully expanded everywhere (web + PDF), always free by design.
- **Shipped copy carries no em-dash or en-dash** and is honest (only real RDW/derived data; never imply "not stolen"/"no damage"; hide empty data). The phase files include no-dash unit tests over every emitted signal/alert string. (The plan markdown prose itself is internal and not subject to this.)
- **Reviews on the paywall:** there are none; do not fabricate. Phase 3 adds an OPTIONAL reviews slot (settings array, default empty) that renders nothing when empty, so real NL quotes can be added later in one place. Keep the existing honest trust elements (RDW-geverifieerd, directe toegang, herroepingsrecht, iDEAL/secure badge).
- **Price** is always read from site-settings at runtime (the create-order route ignores client amounts). Note: `defaults.ts payment.amount` is `"9.95"` but the live DB value is the real price (6,95 per CLAUDE.md); do not hardcode a price in copy, render the settings value.

---

## 4. Self-review (against the design spec)

**Spec coverage:** every design-spec section maps to a phase. Judgment block + 3-5 colored signal lines + risico-bij-uitzondering + tappable-to-group -> Phase 1. Six groups + always-visible status line + sticky jump-nav + expand-all + G1/G2 open, G3-6 collapsed -> Phase 2. Concrete teaser (count + category + "raakt de prijs", no fake blur) + paywall card (no money-back, honest trust, sticky CTA, price small, reviews slot) -> Phase 3. Drop the Finnik flat-12-section pattern + reconcile embedded sections -> Phase 2 + Phase 4. PDF = fully-expanded paper twin, page 1 = verdict (colors survive grayscale via ASCII words + dark-on-light fills) + clickable TOC -> Phase 5.

**Open decision points from the spec, resolved:** (1) signal set = safety/mileage/apk free + fairPrice premium, thresholds locked in section 2; (2) G1 + G2 open, G3-6 collapsed (per spec table); (3) reviews = empty optional slot, no fabrication; (4) RDW fields free vs premium = unchanged (only the 6 value fields + AI stay gated), so the BLUF renders pre-payment with no fake blur.

**Placeholder scan:** clean (no TBD/TODO/"fill in"/"similar to"); the only "stub" is the Phase 2 standalone-only stub, which is skipped in full-plan order.

**Type consistency:** `Signal`/`Alert`/`Verdict`/`GroupStatus`/`VehicleSignalReport`/`GroupId`/`GroupDef` are identical across phases (canonical in Phase 0). `signals` carrier standardized on `VehicleLookupResponse` (Phase 1 Task 1.4). Alert `key` values are internal to `signals.ts` and its tests; downstream renders by label/tone, not key.

**Known limits designed around (hard, do not invent):** no stolen flag, no real damage history, no owner count, no measured odometer; `repairChances`/`knownIssues` are always empty; `ComparableListings` is often empty (Carapis dead). The `mapper.ts notBool()` naming bug was investigated: it does NOT invert, so `hasOpenRecall` and `transferPossible` carry correct semantics and the thresholds are sound (documented by tests in Phase 0).

---

## 5. Execution handoff

Plan complete. Two execution options for the next session:

1. **Subagent-driven (recommended):** dispatch a fresh subagent per task with two-stage review between tasks (superpowers:subagent-driven-development). Fast iteration, clean context per task.
2. **Inline execution:** execute tasks in-session in batches with checkpoints (superpowers:executing-plans).

Either way: run Phase 0 -> 5 in order, honoring the three corrections in section 1, committing per task.
