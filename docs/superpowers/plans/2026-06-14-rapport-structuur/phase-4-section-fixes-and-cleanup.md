## Phase 4 — Section screen fixes + embedded/accordion reconciliation

**Goal:** Make every section screen behave correctly when it is rendered as the BODY of a Phase 1-3 `ReportGroup` (i.e. with `embedded` set). Concretely: (1) `AiAnalysisScreen` must actually consume its `embedded` prop instead of accepting-but-ignoring it; (2) `TechnicalSpecsScreen` must not render its standalone back-link page header (lines 325-337) when embedded, while its internal 4-section accordion keeps working inside the outer group collapse; (3) `ComparableListings` and `AiAnalysisScreen` must be rendered with `embedded` from the new group bodies, and `ComparableListings` must degrade gracefully when there are no live listings (Carapis is dead) without breaking the surrounding group; (4) `InspectionTimelineScreen`'s internal expand/collapse must coexist with the outer group collapse; (5) `DamageHistory` / `Mileage` / `Ownership` / `ApkFailureIntelligence` must render correctly inside groups with `embedded`, and their per-section status sentences must not contradict the new group status line. No logic rewrites beyond embedded/header reconciliation. Server gating (`redactPremiumValue`, `hasPaidPlateAccess`, per-section `PremiumLock`) is left untouched.

**Assumptions (delivered by earlier phases of this plan):** `lib/vehicle/groups.ts` (the `GROUPS`/`GroupDef`/`GroupId`/`ReportSectionId` API), `lib/vehicle/signals.ts` (`computeVehicleSignals` + `VehicleSignalReport`), `components/vehicle/ReportGroup.tsx`, `components/vehicle/JudgmentBlock.tsx` and `components/vehicle/ReportTeaser.tsx` already exist, and `components/vehicle/FullReportScreen.tsx` has already been rewritten to render `ReportGroup` wrappers whose bodies contain the per-section screens. This phase only touches the SECTION SCREENS and the group-body wiring inside the (already rewritten) `FullReportScreen`. Where this phase shows a `FullReportScreen` edit, it shows the exact group-body lines to change and locates them by the section component being rendered, not by absolute line number, because Phase 3 will have moved those lines.

**Files touched:**
- `components/vehicle/AiAnalysisScreen.tsx` (consume `embedded`)
- `components/vehicle/TechnicalSpecsScreen.tsx` (suppress page header + back-link when embedded)
- `components/vehicle/ComparableListings.tsx` (add `embedded` prop + graceful no-listings status)
- `components/vehicle/InspectionTimelineScreen.tsx` (reconcile internal expand default with outer collapse)
- `components/vehicle/MileageTimelineScreen.tsx` (status-sentence coherence comment, no behavioural change beyond a duplicate-status guard)
- `components/vehicle/DamageHistoryScreen.tsx` (verify embedded, no contradictory status)
- `components/vehicle/OwnershipTimelineScreen.tsx` (verify embedded, no contradictory status)
- `components/vehicle/ApkFailureIntelligenceScreen.tsx` (verify embedded)
- `components/vehicle/FullReportScreen.tsx` (pass `embedded` to `AiAnalysisScreen` and `ComparableListings` in their group bodies)

These are React/CSS components, NOT unit-testable in this repo's `node --test` harness (per the test-runner constraint: only pure logic in `lib/` is TDD'd, and only when added to the `tsconfig.test.json` `include` allowlist). Every task therefore uses the non-unit verification loop: implement complete code -> `npm run typecheck` (expected clean) -> `npm run build` (expected success) -> headless-Chromium visual check per `CLAUDE.md` -> commit.

---

### Task 4.1: AiAnalysisScreen consumes `embedded`

**Why:** `AiAnalysisScreen`'s `Props` type already declares `embedded?: boolean` (line 12) but the function destructures only `{ plate }` (line 23), so the prop is silently dropped. The component has no standalone chrome (no `VehicleNavBar`, no page wrapper, no back-link) so there is nothing visual to suppress, but TypeScript/eslint flags an accepted-but-unused prop and, more importantly, the call site in `FullReportScreen` will start passing `embedded` (Task 4.8). We destructure and use it as a deliberate marker so the component compiles cleanly and the intent is explicit.

**Files:** `components/vehicle/AiAnalysisScreen.tsx`

- [ ] Read the current signature. The current function header (line 23) is exactly:
  ```tsx
  export function AiAnalysisScreen({ plate }: Props) {
  ```
  and `Props` (line 12) is:
  ```tsx
  type Props = { plate: string; embedded?: boolean };
  ```

- [ ] Change the destructure to consume `embedded`. Replace line 23:
  ```tsx
  export function AiAnalysisScreen({ plate }: Props) {
  ```
  with:
  ```tsx
  export function AiAnalysisScreen({ plate, embedded = false }: Props) {
  ```

- [ ] Mark `embedded` as intentionally consumed so the eslint `no-unused-vars` rule does not flag it (the component renders identically whether embedded or not; it never had standalone chrome). Immediately after the existing early return at line 37:
  ```tsx
    if (!isValid) return null;
  ```
  insert this single line (referencing `embedded` keeps the binding "used" and documents that this screen has no standalone-only chrome to strip):
  ```tsx
    // This screen has no standalone chrome (no nav bar / back link), so the
    // embedded flag does not change the markup. It is consumed here so the
    // group body can pass it consistently with the other section screens.
    void embedded;
  ```

- [ ] Typecheck:
  ```
  npm run typecheck
  ```
  Expected: clean exit (no errors).

- [ ] Build:
  ```
  npm run build
  ```
  Expected: `Compiled successfully` / build completes with exit 0 (MongoDB is not required for the build per CLAUDE.md).

- [ ] Headless-Chromium check (sample plate, fully unlocked) per CLAUDE.md verification workflow. Build + start prod, mock the vehicle API with a real production payload, load `/search/H223JZ`, and confirm the "Samenvatting & advies" group body renders the analysis panel with 0 pageerrors and 0 console errors at desktop 1380px and mobile 390px:
  ```
  npm i --no-save playwright@1.56.1
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs H223JZ
  ```
  Expected: script reports 0 pageerror / 0 console-error and finds the AI-analysis panel inside the verdict group. (If `scripts/verify-report.mjs` does not yet exist from an earlier phase, run the inline equivalent from CLAUDE.md's headless workflow.)

- [ ] Commit:
  ```
  git add components/vehicle/AiAnalysisScreen.tsx
  git commit -m "AiAnalysisScreen: consume embedded prop (no standalone chrome to strip)"
  ```

---

### Task 4.2: TechnicalSpecsScreen suppresses page header + back-link when embedded

**Why:** `TechnicalSpecsScreen` already gates `VehicleNavBar` behind `!embedded` (line 323) and uses `embedded ? undefined : styles.page` on its wrappers (lines 320-322), but the standalone **page header block** (lines 325-337) — which contains the `ArrowLeft` "Terug naar Risico-overzicht" back-link (line 326-328) and the duplicate "Technische specificaties" title/subtitle — is rendered unconditionally. Inside a `ReportGroup`, the group header already shows the section title, so this block is a duplicate title plus a dead link back to the removed RiskOverview route. It must be hidden when embedded. The internal 4-section accordion (`openSections` state, lines 186-191; `AccordionSection`, lines 106-155) stays as-is: its inner toggles are independent of the outer group collapse, which is exactly the desired "inner toggles stay, no double-collapse confusion" behaviour.

**Files:** `components/vehicle/TechnicalSpecsScreen.tsx`

- [ ] Locate the unconditional page-header block. Lines 325-337 are currently:
  ```tsx
          <div className={styles.pageHeader}>
            <Link href={backHref} className={styles.backLink}>
              <ArrowLeft size={16} /> {locale === "nl" ? "Terug naar Risico-overzicht" : "Back to Risk Overview"}
            </Link>
            <div className={styles.headerTitleBlock}>
              <div className={styles.headerTitle}>{locale === "nl" ? "Technische specificaties" : "Technical Specifications"}</div>
              <div className={styles.headerSubtitle}>
                {locale === "nl"
                  ? "Bekijk de fabrieksgegevens voor prestaties, verbruik en milieuspecificaties van dit voertuig."
                  : "Review the factory-recorded performance metrics and environmental impact data for this vehicle."}
              </div>
            </div>
          </div>
  ```

- [ ] Wrap that block in `{!embedded && (...)}` so it only renders on the standalone route. Replace the block above with:
  ```tsx
          {!embedded && (
            <div className={styles.pageHeader}>
              <Link href={backHref} className={styles.backLink}>
                <ArrowLeft size={16} /> {locale === "nl" ? "Terug naar Risico-overzicht" : "Back to Risk Overview"}
              </Link>
              <div className={styles.headerTitleBlock}>
                <div className={styles.headerTitle}>{locale === "nl" ? "Technische specificaties" : "Technical Specifications"}</div>
                <div className={styles.headerSubtitle}>
                  {locale === "nl"
                    ? "Bekijk de fabrieksgegevens voor prestaties, verbruik en milieuspecificaties van dit voertuig."
                    : "Review the factory-recorded performance metrics and environmental impact data for this vehicle."}
                </div>
              </div>
            </div>
          )}
  ```

- [ ] Confirm `backHref` is still referenced (it is, inside the now-conditional `Link`), so no unused-variable error is introduced by the change. No other edit is needed: `VehicleNavBar` is already `!embedded`-gated (line 323) and the `PremiumLock` + accordion (lines 339-358) stay unchanged.

- [ ] Typecheck:
  ```
  npm run typecheck
  ```
  Expected: clean exit.

- [ ] Build:
  ```
  npm run build
  ```
  Expected: build completes, exit 0.

- [ ] Headless-Chromium check: load `/search/H223JZ`, scroll to the "Eigendom & voertuiggegevens" group (g6, which contains `specs`), expand it, and confirm: (a) there is NO "Terug naar Risico-overzicht" back-link inside the report, (b) the title "Technische specificaties" is NOT duplicated under the group header, (c) the 4 accordion sub-cards (Motor & Prestaties, Efficientie & Milieu, Afmetingen & Gewicht, Registratie & Keuring) each still expand/collapse independently when clicked. Run at desktop 1380px and mobile 390px, expect 0 pageerror / 0 console-error:
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs H223JZ --section=specs
  ```
  Expected: assertions pass; back-link absent; accordion sub-toggles functional.

- [ ] Commit:
  ```
  git add components/vehicle/TechnicalSpecsScreen.tsx
  git commit -m "TechnicalSpecsScreen: hide standalone page header + back-link when embedded"
  ```

---

### Task 4.3: ComparableListings gains an `embedded` prop and a non-breaking no-listings status

**Why:** `ComparableListings`'s props are currently `{ plate: string }` (line 50) with no `embedded`. It has no standalone chrome (only a `PremiumLock` wrapper), so it never needed `embedded` before. But for contract consistency with the other section screens (and so the group body can pass `embedded` uniformly in Task 4.8) it must accept the prop. Separately, with Carapis dead the `/api/listings/comparable` route returns `{ cars: [] }`, and when the vehicle also lacks brand/model/exact-links the component returns `null` at line 97. Returning `null` is fine for the body, but inside a `ReportGroup` the group HEADER + status line is always rendered by `ReportGroup` (Phase 1 contract), so an empty body must not crash or leave a confusing blank. We add a small honest empty-state so the g2 "te-koop" body is never a bare blank panel, and we keep the existing marketplace-link fallback for the common case where links CAN be built.

**Files:** `components/vehicle/ComparableListings.tsx`

- [ ] Add `embedded` to the prop type and destructure it. The current signature (line 50) is:
  ```tsx
  export function ComparableListings({ plate }: { plate: string }) {
  ```
  Replace it with:
  ```tsx
  export function ComparableListings({ plate, embedded = false }: { plate: string; embedded?: boolean }) {
  ```

- [ ] Consume `embedded` (this screen has no standalone chrome to strip; the marker keeps the binding used and documents intent). The `useI18n`/`useVehicleLookup` lines (51-53) currently read:
  ```tsx
    const { locale } = useI18n();
    const nl = locale === "nl";
    const { normalized, data } = useVehicleLookup(plate);
    const v = data?.vehicle;
  ```
  Insert immediately after line 53 (`const v = data?.vehicle;`):
  ```tsx
    // No standalone chrome (nav bar / back link) on this screen, so embedded does
    // not change the markup; consumed for call-site consistency with the others.
    void embedded;
  ```

- [ ] Replace the hard `null` return with an honest empty-state so the group body is never a bare blank. The current line 96-97 is:
  ```tsx
    // Nothing to show at all: not loading, no cards, and we cannot even build links.
    if (!loading && !hasCards && (!model.brand || !model.model || exact.length === 0)) return null;
  ```
  Replace those two lines with:
  ```tsx
    // Nothing to show at all: not loading, no cards, and we cannot even build links.
    // We still render a short honest line (behind the same PremiumLock) so the
    // group body is never an empty panel. Live listings are currently unavailable
    // (no working marketplace feed), so this is the expected path for most plates.
    const nothingToShow = !loading && !hasCards && (!model.brand || !model.model || exact.length === 0);
  ```

- [ ] Add the empty-state branch to the `inner` selection. The current `inner` if/else chain starts at line 122-134:
  ```tsx
    let inner: React.ReactNode;
    if (loading) {
      inner = (
        <div className={styles.wrap}>
          <p className={styles.intro}>{nl ? "Vergelijkbaar aanbod laden..." : "Loading comparable listings..."}</p>
          <div className={styles.grid}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={`${styles.card} ${styles.skeleton}`} aria-hidden="true" />
            ))}
          </div>
        </div>
      );
    } else if (hasCards) {
  ```
  Replace `let inner: React.ReactNode;` and the opening `if (loading) {` with a new first branch that handles the nothing-to-show case, so the chain becomes:
  ```tsx
    let inner: React.ReactNode;
    if (nothingToShow) {
      inner = (
        <div className={styles.wrap}>
          <p className={styles.intro}>
            {nl
              ? "We konden voor dit voertuig op dit moment geen vergelijkbaar aanbod ophalen. Zoek dezelfde auto handmatig op de grote verkoopsites en vergelijk met onze geschatte marktwaarde."
              : "We could not retrieve comparable listings for this vehicle right now. Search for the same car manually on the big marketplaces and compare against our estimated market value."}
          </p>
        </div>
      );
    } else if (loading) {
      inner = (
        <div className={styles.wrap}>
          <p className={styles.intro}>{nl ? "Vergelijkbaar aanbod laden..." : "Loading comparable listings..."}</p>
          <div className={styles.grid}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={`${styles.card} ${styles.skeleton}`} aria-hidden="true" />
            ))}
          </div>
        </div>
      );
    } else if (hasCards) {
  ```
  Note: the trailing `} else {` marketplace-link fallback (lines 183-241) and the final `PremiumLock` return (lines 243-252) stay exactly as they are. Because `nothingToShow` is now handled by its own branch, the chain never falls through to the marketplace fallback with empty `exact`, so no NL copy renders against a non-existent link list.

- [ ] Typecheck:
  ```
  npm run typecheck
  ```
  Expected: clean exit.

- [ ] Build:
  ```
  npm run build
  ```
  Expected: build completes, exit 0.

- [ ] Headless-Chromium check: load `/search/H223JZ`, open the "Marktwaarde & eerlijke prijs" group (g2, which contains `te-koop`). With the listings API returning `{ cars: [] }` (mock it that way to simulate the dead feed), confirm the te-koop body shows EITHER the marketplace-link fallback (when brand/model resolve, the common case) OR the new honest "geen vergelijkbaar aanbod" line, and that the group does NOT crash, does NOT show a bare blank panel, and the group header + status line above it still render. Desktop 1380px + mobile 390px, expect 0 pageerror / 0 console-error:
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs H223JZ --section=te-koop --mock-listings-empty
  ```
  Expected: te-koop body renders a non-empty, non-crashing block; no React error boundary fallback shown.

- [ ] Commit:
  ```
  git add components/vehicle/ComparableListings.tsx
  git commit -m "ComparableListings: accept embedded prop + honest empty-state when no listings (Carapis dead)"
  ```

---

### Task 4.4: InspectionTimelineScreen internal expand coexists with outer group collapse

**Why:** `InspectionTimelineScreen` already honours `embedded` for its standalone wrappers/nav (lines 233-235). Its internal state is `filter` (line 122) and `expanded` (line 123), where each inspection's defect list defaults to expanded via `const isExpanded = expanded[event.id] ?? true;` (line 394). Inside a `ReportGroup` (g5, default COLLAPSED per the locked product decision), the GROUP starts collapsed, so this inner per-event default only matters once the user opens the group. The risk is a "double-collapse" feel: a user opens the group, then sees every defect list already fully expanded, which is noisy. To keep the inner toggles meaningful and avoid an overwhelming first-open, default each event's defect list to COLLAPSED when embedded, while preserving the standalone page's existing expanded-by-default behaviour. The outer group collapse and the inner defect toggles then stay clearly independent.

**Files:** `components/vehicle/InspectionTimelineScreen.tsx`

- [ ] Locate the per-event expand default. Line 394 is currently:
  ```tsx
                  const isExpanded = expanded[event.id] ?? true;
  ```

- [ ] Make the default depend on `embedded` (collapsed-by-default inside the report, expanded-by-default on the standalone page). Replace line 394 with:
  ```tsx
                  // Standalone page: defect lists open by default. Embedded in a
                  // collapsible report group: defect lists start closed so opening
                  // the group does not dump every defect list at once (the inner
                  // toggle stays independent of the outer group collapse).
                  const isExpanded = expanded[event.id] ?? !embedded;
  ```

- [ ] Confirm `embedded` is already in scope. The function signature (line 119) is `export function InspectionTimelineScreen({ plate, embedded = false }: Props) {`, so `embedded` is available; no signature change needed.

- [ ] Typecheck:
  ```
  npm run typecheck
  ```
  Expected: clean exit.

- [ ] Build:
  ```
  npm run build
  ```
  Expected: build completes, exit 0.

- [ ] Headless-Chromium check: load `/search/H223JZ`, open the "APK-historie & rijwaardigheid" group (g5, contains `apk`). Confirm: (a) opening the group does NOT auto-expand every defect list (each event's defect list is collapsed with a "Details uitklappen" link), (b) clicking an event's "Details uitklappen" expands only that event, (c) the `filter` pills (Alle events / Goedgekeurd / Adviezen / Afgekeurd) still work, (d) collapsing the outer group and re-opening it does not crash. Then load the STANDALONE route `/search/H223JZ/inspection-timeline` (or whatever the standalone route is) and confirm defect lists are expanded by default there. Desktop 1380px + mobile 390px, 0 pageerror / 0 console-error:
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs H223JZ --section=apk
  ```
  Expected: embedded defect lists start collapsed; inner toggles work; outer collapse independent.

- [ ] Commit:
  ```
  git add components/vehicle/InspectionTimelineScreen.tsx
  git commit -m "InspectionTimelineScreen: default defect lists collapsed when embedded (avoid double-collapse noise)"
  ```

---

### Task 4.5: MileageTimelineScreen status-sentence coherence (no contradictory status next to the group line)

**Why:** Inside the g4 "Kilometerstand & NAP" group, Phase 1's `ReportGroup` renders a group status line driven by the server `mileage` signal (e.g. "Geen NAP-oordeel" / "Tellerstand onlogisch"). `MileageTimelineScreen` independently renders its own NAP eyebrow at line 269-274:
```tsx
{data.vehicle.napVerdict
  ? `${locale === "nl" ? "NAP-tellerstandoordeel" : "NAP odometer verdict"}: ${data.vehicle.napVerdict}`
  : locale === "nl" ? "Geen NAP-oordeel beschikbaar" : "No NAP verdict available"}
```
This is a factual restatement of the same `napVerdict`, not a contradiction (the group line is a tone+label derived from the same field), so it stays. The change here is defensive only: confirm there is no SECOND, differently-worded status badge that could contradict the group line, and add a short comment so a future editor does not duplicate a status chip. No behavioural change to the data or the chart.

**Files:** `components/vehicle/MileageTimelineScreen.tsx`

- [ ] Verify there is exactly one status surface in this screen (the NAP eyebrow at lines 267-274) and that the anomaly list (lines 309-333) is detail, not a status verdict. No status chip duplicates the group line. (Read-only confirmation step; no edit unless a contradicting chip is found.)

- [ ] Add a guiding comment above the eyebrow so the group-status / section-status split stays clear. The current lines 266-268 are:
  ```tsx
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <CheckCircle2 size={14} />
  ```
  Replace with:
  ```tsx
            <div className={styles.heroCopy}>
              {/* This eyebrow restates the raw napVerdict as detail. The group
                  status line (ReportGroup, g4-km) shows the tone+label derived
                  from the SAME field, so the two agree by construction. Do not
                  add a second status chip here that could diverge. */}
              <div className={styles.eyebrow}>
                <CheckCircle2 size={14} />
  ```

- [ ] Typecheck:
  ```
  npm run typecheck
  ```
  Expected: clean exit.

- [ ] Build:
  ```
  npm run build
  ```
  Expected: build completes, exit 0.

- [ ] Headless-Chromium check: load `/search/H223JZ`, open g4 "Kilometerstand & NAP". Confirm the group status line and the in-body NAP eyebrow describe the SAME verdict (no "Logisch" group line above an "onlogisch" body, etc.), and the chart renders. Desktop 1380px + mobile 390px, 0 pageerror / 0 console-error:
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs H223JZ --section=kilometerstand
  ```
  Expected: group status line and body NAP eyebrow are consistent.

- [ ] Commit:
  ```
  git add components/vehicle/MileageTimelineScreen.tsx
  git commit -m "MileageTimelineScreen: document group/section status split (no duplicate status chip)"
  ```

---

### Task 4.6: DamageHistoryScreen verified inside group, no contradictory status

**Why:** `DamageHistoryScreen` already honours `embedded` via its `wrap()` helper (lines 67-77): when embedded it returns a bare fragment (no page/shell/`VehicleNavBar`). It renders a single status chip (`statusChip`, lines 135-138) driven by `wok` / `events.length`. Inside g3 "Risicos & schade", Phase 1's group status line is driven by the server `safety` signal, which (per the locked thresholds) is `danger` on `wok`, otherwise `warn` on recalls/defects/taxi/import, else `ok`. The body's own chip (WOK -> danger, defects -> review, else clean) agrees with that ordering on the WOK and defects cases. To prevent a future contradiction and keep the wording aligned, add a clarifying comment; no data/logic change. This task is mostly a verification gate that the embedded fragment renders inside the group.

**Files:** `components/vehicle/DamageHistoryScreen.tsx`

- [ ] Confirm embedded path returns a bare fragment. Lines 67-77 are:
  ```tsx
    const wrap = (content: React.ReactNode) =>
      embedded ? (
        <>{content}</>
      ) : (
        <div className={styles.page}>
          <div className={styles.shell}>
            <VehicleNavBar plate={plate ?? ""} subtitle={nl ? "Schadesignalen" : "Damage signals"} />
            {content}
          </div>
        </div>
      );
  ```
  (Read-only confirmation: embedded already strips the page/shell/nav. No edit here.)

- [ ] Add a clarifying comment above the status chip so the section chip stays consistent with the g3 group status line. The current lines 86-92 are:
  ```tsx
    const hasSignals = wok || events.length > 0;
    const statusClass = wok ? styles.statusDanger : events.length > 0 ? styles.statusReview : styles.statusClean;
    const statusLabel = wok
      ? nl ? "WOK-registratie aanwezig" : "Salvage (WOK) registration"
      : events.length > 0
      ? nl ? `${events.length} geregistreerde signalen` : `${events.length} recorded signals`
      : nl ? "Geen schadesignalen" : "No damage signals";
  ```
  Insert immediately above line 86 (`const hasSignals = ...`):
  ```tsx
    // Section chip ordering (WOK -> danger, defects -> review, else clean) mirrors
    // the g3 safety signal that drives the ReportGroup status line, so the group
    // line and this chip agree on the WOK and defects cases by construction.
  ```

- [ ] Typecheck:
  ```
  npm run typecheck
  ```
  Expected: clean exit.

- [ ] Build:
  ```
  npm run build
  ```
  Expected: build completes, exit 0.

- [ ] Headless-Chromium check: load `/search/H223JZ`, open g3 "Risicos & schade" (contains `schade`). Confirm the embedded body renders with NO `VehicleNavBar` and NO standalone page background, the status chip matches the group status line tone (e.g. both clean for a clean car), and the checks grid renders. Desktop 1380px + mobile 390px, 0 pageerror / 0 console-error:
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs H223JZ --section=schade
  ```
  Expected: embedded fragment renders; chip + group line consistent.

- [ ] Commit:
  ```
  git add components/vehicle/DamageHistoryScreen.tsx
  git commit -m "DamageHistoryScreen: document chip/group-status alignment (verified embedded in g3)"
  ```

---

### Task 4.7: OwnershipTimelineScreen + ApkFailureIntelligenceScreen verified inside groups

**Why:** `OwnershipTimelineScreen` already honours `embedded` via its `wrap()` helper (lines 125-135: embedded -> bare fragment, else page/container/`VehicleNavBar`). `ApkFailureIntelligenceScreen` already gates `VehicleNavBar` behind `!embedded` (lines 88-93) and uses `embedded ? undefined : styles.*` wrappers (lines 86-87). Neither needs a behavioural change. This task verifies both render correctly inside their groups (g6 `eigendom`+`specs`, g5 `apk-intelligence`) and that neither shows a status sentence that contradicts the group line. The Ownership screen renders a flat registration grid (no status chip), and the APK-intelligence screen renders KPI cards (pass-chance / defect count), neither of which is a global section verdict, so there is no contradiction with the group status line. We add a one-line comment to the Ownership screen's import-warning event so it stays clearly "detail", not a competing status, and otherwise this is a verification gate.

**Files:** `components/vehicle/OwnershipTimelineScreen.tsx`, `components/vehicle/ApkFailureIntelligenceScreen.tsx`

- [ ] Confirm `OwnershipTimelineScreen` embedded path returns a bare fragment. Lines 125-135 are:
  ```tsx
    const wrap = (content: React.ReactNode) =>
      embedded ? (
        <>{content}</>
      ) : (
        <div className={styles.pageContainer}>
          <div className={styles.contentContainer}>
            <VehicleNavBar plate={plate} subtitle={nl ? "Eigendom & registratie" : "Ownership & registration"} />
            {content}
          </div>
        </div>
      );
  ```
  (Read-only confirmation; no edit.)

- [ ] Add a clarifying comment so the import warning is understood as detail, not a section status. The current registration-panel header lines 168-176 are:
  ```tsx
        <div className={styles.registrationPanel}>
          <div className={styles.registrationHeader}>
            <div>
              <div className={styles.registrationTitle}>{nl ? "Registratie & signalen" : "Registration & flags"}</div>
              <p className={styles.registrationSubtitle}>
                {nl ? "Officiële registratiestatus uit het RDW-register." : "Official registration status from the RDW register."}
              </p>
            </div>
          </div>
  ```
  Insert immediately above line 168 (`<div className={styles.registrationPanel}>`):
  ```tsx
        {/* This screen shows a flat registration grid + timeline detail, not a
            single section verdict. The g6 group status line (import -> warn, else
            ok) is the section-level status; nothing here competes with it. */}
  ```

- [ ] Confirm `ApkFailureIntelligenceScreen` needs no change: `VehicleNavBar` is `!embedded`-gated (line 88) and wrappers use `embedded ? undefined : styles.*` (lines 86-87). It renders KPI cards, not a section verdict, so it cannot contradict the g5 group status line. (Read-only confirmation; no edit to this file.)

- [ ] Typecheck:
  ```
  npm run typecheck
  ```
  Expected: clean exit.

- [ ] Build:
  ```
  npm run build
  ```
  Expected: build completes, exit 0.

- [ ] Headless-Chromium check: load `/search/H223JZ`. Open g6 "Eigendom & voertuiggegevens" and confirm the Ownership registration grid + timeline render embedded (no `VehicleNavBar`, no standalone page background) directly above the Technical-specs accordion in the same group body. Open g5 "APK-historie & rijwaardigheid" and confirm the APK-intelligence KPI cards + model-statistics panel render embedded below the inspection timeline. Desktop 1380px + mobile 390px, 0 pageerror / 0 console-error:
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs H223JZ --section=eigendom
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs H223JZ --section=apk-intelligence
  ```
  Expected: both screens render embedded inside their groups; no nav bars; no contradictory status.

- [ ] Commit:
  ```
  git add components/vehicle/OwnershipTimelineScreen.tsx
  git commit -m "OwnershipTimelineScreen: clarify registration grid is detail, not a competing section status (g6 verified)"
  ```

---

### Task 4.8: Pass `embedded` to AiAnalysisScreen and ComparableListings from the group bodies

**Why:** Now that `AiAnalysisScreen` (Task 4.1) and `ComparableListings` (Task 4.3) both accept `embedded`, their call sites inside the rewritten `FullReportScreen` group bodies must pass it, matching every other section screen (which is already rendered with `embedded`). In the current (pre-Phase-3) file these calls are `<AiAnalysisScreen plate={normalized} />` (line 428) and `<ComparableListings plate={normalized} />` (line 449). After Phase 3 these calls live inside `ReportGroup` bodies (g1 contains `ai-analyse`; g2 contains `te-koop`), but the JSX element itself is unchanged, so the edit is the same: add `embedded`. We locate by the component name, not the line number, because Phase 3 will have moved them.

**Files:** `components/vehicle/FullReportScreen.tsx`

- [ ] Find the `AiAnalysisScreen` call site. In the current file it is line 428:
  ```tsx
          <AiAnalysisScreen plate={normalized} />
  ```
  Replace it (wherever Phase 3 placed it, inside the g1-verdict group body) with:
  ```tsx
          <AiAnalysisScreen plate={normalized} embedded />
  ```

- [ ] Find the `ComparableListings` call site. In the current file it is line 449:
  ```tsx
          <ComparableListings plate={normalized} />
  ```
  Replace it (wherever Phase 3 placed it, inside the g2-markt group body) with:
  ```tsx
          <ComparableListings plate={normalized} embedded />
  ```

- [ ] Confirm every other section screen call already passes `embedded` (they do in the current file: `VehicleResultScreen` line 424, `MarketAnalysisScreen` 445, `MileageTimelineScreen` 453, `InspectionTimelineScreen` 457, `DamageHistoryScreen` 465, `OwnershipTimelineScreen` 469, `ApkFailureIntelligenceScreen` 473, `TechnicalSpecsScreen` 477). After this task ALL section screens are rendered with `embedded`, so the report contains zero standalone chrome (no nav bars, no back-links, no duplicate page headers).

- [ ] Typecheck:
  ```
  npm run typecheck
  ```
  Expected: clean exit.

- [ ] Build:
  ```
  npm run build
  ```
  Expected: build completes, exit 0.

- [ ] Headless-Chromium full-report sweep: load `/search/H223JZ` and assert across the WHOLE report there are zero `VehicleNavBar` instances, zero "Terug naar"/"Back to" links, and zero duplicate section page-headers; expand every group; confirm 0 pageerror / 0 console-error at desktop 1380px and mobile 390px:
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs H223JZ --expand-all --assert-no-standalone-chrome
  ```
  Expected: no nav bars, no back-links, no duplicate headers anywhere; all groups expand/collapse; no errors.

- [ ] Commit:
  ```
  git add components/vehicle/FullReportScreen.tsx
  git commit -m "FullReportScreen: pass embedded to AiAnalysisScreen + ComparableListings (no standalone chrome in report)"
  ```

---

### Task 4.9: Phase-4 verification gate (full typecheck + build + report sweep)

**Why:** Final gate before the phase is considered done. Confirms the combined effect of Tasks 4.1-4.8 compiles, builds, and renders cleanly, and that nothing in this phase weakened server gating (the sample plate H223JZ is fully unlocked; an unpaid plate must still be gated).

**Files:** none (verification only)

- [ ] Full typecheck:
  ```
  npm run typecheck
  ```
  Expected: clean exit, no errors.

- [ ] Production build:
  ```
  npm run build
  ```
  Expected: build completes, exit 0.

- [ ] Run the existing unit-test suite to confirm no regression in the pure-logic layer (Phase 4 touched only React components, so this should be unchanged-green):
  ```
  npm test
  ```
  Expected: all existing tests pass (Phase 4 added no new lib files to the `tsconfig.test.json` include list and changed no `lib/` logic).

- [ ] Headless-Chromium gating check: confirm sample plate is fully unlocked and an unpaid plate is still gated (server gating untouched):
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs H223JZ --expect-unlocked
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report.mjs XX999X --expect-locked
  ```
  Expected: H223JZ shows full content; the unpaid plate still shows `PremiumLock` teasers for the premium groups and the unlock CTA.

- [ ] No commit (verification only). If any step fails, fix in the relevant task above and re-run this gate.

---

**Phase 4 done when:** all of Tasks 4.1-4.8 are committed, `npm run typecheck` + `npm run build` + `npm test` are green, and the headless report sweep shows zero standalone chrome (no nav bars / back-links / duplicate page headers), the inspection defect lists default collapsed inside the report, the comparable-listings body never blanks or crashes when the feed is empty, and the sample plate stays fully unlocked while unpaid plates stay gated.
