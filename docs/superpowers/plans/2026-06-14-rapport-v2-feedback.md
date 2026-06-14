# Rapport v2 , owner-feedback implementatieplan

Bron: owner-feedbackrapport (FEEDBACK202.pdf, 14 juni). Branch: feature/rapport-v2-feedback.

## Owner-bevestigde sectie-volgorde (web + PDF)
1. Voertuig + technische kerngegevens (hero, kort, vertrouwen eerst)
2. Kort oordeel/inzicht (1 compact blok, minder kleur/tekst)
3. Marktanalyse (geschatte waarde)
4. Vergelijkbare auto's (gefilterd: prijs-band + km-range + zelfde brandstof)
5. Schatting & risico's
6. Risico's & schade
7. Kilometerstand & NAP
8. APK-historie + faalstatistieken
9. Eigendom & voertuiggegevens (incl. volledige RDW-spectabel)

## Resolved decisions (controller, binnen owner-richting)
- Volledige technische spectabel blijft onderaan (#9, bij eigendom); kerngegevens compact in de hero (#1). Top kort houden.
- Comparable-filter (prijs/km/brandstof) geldt voor de live Apify-kaartjes; deeplink-zoeklinks houden hun bestaande +/-20% prijsband.
- PDF toont vergelijkbare auto's als tekstrijen/zoeklinks (geen foto-herpublicatie, auteursrecht); honest fallback.
- Kaart-prijsband +/-30%, deeplink-band +/-20%.
- AI-samenvatting inkorten + AiReportCache key bumpen (v2 -> v3) verplicht.

## Cross-cutting invariants (NIET breken)
- Server paid-gate op comparable-route; 402-gate-first in PDF; grayscale-safe ASCII-statuswoorden + em/en-dash-strip in PDF; geen "-" placeholders (lege secties verbergen); geen listing-foto's in PDF.

---

> Het onderstaande is de gedetailleerde, geverifieerde code-mapping (4 lezers + synthese). Bouwvolgorde staat in sectie H.

I'll synthesize the 4 maps into one implementation-ready plan. The maps are comprehensive and consistent with each other, so I can produce the unified plan directly.

# Kentekenrapport Report v2 — Unified Implementation Plan

Root: `C:\Users\Sabur\sites\kentekenrapport`

## A. Workstreams overview

1. **Reorder** — Re-sequence the report to the owner's 9-section order on both web and PDF by rewriting `lib/vehicle/groups.ts` (the single source of truth) + lockstep updates to `signals.ts`/`pdf-presentation.ts`. *Risk: `GroupId`/`ReportSectionId` are exhaustive `Record<>` keys in 3 files — any rename breaks `tsc`/`next build` unless all updated together.*
2. **Declutter** — Shorten the AI summary (claude.ts prompt 120-220 → 35-60 words, bump AI cache key), color only on warn/danger status, mobile-first re-verify after reorder. *Risk: stale 200-word summaries served 7 days from `AiReportCache` if cache key not bumped.*
3. **Comparable filter** — Add hard price-band + km-range + same-fuel filter with a fallback ladder in the comparable route (extract to shared helper for PDF reuse). *Risk: thin Apify pool + null fields → empty results unless the fallback ladder and null-as-pass rule are mandatory.*
4. **Loader architecture** — Fix "photos only after refresh": subscribe `ComparableListings` to access-change events + gate first fetch on confirmed access + module-promise cache, warm during ScanIntro. *Risk: throwaway unpaid fetch / skeleton flicker; must preserve the server paid-gate.*
5. **PDF parity** — Make the PDF a 1:1 fully-expanded paper version in the new order: thread missing data (comparables, model-stats, score) into `ReportArgs`, rebuild `buildReportSections`, grayscale-safe, gate-first. *Risk: PDF order is hand-coded (not GROUPS-driven) so it silently desyncs; extra Apify/model-stats calls can block PDF generation.*

---

## B. Section reorder

### Current → target mapping

Current `GROUPS` (`lib/vehicle/groups.ts:34-83`) drives both web (`FullReportScreen.tsx:223-238`) and order references. The new order requires **two structural moves**:

- **`specs` moves from G6 (last) → top group (#1)**, beside `overzicht` identity. (For PDF "core specs first / full specs last" the spec content is *split*: engine/power/dimensions go to #1, the rest stays at #9 — see flag in §H. Web can keep `specs` whole at #1 unless owner wants the split on web too.)
- **Estimate & risks is extracted** from inside `MarketAnalysisScreen.tsx` (it is NOT a standalone section today: cost cards = `estimateRows` lines 227-254 rendered at 393-408; risk band = `<NegotiationBlock>` lines 410-419) into a **new `EstimateRisksScreen`** under a new `schatting` section id, placed at #5 after `te-koop`.

### New GROUPS shape (9 groups)

```
g1-specs      "Voertuig & specificaties"    lockKey: null              defaultOpen: true   → ["overzicht", "specs"]
g2-verdict    "Oordeel"                      lockKey: "riskOverview"    defaultOpen: true   → ["ai-analyse"]
g3-markt      "Marktwaarde"                  lockKey: "marketAnalysis"  defaultOpen: true   → ["markt"]
g4-tekoop     "Vergelijkbaar aanbod"         lockKey: "marketAnalysis"  defaultOpen: false  → ["te-koop"]
g5-schatting  "Schatting & risico"           lockKey: "marketAnalysis"  defaultOpen: false  → ["schatting"]   (NEW)
g6-risico     "Risico's & schade"            lockKey: "damageHistory"   defaultOpen: false  → ["schade"]
g7-km         "Kilometerstand & NAP"         lockKey: "mileageHistory"  defaultOpen: false  → ["kilometerstand"]
g8-apk        "APK-historie + statistiek"    lockKey: "inspectionTimeline" defaultOpen: false → ["apk", "apk-intelligence"]
g9-eigendom   "Eigendom & voertuiggegevens"  lockKey: "ownershipHistory" defaultOpen: false → ["eigendom"]
```

### Exact files to change

- `lib/vehicle/groups.ts` — rewrite `GroupId` union (lines 3-9 → 9 ids), add `"schatting"` to `ReportSectionId` union (lines 11-23), rewrite the `GROUPS` array (lines 34-83) to the shape above.
- `lib/vehicle/signals.ts` — repoint every `Signal.group`/`Alert.group` literal (lines 142,152,162,176,187,197,206,215,224,232,241,250,259) to the renamed ids, and rebuild the exhaustive `groupStatus: Record<GroupId, GroupStatus>` (lines 316-339) for all 9 ids.
- `components/vehicle/FullReportScreen.tsx` — add `schatting` → render fn in the `SECTIONS` registry (lines 58-95); import the new `EstimateRisksScreen`. (Prelude lines 199-221 and the `GROUPS.map` render loop need no structural change — they're generic over GROUPS.)
- `components/vehicle/MarketAnalysisScreen.tsx` — remove `estimateRows` (227-254), `estimatesSection` JSX (393-408), `<NegotiationBlock>` (410-419); keep value hero, chart, "controleer vraagprijs" meter.
- **New `components/vehicle/EstimateRisksScreen.tsx`** — holds the extracted cost cards + `NegotiationBlock`, reads from the same `useVehicleLookup(plate, mileage)` hook (no prop plumbing), wrapped in `<PremiumLock sectionKey="marketAnalysis">`.
- `components/vehicle/JudgmentBlock.tsx:85` — `onJump(signal.group as GroupId)` works as long as signals.ts emits valid ids (no edit needed beyond the rename being consistent).
- PDF order mirrors (see §F): `lib/api/pdf-report.ts` `buildReportSections` (hand-coded banners), `lib/vehicle/pdf-presentation.ts` `pdfSectionTitle` (add `schatting` to nl/en exhaustive records, lines 64-94).

`te-koop`, `schatting`, and `markt` all share `lockKey: "marketAnalysis"` → one unlock unlocks all three (correct); verify the per-group Premium/Included chip in `ReportGroup` reads sensibly across the 3 consecutive shared-lock groups.

---

## C. Declutter

### C1. Shorten the AI summary (the "two-paragraph blob")

- **Source = `lib/api/claude.ts`** `buildAnthropicPrompt`: change `summary 120-220 woorden` → **`summary 35-60 woorden, max 3 korte zinnen, geen herhaling`** in NL (line 181) AND EN (line 217). Optionally cut `recommendation` to one sentence.
- **Bump the AI cache key** (`v2|` → `v3|`) where the key is built (`app/api/vehicle/[plate]/route.ts` or `models/AiReportCache.ts`) so old 200-word summaries don't linger 7 days. **Mandatory.**
- **Fallback** (`buildFallbackVehicleAiReport`, lines 594-604) already short — leave.
- **Rendering side** (`AiAnalysisScreen.tsx`): summary is one `<p>` (line 84) — auto-shortens. With market now in its own group below, **drop the redundant `valuationRow` (lines 119-136)**. `JudgmentBlock.tsx:53-54` uses `insights.summary` as the `<h2>` heading — with a 50-word summary consider truncating to the first sentence for the heading.

### C2. Fewer colors (only warn/danger get color)

- `MarketAnalysisScreen.module.css` — keep status tone on the price verdict (`verdictBox`, lines 381-389); neutralize `valueContext` decoration (line 287); tone `.warning/.success/.fair` → lighter/neutral bg, color only on the icon/word.
- `AiAnalysisScreen.tsx` — keep `levelChip` (status, lines 44-51); strengths/watch-outs = icon color only, neutral text; trim the Sparkles eyebrow (lines 66-69).
- `TrustBadges.tsx` / `TrustBadges.module.css` — render only `warn`/`danger` badges in color; collapse `ok` badges into one calm "X checks passed" pill (copy the `ReportTeaser.tsx:43-50` pattern). Logic in `badges` useMemo (lines 40-130).
- `ReportGroup.module.css` — mute the `ok` status dot (`.statusOk`) to neutral gray across the 9 group headers; keep warn/danger colored.
- `JudgmentBlock.tsx` — keep colored (it IS the status block) but ensure it's the only loud block up top (it currently competes with TrustBadges right below).
- **PDF**: switch hero verdict/risk chips (`pdf-report.ts:645-672`, colors `verdictColor`/`riskColor` lines 89-100) to the calmer `accentForTone`+`inkForTone` used by signal rows, for consistency.

### C3. Mobile-first checks (re-verify after reorder)

- `MarketAnalysisScreen` `mainGrid` (line 271, 2-col) must stack on mobile; new `EstimateRisksScreen` `estimatesGrid` must be 1-col on mobile.
- `TechnicalSpecsScreen` now renders high (top group): default only `performance` accordion open (it currently opens `performance`+`efficiency`, lines 186-191) to keep the top short under the large identity hero.
- 9-item `ReportSectionNav` must scroll horizontally without overlapping the sticky unlock bar (`FullReportScreen.tsx:274-290`).

---

## D. Comparable filter

### Available fields & reference values
- **Listing fields** (`ComparableCar`, `apify.ts:8-22`, normalized 35-54), all `| null`: `priceEur`, `mileageKm`, `year`, `fuelType`, `bodyType`, + brand/model/title/city/region/imageUrl/sourceUrl/source.
- **Subject reference values** already built in the route (`route.ts:136-142`): `year`←`v.year`, `valueNow`←`e.estimatedValueNow`, `mileage`←`e.estimatedMileageNow`, `fuel`←`v.fuelType`, `bodyType`←`v.bodyType`. **No new plumbing needed.**
- **Actor input** (`fetchComparablePool`, `apify.ts:62-86`) is brand+model+maxResults ONLY — no server-side filter, so all filtering is per-request after `getPool`, downstream of the cache. **Do NOT bake bands into the cache key** (`${brand}|${model}`, route:26) — it would shatter the cache and blow the monthly Apify cap.

### The filter (hard bands, applied before final slice)
Keep `rank()` (`route.ts:84-103`) as the scorer; insert a new `selectComparables` that hard-filters first. Recommended in a shared helper `lib/listings/filter.ts` (or `lib/listings/comparable.ts`) so the PDF reuses it.

Recommended bands (subject = looked-up car):
- **Price: ±30%** of `estimatedValueNow` → `[0.70, 1.30] × valueNow`. (A €4.5k subject → €3,150–€5,850, excluding the €20k cars by construction. This is the fix for why €20k cars survive: the current price penalty saturates at `min(...,60)`, `route.ts` price term.)
- **Mileage: ± max(0.40 × mileage, 40,000) km** (percentage with an absolute 40k floor so low-km and high-km subjects don't empty).
- **Fuel: hard equality** via existing `fuzzyFuelEqual` (route:69-81). (This is the fix for fuel mixing — today fuel is only a `+8` soft nudge.)

**Null handling (mandatory, prevents 0 results):** a car passes a band if its field is `null` (unknown) OR within band. Only a *known* out-of-band value drops the car. `null` fuel passes.

### Fallback ladder (run survivors through `rank()` + `slice(0,9)` at each step; stop at `MIN_CARDS=4`)
1. Strict: price ±30% AND km band AND fuel-equal.
2. Drop km band (mileage = least reliable scraped field).
3. Widen price to ±50% (keep fuel-equal).
4. Drop fuel (keep price ±50%) — fuel-mixing is the #2 complaint, relax LAST.
5. No hard filter → today's pure `rank()` ordering (never regress below current count).

Edge nulls: `valueNow==null`→skip price band; `mileage==null`→skip km band; `fuel==null`→skip fuel equality (same null-guards `rank` already uses). Keep `!priceEur→+20`, `!imageUrl→+6` rank penalties.

### Recommended constants (one place)
`PRICE_BAND=0.30`, `PRICE_BAND_WIDE=0.50`, `KM_BAND_PCT=0.40`, `KM_BAND_FLOOR=40000`, `MIN_CARDS=4`, return `slice(0,9)`, UI shows 6 (unchanged).

### Deeplinks (optional polish, `lib/listings/deeplinks.ts`)
- Extend `ListingVehicle` (lines 9-14) with `mileage`+`fuelType`; client passes `mileage: data?.enriched?.estimatedMileageNow ?? null` + `fuelType: v?.fuelType ?? null` (`ComparableListings.tsx:83-91`).
- Keep `priceBand` ±20% (lines 29-33, already exists); add a `kmBand` helper (`± max(0.40×mileage,40000)`, round 5000) → AutoScout24 `kmfrom`/`kmto`, Gaspedaal `kmin`/`kmax`; add fuel param via a **shared `normalizeFuel()`** extracted from `fuzzyFuelEqual` so route and deeplinks agree on the token.
- Unpaid path: `estimatedMileageNow`/`estimatedValueNow` are premium-redacted (`lib/api/premium-value.ts` `PREMIUM_VALUE_FIELDS`) → bands silently omit. Acceptable (section is premium); verify deeplink still renders without a band.

---

## E. Loader architecture

### Root cause (pinned)
`components/vehicle/ComparableListings.tsx:62-81` fetches once on mount, gated **only on `normalized`** (the plate), with `cache:"no-store"` — and has **no `onPlateAccessChanged` subscription** (unlike `useVehicleLookup.ts:22-28` and `useAiReport.ts:72-83`). The server route `app/api/listings/comparable/[plate]/route.ts:128-130` hard-returns `{cars:[]}` for any request before paid access is established. After payment, `grantPaidAccessForPlate` (`SubscriptionModal.tsx:94-99`) updates client access + fires `PLATE_ACCESS_EVENT`, but nothing re-fires the comparable fetch — so the block keeps its first (unpaid) `{cars:[]}` and falls to the deeplink fallback (lines 199-257) = "only links, not photos." A manual refresh re-mounts the component, the cookie/DB record now exists, the first fetch is paid → photo cards appear.

### Recommended fix (fits the codebase: Option 1+2+module cache, Option 3 polish)
1. **Subscribe to access changes** (Option 1, the literal missing piece): extract the fetch in `ComparableListings.tsx:62-81` into a callable `runFetch`; call it on mount AND from an `onPlateAccessChanged(normalized, paid => { if(paid) runFetch() })` handler. `import { onPlateAccessChanged } from "@/lib/payments/access"` (events at `access.ts:71-82`). Mirrors `useAiReport.ts:72-83`.
2. **Gate first fetch on confirmed access** (Option 2): fetch only when `unlocked===true` (from `ensurePaidAccessChecked`, `access.ts:37-66`) so unpaid visitors never trigger a throwaway call and paid visitors fetch exactly once, with access. Preserves the server paid-gate (do NOT remove `route.ts:128-130`).
3. **Module-level promise cache** mirroring `useAiReport.ts:34`'s `reportCache` Map, keyed `${normalized}|${locale}`, with `delete`+refetch on `onPlateAccessChanged(paid)`; dedupes double-mounts and lets Option 3 warm it. Use an `active` guard (like `useAiReport.ts:63/84`) against setState-after-unmount.
4. **Warm during ScanIntro** (Option 3 polish): trigger that shared fetch when the report mounts for an unlocked plate (from `FullReportScreen` after `unlocked` flips, mount point `FullReportScreen.tsx:196`) so the Apify run (45s abort, `apify.ts:67`; route `maxDuration=60`) overlaps the ~3.5s ScanIntro (`ScanIntro.tsx:13` `STEP_INTERVAL_MS=520` × 6 steps). Keep the existing skeleton (`ComparableListings.tsx:139-149`) as the visible loading state.

Do NOT use Option 4 (SSR prefetch) — a 45s Apify call in SSR blocks TTFB and fights the client architecture. The PDF path is server-side with the paid cookie already, so it does not suffer this race — keep any new shared cache **client-only**.

---

## F. PDF parity

### What the PDF omits today (vs online) — concrete gaps
1. **Comparable cars** — entirely absent; PDF's `te-koop` slot holds negotiation cards instead.
2. **APK failure statistics** (model cohort top-defect table) — absent; PDF shows only pass chance + maintenance risk. Source: `/api/vehicle/[plate]/model-stats` → `lib/stats/modelStats.ts`.
3. **Kentekenrapport Score (0-100) + breakdown** — absent; `buildScoreResult` is client-only (`VehicleResultScreen.tsx:92-183`).
4. **Ownership registration grid (10 rows) + import/transfer timeline** — only a one-liner (port `OwnershipTimelineScreen.tsx` registrationItems 145-159, events 67-123).
5. **Full technical-spec table (~25 rows)** — thin subset only (missing kW/HP, cylinders, energy label, doors/seats, axles/wheels, payload, first-reg dates).
6. **Trust badges** — absent (derivable from `data.vehicle` + `enriched.isImported`).
7. **Thinner-than-online**: mileage anomalies + estimate min/max; APK pass-rate %, recurring defects, per-inspection pass/fail; damage per-event list with dates/recognition.
8. **Estimate & risk cards**: negotiation talking points + estimates-grid mileage-signal/confidence rows missing.

### Plan to reach 1:1 in the new order

**F1. Thread missing data into `ReportArgs`** (`pdf-report.ts:33-41`, fetched in route GET download `route.ts:265-298` + POST `336-396`, both already past the 402 gate):
- `comparables?: ComparableCar[] | null` — fetch the ranked pool server-side reusing the **shared ranker** (extract `rank`/`fuzzyFuelEqual`/`getPool` from the comparable route into `lib/listings/comparable.ts` so route + PDF + filter all share it). Pass top ~6.
- `modelStats?: ModelStats | null` — call `lib/stats/modelStats.ts` server-side.
- `score?: ScoreResult | null` — extract `buildScoreResult` to a pure `lib/vehicle/score.ts` (no React), import in both the screen and PDF.
- Mileage anomalies / estimate min-max already on `data.enriched`; pass-rate/recurring/per-inspection result/badges are **derived** from `data.inspections`/`data.defects`/`data.vehicle` — port the derivations into PDF helpers (no new data).
- All optional → absent degrades to honest lines / skipped sections (never print "-" placeholders).

**F2. Rebuild `buildReportSections` (`pdf-report.ts:778-1078`) to the 9-group order, fully expanded:**
1. Identity + technical core — keep 6 `overzicht` rows; ADD core specs up front (kW/HP, displacement, cylinders, transmission, doors/seats, dimensions, weights). ADD the Kentekenrapport Score + breakdown.
2. Compact verdict — one tight `ai-analyse` paragraph + single strengths/watch-outs line; shrink/remove the colored hero verdict/risk boxes (declutter).
3. Market analysis — full estimates grid, ADD missing rows: mileage signal (`enriched.mileageVerdict`), confidence label, maintenance-risk "/10", est. mileage; use `drawCardRow`.
4. Comparable cars (directly under market) — render as **text rows** (`layout.table`, columns `[Year, Km, Fuel, Price, Source]`), NO images (auteursrecht/heavy). Filter via the shared ranker. Empty → honest line + marketplace deeplink URLs as plain text + source disclosure. **Extend the 4-col `table()` width array (`pdf-report.ts:259`) to 5 columns.**
5. Estimate & risks (under comparables) — negotiation `drawCardRow` (offer/walk-away/reserve, exists 878-894) + port `NegotiationBlock` talking points (lines 44-74) as a short bullet list.
6. Risks & damage — keep WOK/defects/recalls; ADD per-inspection defect-event list (date, code, description, count, recognition) from `DamageHistoryScreen.events` (44-62).
7. Mileage & NAP — keep current rows; ADD `estimatedMileageMin/Max` range + mileage anomalies (port `MileageTimelineScreen` 313-337) as ASCII-tone warning rows.
8. MOT/APK + failure statistics — keep inspections+defects tables; ADD derived pass-rate %/recurring (port `InspectionTimelineScreen` 205-211) + the **model-stats table** (sample size, cohort %, top-defects `[Description, % of vehicles, Count of N]` from `modelStats.topDefects`).
9. Ownership & vehicle data — replace one-liner with the full 10-row registration grid + import/transfer event lines with warnings + owner-count note; then remaining full `specs` (fuel table, body/type-approval table, factory name, energy label, payload, axles/wheels).
- ADD a free **TrustBadges text strip** after the judgment block (port `TrustBadges.badges` 40-130) as one-line `LET OP/GOED/SLECHT` chips.

**F3. Keep (do NOT touch):** 402 gate first; `drawJudgmentBlock` (page 1, 416-554); `buildTocPage` two-pass + front-insert (556-592, 1163-1166); `toneToPdfWord`/`accentForTone`/`inkForTone` grayscale-safe words; `splitText` em/en-dash stripping (line 104) — use it for all new text. `pdfGroupOrder()` auto-follows the reordered GROUPS.

**F4. Resilience:** wrap comparable + model-stats fetches in try/catch→null with a timeout; never block PDF generation on a slow/absent Apify (respect the monthly run cap). Verify TOC page numbers (`pageIndex+2`, line 572) still line up after the longer body, and extend `scripts/preview-pdf.ts` to supply mock `comparables`/`modelStats`/`score`.

---

## G. File inventory

**Create:**
- `components/vehicle/EstimateRisksScreen.tsx` — extracted cost cards + `NegotiationBlock` (new `schatting` section).
- `lib/listings/comparable.ts` (or `lib/listings/filter.ts`) — shared `selectComparables` (hard bands + fallback ladder) + extracted `rank`/`fuzzyFuelEqual`/`getPool`/`normalizeFuel`, reused by route + PDF.
- `lib/vehicle/score.ts` — pure `buildScoreResult` extracted from `VehicleResultScreen` (used by screen + PDF).

**Modify:**
- `lib/vehicle/groups.ts` — rewrite `GroupId` (3-9), add `schatting` to `ReportSectionId` (11-23), rewrite `GROUPS` (34-83) to 9 groups.
- `lib/vehicle/signals.ts` — repoint group literals (142-259) + rebuild `groupStatus` record (316-339) for 9 ids.
- `lib/vehicle/pdf-presentation.ts` — add `schatting` to `pdfSectionTitle` nl/en (64-94); optionally retone hero chips.
- `components/vehicle/FullReportScreen.tsx` — register `schatting` in `SECTIONS` (58-95), import `EstimateRisksScreen`; warm comparable fetch on unlock (mount 196).
- `components/vehicle/MarketAnalysisScreen.tsx` — remove `estimateRows` (227-254), `estimatesSection` (393-408), `NegotiationBlock` (410-419).
- `components/vehicle/ComparableListings.tsx` — `runFetch` + `onPlateAccessChanged` subscription, access-gated first fetch, module promise cache, `active` guard (62-81); pass `mileage`+`fuelType` to deeplink model memo (83-91).
- `components/vehicle/AiAnalysisScreen.tsx` — drop `valuationRow` (119-136), trim Sparkles eyebrow (66-69).
- `components/vehicle/JudgmentBlock.tsx` — optionally truncate heading to first sentence (53-54).
- `components/vehicle/TrustBadges.tsx` (+ `.module.css`) — collapse `ok` badges to one calm pill; color only warn/danger (40-130).
- `components/vehicle/TechnicalSpecsScreen.tsx` — default only `performance` accordion open (186-191).
- `components/vehicle/VehicleResultScreen.tsx` — import score from new `lib/vehicle/score.ts` (was inline 92-183).
- `lib/api/claude.ts` — summary `120-220` → `35-60` words, NL line 181 + EN line 217.
- `app/api/listings/comparable/[plate]/route.ts` — call shared `selectComparables` before `slice(0,9)` (84-103, 132-143); keep paid-gate (128-130) and cache key (26).
- `lib/listings/apify.ts` — source of `ComparableCar` (8-22); no logic change unless `getPool`/normalize move to shared module.
- `lib/listings/deeplinks.ts` — extend `ListingVehicle` (9-14), add `kmBand`+fuel param, shared `normalizeFuel`.
- `lib/api/pdf-report.ts` — extend `ReportArgs` (33-41); rebuild `buildReportSections` (778-1078) to 9-group expanded order; extend `table()` to 5 cols (259); retone hero chips (645-672, 89-100).
- `app/api/vehicle/[plate]/route.ts` — fetch comparables + model-stats + score in GET download (265-298) & POST (336-396); **bump AI cache key v2→v3** (here or `models/AiReportCache.ts`).
- `scripts/preview-pdf.ts` — supply mock `comparables`/`modelStats`/`score`.
- CSS modules: `MarketAnalysisScreen.module.css`, `AiAnalysisScreen.module.css`, `ReportGroup.module.css`, `TrustBadges.module.css` — color only on warn/danger; mobile stacking for new `EstimateRisksScreen` grid.
- `models/AiReportCache.ts` — only if the cache-key builder lives here.
- `tests/pdf-report.test.ts` — update the "PDF order == GROUPS" assertion to the new 9-group order; add unit tests for extracted `score` + `selectComparables`.

---

## H. Risks / open questions / sequencing

### Build order (dependencies)
1. **Foundations first (shared extractions, no behavior change):** extract `lib/vehicle/score.ts` and `lib/listings/comparable.ts` (`rank`/`fuzzyFuelEqual`/`getPool`/`normalizeFuel`). These unblock both the filter (WS3) and PDF (WS5). Add their unit tests now.
2. **WS1 Reorder** (`groups.ts` + `signals.ts` + `pdf-presentation.ts` + `FullReportScreen` registry + `EstimateRisksScreen` extraction). This is the riskiest/most cross-cutting and everything else renders into the new order — do it before declutter/PDF polish. **Update `tests/pdf-report.test.ts` in the same commit** or the parity test fails.
3. **WS3 Comparable filter** — wire `selectComparables` into the route (uses the shared helper from step 1).
4. **WS4 Loader** — independent of reorder; can run in parallel after WS1 lands (touches only `ComparableListings`/`FullReportScreen`/`access`).
5. **WS5 PDF parity** — last; depends on WS1 (order), WS3 (filter), and the shared extractions. Touches the same comparable route + groups, so sequence after them to avoid conflicts.
6. **WS2 Declutter** — interleave; the AI-summary/cache-bump part can land anytime, the color/CSS part after WS1 (so it tones the final 9-group layout).

### Build-breaking / correctness
- **R1 (highest):** `GroupId` is an exhaustive `Record<GroupId,…>` key in `signals.ts:316-339`; `ReportSectionId` is exhaustive in `pdf-presentation.ts:64-94` and `FullReportScreen.SECTIONS:58-95`. Any add/rename must update ALL three in one change or `tsc`/`next build` fails.
- **R2:** Shortening claude.ts prompt without bumping `AiReportCache` key (`v2|`→`v3|`) serves stale 200-word summaries for 7 days. Mandatory bump.
- **R3:** PDF order is hand-coded in `buildReportSections` (NOT GROUPS-driven) — reordering web alone silently desyncs the PDF. Estimate cost cards currently embedded in PDF `markt` (838-842) must move to the new estimate banner after `te-koop`.
- **R4 (empty-result regression):** thin Apify pool + null fields. The fallback ladder (§D) is mandatory; step 5 must reproduce today's behavior exactly; filters treat `null` as pass.

### Owner decisions needed
- **Specs split:** owner order says "technical core specs first" (#1) and "vehicle data" last (#9). Web can keep `specs` whole at #1; PDF wants core-first/full-last. **Decide: split the `specs` sectionId into `specs-core` + `specs-full`, or keep `specs` whole and only the PDF splits its rendering?** (Affects whether a new `ReportSectionId` is added — another exhaustive-record touch.)
- **Comparable filter scope:** per the 14-juni memo, live listings are mostly unavailable (Carapis dead) → most plates hit the search-link fallback where card filtering doesn't apply. **Confirm the price/km/fuel filter targets the live-cards path only** (the fallback already uses price-band deeplinks).
- **PDF comparables = links not rows in practice:** because Apify usually returns `[]`, the PDF "comparable cars" section will most often render marketplace deeplink URLs as text rather than car rows. Confirm this honest fallback is acceptable.
- **Deeplink band widths:** keep deeplinks at ±20% price (tidy) while internal cards use ±30%? (Recommended yes — deeplinks are a manual-search nudge, slightly tighter is fine.)

Key cross-cutting invariants to preserve: server paid-gate on comparable route (`route.ts:128-130`); 402-gate-first in the PDF route; grayscale-safe ASCII status words + em/en-dash stripping in PDF; no "-" placeholders (hide empty sections); no listing photos in PDF.