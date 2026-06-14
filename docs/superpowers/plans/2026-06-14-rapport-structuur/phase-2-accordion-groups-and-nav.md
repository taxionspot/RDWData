## Phase 2 — Accordion groups + jump-nav + FullReportScreen rewire

**Goal:** Turn the flat single-scroll report (11 numbered `SectionBlock`s in `FullReportScreen.tsx`) into 6 collapsible accordion GROUPS driven by `lib/vehicle/groups.ts` (`GROUPS`). Each group header is ALWAYS in the DOM (`id={group.id}`) with a number badge, title, colored status line (from `data.signals.groupStatus[group.id]`), a lock/free chip, and a chevron; its body collapses but stays scroll-targetable. The in-report nav (`ReportSectionNav`) becomes group-level with `onJump` (open the target group, then `scrollIntoView` its header), an `onExpandAll`/collapse-all toggle, and a scrollspy that observes the always-present GROUP HEADERS. `RiskOverviewScreen` and the orphan screens are dropped from the report. One single scroll offset value is used everywhere (nav `top:58px` + the in-report nav band).

**Files touched:**
- `components/vehicle/ReportGroup.tsx` (NEW)
- `components/vehicle/ReportGroup.module.css` (NEW)
- `components/vehicle/ReportSectionNav.tsx` (MODIFY — group-level items, onJump, onExpandAll, allOpen)
- `components/vehicle/FullReportScreen.tsx` (MODIFY — SECTIONS registry kept, layout driven by GROUPS, controlled `openGroups`, drop risico + orphans, free `acties` footer)
- `components/vehicle/FullReportScreen.module.css` (MODIFY — group accordion CSS, consolidated `scroll-margin-top`, expand-all control styles)
- `app/globals.css` (MODIFY — align `scroll-padding-top` to the single offset)

> DEPENDENCY (Phase 1): this phase imports `GROUPS`, `GroupDef`, `GroupId` from `lib/vehicle/groups.ts` and reads `data.signals` (a `VehicleSignalReport`) from `useVehicleLookup`. Both must exist from Phase 1 (`groups.ts` created and added to `tsconfig.test.json` include; `signals` attached server-side and added to the `VehicleProfile` type so `data.signals` typechecks). If `data.signals` is not yet on the type, the code below reads it defensively (`data?.signals`) and the group status falls back to a neutral "ok" tone, so the report still renders. Do not block this phase on Phase 1's server wiring, but the headless verification of colored status lines requires Phase 1 to be merged.

> SCOPE NOTE: per-section premium gating is NOT added or changed in this phase. Each section screen ALREADY wraps its own body in `<PremiumLock ... sectionKey="...">` internally (verified in `DamageHistoryScreen.tsx` ln 124, `MileageTimelineScreen.tsx` ln 13, `AiAnalysisScreen.tsx` ln 57, etc.). The GROUP `lockKey` only drives the header lock/free chip + the nav lock icon. We do NOT add a second `PremiumLock` around sections in the registry (that would double-gate). See CONTRACT-NOTES in the return summary.

> TESTING NOTE: `ReportGroup.tsx`, `ReportSectionNav.tsx` and `FullReportScreen.tsx` are React components and are NOT unit-tested in this repo (per project rules: pure logic is TDD'd; React/CSS is verified via typecheck + build + headless Chromium). Every task below therefore uses the implement -> typecheck -> build -> headless-verify -> commit loop, not write-failing-test-first. The pure `groups.ts`/`signals.ts` logic is TDD'd in Phase 1.

---

### Task 2.1: Create `ReportGroup.module.css`

**Files:** `components/vehicle/ReportGroup.module.css` (NEW)

This holds all accordion styling: the always-visible header (number badge, title, colored status line, lock/free chip, chevron), the collapsible body, and mobile-safe overflow guards (`min-width:0; max-width:100%`) matching the existing `FullReportScreen.module.css` conventions (`.container > *` guard ln 22-25, `.sectionBlock` ln 261-268). Palette per owner rules: blue `#2563eb`/`#1d4ed8`, ink `#0f172a`, secondary `#5b6b84`, surfaces `#fff`/`#f8fafc`, borders `#e2e8f2`; green/amber/red ONLY for status tones.

- [ ] Create `C:\Users\Sabur\sites\kentekenrapport\components\vehicle\ReportGroup.module.css` with this complete content:

```css
/* ---------- Accordion group ---------- */

.group {
  scroll-margin-top: 132px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e2e8f2;
  border-radius: 18px;
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
}

.groupOpen {
  border-color: #bfd5ff;
  box-shadow: 0 14px 34px rgba(23, 39, 142, 0.08);
}

/* Header is ALWAYS rendered (scrollspy + scrollIntoView target). */
.header {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 18px 18px;
  min-width: 0;
  max-width: 100%;
}

@media (min-width: 768px) {
  .header {
    padding: 20px 24px;
  }
}

.header:hover {
  background: #f8fafc;
}

.index {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #eef4ff;
  color: #1d4ed8;
  font-weight: 900;
  font-size: 0.82rem;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 auto;
}

.titleRow {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  min-width: 0;
}

.title {
  font-size: 1.05rem;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: -0.01em;
}

/* Colored status line: 3-staps tone = dot + word + color. */
.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.82rem;
  font-weight: 700;
  min-width: 0;
}

.statusDot {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.statusOk {
  color: #166534;
}
.statusOk .statusDot {
  background: #16a34a;
}

.statusWarn {
  color: #92400e;
}
.statusWarn .statusDot {
  background: #d97706;
}

.statusDanger {
  color: #b91c1c;
}
.statusDanger .statusDot {
  background: #dc2626;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 3px 9px;
}

.chipFree {
  background: #dcfce7;
  color: #166534;
}

.chipPremium {
  background: #0f172a;
  color: #fff;
}

.chevron {
  flex: 0 0 auto;
  margin-left: auto;
  color: #94a3b8;
  transition: transform 160ms ease;
}

.chevronOpen {
  transform: rotate(180deg);
}

/* Body collapses; keep overflow guards so children never push width. */
.body {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 4px 16px 24px;
  min-width: 0;
  max-width: 100%;
}

@media (min-width: 768px) {
  .body {
    padding: 4px 24px 28px;
  }
}

.body > * {
  min-width: 0;
  max-width: 100%;
}
```

- [ ] Verify the file exists:
  ```bash
  ls "C:/Users/Sabur/sites/kentekenrapport/components/vehicle/ReportGroup.module.css"
  ```
  Expected: the path prints (file found).

- [ ] Commit:
  ```bash
  git -C "C:/Users/Sabur/sites/kentekenrapport" add components/vehicle/ReportGroup.module.css
  git -C "C:/Users/Sabur/sites/kentekenrapport" commit -m "$(cat <<'EOF'
feat(report): add ReportGroup accordion styles

Always-visible header (index, title, colored status line, lock/free chip,
chevron) + collapsible body with mobile overflow guards.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 2.2: Create `ReportGroup.tsx` (locked props contract)

**Files:** `components/vehicle/ReportGroup.tsx` (NEW)

Implements EXACTLY the locked contract:
`{ group: GroupDef; index: number; status: GroupStatus; isPremium: boolean; open: boolean; onToggle: (id: GroupId) => void; locale: "nl"|"en"; children: React.ReactNode }`.
Header element ALWAYS in the DOM with `id={group.id}` (so scrollspy + `scrollIntoView` can target it even when collapsed). Body is conditionally rendered (collapsed = not in DOM) but the HEADER stays. Body wrapped in `SectionErrorBoundary`. `GroupStatus` / `GroupId` / `GroupDef` come from the Phase 1 modules.

- [ ] Create `C:\Users\Sabur\sites\kentekenrapport\components\vehicle\ReportGroup.tsx` with this complete content:

```tsx
"use client";

import { ChevronDown, Lock } from "lucide-react";
import type { GroupDef, GroupId } from "@/lib/vehicle/groups";
import type { GroupStatus } from "@/lib/vehicle/signals";
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary";
import styles from "./ReportGroup.module.css";

type Props = {
  group: GroupDef;
  index: number;
  status: GroupStatus;
  isPremium: boolean;
  open: boolean;
  onToggle: (id: GroupId) => void;
  locale: "nl" | "en";
  children: React.ReactNode;
};

function statusToneClass(tone: GroupStatus["tone"]): string {
  if (tone === "danger") return styles.statusDanger;
  if (tone === "warn") return styles.statusWarn;
  return styles.statusOk;
}

/**
 * One collapsible report group. The HEADER (with id={group.id}) is ALWAYS in
 * the DOM so the scrollspy IntersectionObserver and nav scrollIntoView can
 * target it even while the body is collapsed. Only the body collapses, and it
 * is wrapped in SectionErrorBoundary so one broken section never crashes the
 * whole report.
 */
export function ReportGroup({
  group,
  index,
  status,
  isPremium,
  open,
  onToggle,
  locale,
  children
}: Props) {
  const nl = locale === "nl";
  const label = nl ? group.labelNl : group.labelEn;
  const statusLabel = nl ? status.labelNl : status.labelEn;
  const bodyId = `${group.id}-body`;

  return (
    <section className={`${styles.group} ${open ? styles.groupOpen : ""}`}>
      <button
        type="button"
        id={group.id}
        className={styles.header}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onToggle(group.id)}
      >
        <span className={styles.index}>{String(index).padStart(2, "0")}</span>
        <span className={styles.meta}>
          <span className={styles.titleRow}>
            <span className={styles.title}>{label}</span>
            {group.lockKey ? (
              isPremium ? (
                <span className={`${styles.chip} ${styles.chipPremium}`}>
                  <Lock size={9} /> Premium
                </span>
              ) : (
                <span className={`${styles.chip} ${styles.chipFree}`}>
                  {nl ? "Inbegrepen" : "Included"}
                </span>
              )
            ) : (
              <span className={`${styles.chip} ${styles.chipFree}`}>
                {nl ? "Gratis" : "Free"}
              </span>
            )}
          </span>
          <span className={`${styles.status} ${statusToneClass(status.tone)}`}>
            <span className={styles.statusDot} />
            {statusLabel}
          </span>
        </span>
        <ChevronDown
          size={20}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
        />
      </button>

      {open ? (
        <div id={bodyId} className={styles.body}>
          <SectionErrorBoundary label={group.id}>{children}</SectionErrorBoundary>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] Typecheck only this file's wiring compiles (full project typecheck):
  ```bash
  npm --prefix "C:/Users/Sabur/sites/kentekenrapport" run typecheck
  ```
  Expected: exits 0 (no errors). If it reports `Cannot find module '@/lib/vehicle/groups'` or `'@/lib/vehicle/signals'`, Phase 1 is not merged yet — STOP and merge Phase 1 first.

- [ ] Commit:
  ```bash
  git -C "C:/Users/Sabur/sites/kentekenrapport" add components/vehicle/ReportGroup.tsx
  git -C "C:/Users/Sabur/sites/kentekenrapport" commit -m "$(cat <<'EOF'
feat(report): add ReportGroup accordion component

Locked props contract. Header always in DOM with id=group.id for scrollspy
and scrollIntoView; only the body collapses; body wrapped in
SectionErrorBoundary.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 2.3: Rewire `ReportSectionNav.tsx` to group-level (onJump, onExpandAll, allOpen)

**Files:** `components/vehicle/ReportSectionNav.tsx` (MODIFY, full rewrite of the component body), `components/vehicle/FullReportScreen.module.css` (MODIFY, add the expand-all control + active-lock styles)

Current `ReportSectionNav.tsx` (ln 20-83) owns its own click->scroll and scrollspy that observes `document.getElementById(id)` for section ids. We change the contract so the PARENT controls jumping (it must OPEN the target group before scrolling). New props per the locked contract: `items: ReportNavItem[]` (`{ id: string; label: string; locked: boolean }`), `onJump(id: string)`, `onExpandAll()`, `allOpen: boolean`. The scrollspy keeps working because group HEADERS carry `id={group.id}` and are always in the DOM (Task 2.2). The pill click now calls `onJump` (parent opens + scrolls) instead of scrolling directly. We add a trailing expand-all / collapse-all pill.

- [ ] Replace the ENTIRE contents of `C:\Users\Sabur\sites\kentekenrapport\components\vehicle\ReportSectionNav.tsx` (currently ln 1-83) with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Lock } from "lucide-react";
import styles from "./FullReportScreen.module.css";

export type ReportNavItem = {
  id: string;
  label: string;
  locked: boolean;
};

type Props = {
  items: ReportNavItem[];
  onJump: (id: string) => void;
  onExpandAll: () => void;
  allOpen: boolean;
};

/**
 * Sticky in-report navigation with scrollspy. The report is one long page of
 * collapsible groups, so this lets visitors jump straight to a group (the
 * parent opens it, then scrolls its header into view) instead of scrolling
 * through everything. Scrollspy observes the GROUP HEADER elements, which are
 * always in the DOM (id={group.id}) even when a group is collapsed. The matching
 * CSS (.navWrap/.nav/.navPill) lives in FullReportScreen.module.css.
 */
export function ReportSectionNav({ items, onJump, onExpandAll, allOpen }: Props) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const navRef = useRef<HTMLDivElement | null>(null);
  const ids = items.map((it) => it.id).join(",");

  // Scrollspy: mark the topmost group header currently in the viewport band.
  useEffect(() => {
    const sectionIds = ids ? ids.split(",") : [];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-132px 0px -55% 0px", threshold: 0 }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  // Keep the active pill in view inside the horizontal scroller (mobile).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const pill = nav.querySelector<HTMLElement>(`[data-nav-id="${active}"]`);
    if (!pill) return;
    const target = pill.offsetLeft - nav.clientWidth / 2 + pill.clientWidth / 2;
    nav.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [active]);

  const handleClick = (id: string) => {
    setActive(id);
    onJump(id);
  };

  return (
    <div className={styles.navWrap}>
      <div className={styles.nav} ref={navRef} role="tablist" aria-label="Rapportsecties">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            data-nav-id={item.id}
            className={`${styles.navPill} ${active === item.id ? styles.navPillActive : ""}`}
            onClick={() => handleClick(item.id)}
            aria-current={active === item.id ? "true" : undefined}
          >
            {item.locked ? <Lock size={11} className={styles.navLockIcon} /> : null}
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.navPill} ${styles.navExpandPill}`}
          onClick={onExpandAll}
          aria-label={allOpen ? "Alles inklappen" : "Alles uitklappen"}
        >
          {allOpen ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
          {allOpen ? "Inklappen" : "Alles open"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] Add the expand-all pill style to `C:\Users\Sabur\sites\kentekenrapport\components\vehicle\FullReportScreen.module.css`. Insert immediately AFTER the `.navLockIcon` rule (currently ln 99-101):

  Locate (ln 99-101):
  ```css
  .navLockIcon {
    opacity: 0.75;
  }
  ```

  Insert directly after it:
  ```css
  .navExpandPill {
    margin-left: auto;
    color: #1d4ed8;
    background: #eef4ff;
  }

  .navExpandPill:hover {
    background: #dbe8ff;
    color: #1d4ed8;
  }
  ```

- [ ] Typecheck (this will surface the breaking call site in `FullReportScreen.tsx` ln 421, which Task 2.4 fixes — expected to FAIL here):
  ```bash
  npm --prefix "C:/Users/Sabur/sites/kentekenrapport" run typecheck
  ```
  Expected: FAILS with an error on `components/vehicle/FullReportScreen.tsx` around `<ReportSectionNav items={navItems} />` — "Property 'onJump' is missing" (or similar). This confirms the new required props are enforced. Task 2.4 fixes the call site; do NOT commit yet.

- [ ] (Deferred commit) This task is committed together with Task 2.4 since the nav contract change and the FullReportScreen rewire are interdependent (the project must typecheck before any commit).

---

### Task 2.4: Rewire `FullReportScreen.tsx` to GROUPS + controlled accordion + drop risico/orphans

**Files:** `components/vehicle/FullReportScreen.tsx` (MODIFY)

This is the core rewire. We KEEP a `SECTIONS` registry but as a MAP `id -> { component, lockKey, labelNl, labelEn }` and drive the LAYOUT from `GROUPS` (`lib/vehicle/groups.ts`). We render `ScanIntro`, then the nav, then `JudgmentBlock` (Phase 3 component) at the top, then the current `RecordsSummary` (Phase 3 swaps it for `ReportTeaser`), then each GROUP via `ReportGroup` with controlled `openGroups` state seeded from `defaultOpen`. Inside each group we render its `sectionIds` via the registry (each section screen already self-gates with its own `PremiumLock` — we do NOT double-wrap). We DROP the `risico` section (RiskOverviewScreen) and the orphan imports (`InspectionTable`, `RecallList`, `NegotiationCopilotScreen` were never imported here, so only `RiskOverviewScreen` import is removed). The free `acties` footer renders AFTER the groups, outside `GROUPS`. Group status comes from `data.signals.groupStatus[group.id]`.

> JudgmentBlock note: `JudgmentBlock` is created in Phase 3. To keep this phase building on its own, we render it behind a defensive import guard is NOT possible in TS; instead we add the import and a minimal placeholder is OUT OF SCOPE. We assume Phase 3's `JudgmentBlock.tsx` exists OR this task is executed after Phase 3's component file is created. If Phase 3 is not yet merged, create a temporary stub (see the optional sub-step) so this phase typechecks and builds independently; Phase 3 replaces the stub with the real implementation.

> SKIP in full-plan order: `JudgmentBlock.tsx` is built in PHASE 1 (not Phase 3), so it already exists when Phase 2 runs. Do NOT create the stub. Import and render the real `./JudgmentBlock`. Use the stub below ONLY if executing Phase 2 in isolation before Phase 1.

- [ ] (OPTIONAL, only if `JudgmentBlock.tsx` does not exist yet) Create a temporary stub so this phase builds standalone. Create `C:\Users\Sabur\sites\kentekenrapport\components\vehicle\JudgmentBlock.tsx`:

  ```tsx
  "use client";

  // TEMPORARY STUB — replaced by the real implementation in Phase 3.
  // Renders nothing so the report builds while the signals UI is being built.
  type Props = { plate: string; onJump: (groupId: string) => void };

  export function JudgmentBlock(_props: Props) {
    return null;
  }
  ```

  Verify it does not already exist before creating:
  ```bash
  ls "C:/Users/Sabur/sites/kentekenrapport/components/vehicle/JudgmentBlock.tsx"
  ```
  If the file ALREADY exists (Phase 3 merged), SKIP this sub-step and use the real component.

- [ ] Replace the import block at the TOP of `C:\Users\Sabur\sites\kentekenrapport\components\vehicle\FullReportScreen.tsx` (currently ln 1-45). Remove the `RiskOverviewScreen` import (ln 34) and the now-unused `Radar`, `CheckCircle2`, `AlertTriangle` lucide icons that only `RecordsSummary` used (kept for now because `RecordsSummary` stays until Phase 3 — so KEEP them). Add the new imports: `GROUPS`, `GroupDef`, `GroupId`, the `ReportGroup` component, `JudgmentBlock`, and the new `ReportSectionNav` is already imported. The full new top block (ln 1-46) becomes:

  Old (ln 1-45):
  ```tsx
  "use client";

  import { useEffect, useMemo, useState } from "react";
  import Link from "next/link";
  import { useSearchParams } from "next/navigation";
  import {
    AlertTriangle,
    ArrowRight,
    BellRing,
    CheckCircle2,
    ChevronRight,
    Lock,
    Radar,
    Scale,
    Unlock
  } from "lucide-react";
  import { useI18n } from "@/lib/i18n/context";
  import { useSiteSettings } from "@/hooks/useSiteSettings";
  import { useVehicleLookup } from "@/hooks/useVehicleLookup";
  import { formatDisplayPlate } from "@/lib/rdw/normalize";
  import {
    hasPaidAccessForPlate,
    ensurePaidAccessChecked,
    onPlateAccessChanged
  } from "@/lib/payments/access";
  import type { PublicSiteSettings } from "@/lib/site-settings/defaults";
  import { SubscriptionModal } from "@/components/ui/SubscriptionModal";
  import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary";
  import { isSamplePlate } from "@/lib/sample";
  import { track } from "@/lib/analytics";
  import { ScanIntro } from "./ScanIntro";
  import { AiAnalysisScreen } from "./AiAnalysisScreen";
  import { VehicleResultScreen } from "./VehicleResultScreen";
  import { RiskOverviewScreen } from "./RiskOverviewScreen";
  import { MarketAnalysisScreen } from "./MarketAnalysisScreen";
  import { InspectionTimelineScreen } from "./InspectionTimelineScreen";
  import { MileageTimelineScreen } from "./MileageTimelineScreen";
  import { DamageHistoryScreen } from "./DamageHistoryScreen";
  import { OwnershipTimelineScreen } from "./OwnershipTimelineScreen";
  import { ApkFailureIntelligenceScreen } from "./ApkFailureIntelligenceScreen";
  import { TechnicalSpecsScreen } from "./TechnicalSpecsScreen";
  import { ReportSectionNav } from "./ReportSectionNav";
  import { TrustBadges } from "./TrustBadges";
  import { ComparableListings } from "./ComparableListings";
  import styles from "./FullReportScreen.module.css";
  ```

  New (full replacement of ln 1-45):
  ```tsx
  "use client";

  import { useEffect, useMemo, useState } from "react";
  import Link from "next/link";
  import { useSearchParams } from "next/navigation";
  import {
    AlertTriangle,
    ArrowRight,
    BellRing,
    CheckCircle2,
    ChevronRight,
    Radar,
    Scale,
    Unlock
  } from "lucide-react";
  import { useI18n } from "@/lib/i18n/context";
  import { useSiteSettings } from "@/hooks/useSiteSettings";
  import { useVehicleLookup } from "@/hooks/useVehicleLookup";
  import { formatDisplayPlate } from "@/lib/rdw/normalize";
  import {
    hasPaidAccessForPlate,
    ensurePaidAccessChecked,
    onPlateAccessChanged
  } from "@/lib/payments/access";
  import type { PublicSiteSettings } from "@/lib/site-settings/defaults";
  import { GROUPS, type GroupDef, type GroupId } from "@/lib/vehicle/groups";
  import type { GroupStatus } from "@/lib/vehicle/signals";
  import { SubscriptionModal } from "@/components/ui/SubscriptionModal";
  import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary";
  import { isSamplePlate } from "@/lib/sample";
  import { track } from "@/lib/analytics";
  import { ScanIntro } from "./ScanIntro";
  import { JudgmentBlock } from "./JudgmentBlock";
  import { AiAnalysisScreen } from "./AiAnalysisScreen";
  import { VehicleResultScreen } from "./VehicleResultScreen";
  import { MarketAnalysisScreen } from "./MarketAnalysisScreen";
  import { InspectionTimelineScreen } from "./InspectionTimelineScreen";
  import { MileageTimelineScreen } from "./MileageTimelineScreen";
  import { DamageHistoryScreen } from "./DamageHistoryScreen";
  import { OwnershipTimelineScreen } from "./OwnershipTimelineScreen";
  import { ApkFailureIntelligenceScreen } from "./ApkFailureIntelligenceScreen";
  import { TechnicalSpecsScreen } from "./TechnicalSpecsScreen";
  import { ReportGroup } from "./ReportGroup";
  import { ReportSectionNav } from "./ReportSectionNav";
  import { TrustBadges } from "./TrustBadges";
  import { ComparableListings } from "./ComparableListings";
  import styles from "./FullReportScreen.module.css";
  ```

  Notes on the diff: removed `Lock` (no longer used directly here — the lock chip moved into `ReportGroup`), removed `RiskOverviewScreen` import, added `GROUPS`/`GroupDef`/`GroupId`, `GroupStatus`, `ReportGroup`, `JudgmentBlock`. Kept `Radar`/`CheckCircle2`/`AlertTriangle` because `RecordsSummary` (still present until Phase 3) uses them.

- [ ] Replace the `SECTIONS` array (currently ln 49-155, the `SectionDef` type + the array) with a SECTIONS REGISTRY keyed by `ReportSectionId`. Replace the block starting at `type SectionDef = {` (ln 49) through the closing `];` of `SECTIONS` (ln 155) with:

  ```tsx
  import type { ReportSectionId } from "@/lib/vehicle/groups";

  type SectionEntry = {
    component: (plate: string) => React.ReactNode;
    lockKey: keyof PublicSiteSettings["lockSections"] | null;
    labelNl: string;
    labelEn: string;
  };

  /**
   * Registry of every report section. Layout is driven by GROUPS
   * (lib/vehicle/groups.ts); this map only says HOW to render each sectionId.
   * Each screen self-gates with its own PremiumLock (sectionKey), so we do NOT
   * wrap a second PremiumLock here. The "risico" section (RiskOverviewScreen) is
   * intentionally absent: its BLUF role moved to JudgmentBlock.
   */
  const SECTIONS: Record<ReportSectionId, SectionEntry> = {
    overzicht: {
      component: (plate) => <VehicleResultScreen plate={plate} embedded />,
      lockKey: null,
      labelNl: "Overzicht",
      labelEn: "Overview"
    },
    "ai-analyse": {
      component: (plate) => <AiAnalysisScreen plate={plate} embedded />,
      lockKey: "riskOverview",
      labelNl: "Samenvatting & advies",
      labelEn: "Summary & advice"
    },
    markt: {
      component: (plate) => <MarketAnalysisScreen plate={plate} embedded />,
      lockKey: "marketAnalysis",
      labelNl: "Marktwaarde",
      labelEn: "Market value"
    },
    "te-koop": {
      component: (plate) => <ComparableListings plate={plate} />,
      lockKey: "marketAnalysis",
      labelNl: "Vergelijkbare auto's te koop",
      labelEn: "Comparable cars for sale"
    },
    kilometerstand: {
      component: (plate) => <MileageTimelineScreen plate={plate} embedded />,
      lockKey: "mileageHistory",
      labelNl: "Kilometerstand",
      labelEn: "Mileage"
    },
    apk: {
      component: (plate) => <InspectionTimelineScreen plate={plate} embedded />,
      lockKey: "inspectionTimeline",
      labelNl: "APK-historie",
      labelEn: "APK history"
    },
    risico: {
      component: () => null,
      lockKey: null,
      labelNl: "Risico's",
      labelEn: "Risks"
    },
    schade: {
      component: (plate) => <DamageHistoryScreen plate={plate} embedded />,
      lockKey: "damageHistory",
      labelNl: "Schadesignalen",
      labelEn: "Damage signals"
    },
    eigendom: {
      component: (plate) => <OwnershipTimelineScreen plate={plate} embedded />,
      lockKey: "ownershipHistory",
      labelNl: "Eigendom",
      labelEn: "Ownership"
    },
    "apk-intelligence": {
      component: (plate) => <ApkFailureIntelligenceScreen plate={plate} embedded />,
      lockKey: "riskOverview",
      labelNl: "APK-inzichten",
      labelEn: "APK insights"
    },
    specs: {
      component: (plate) => <TechnicalSpecsScreen plate={plate} embedded />,
      lockKey: "technicalSpecs",
      labelNl: "Technische specs",
      labelEn: "Tech specs"
    },
    acties: {
      component: () => null,
      lockKey: null,
      labelNl: "Volgende stappen",
      labelEn: "Next steps"
    }
  };
  ```

  Note: `risico` and `acties` map to `() => null` because `risico` is dropped entirely and `acties` renders via a dedicated free footer (not via a group). They stay in the registry only to satisfy the `Record<ReportSectionId, ...>` exhaustiveness from the locked `ReportSectionId` union.

- [ ] DELETE the old `SectionBlock` component (currently ln 329-369, the `/* Section wrapper with numbered header */` function). It is replaced by `ReportGroup`. Remove the entire block:

  ```tsx
  /* ── Section wrapper with numbered header ───────────────────────────── */
  function SectionBlock({
    section,
    index,
    isPremium,
    locale,
    children
  }: {
    section: SectionDef;
    index: number;
    isPremium: boolean;
    locale: "nl" | "en";
    children: React.ReactNode;
  }) {
    const nl = locale === "nl";
    return (
      <section id={section.id} className={styles.sectionBlock}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionIndex}>{String(index).padStart(2, "0")}</span>
          <div className={styles.sectionMeta}>
            <span className={styles.sectionTitle}>
              {nl ? section.labelNl : section.labelEn}
              {section.lockKey ? (
                isPremium ? (
                  <span className={`${styles.sectionChip} ${styles.sectionChipPremium}`}>
                    <Lock size={9} /> Premium
                  </span>
                ) : (
                  <span className={`${styles.sectionChip} ${styles.sectionChipFree}`}>{nl ? "Inbegrepen" : "Included"}</span>
                )
              ) : (
                <span className={`${styles.sectionChip} ${styles.sectionChipFree}`}>{nl ? "Gratis" : "Free"}</span>
              )}
            </span>
            <span className={styles.sectionSub}>{nl ? section.subNl : section.subEn}</span>
          </div>
        </div>
        <SectionErrorBoundary label={section.id}>{children}</SectionErrorBoundary>
      </section>
    );
  }
  ```

- [ ] Replace the body of `FullReportScreen` from the `isPremiumSection` helper down through the end of the JSX `return`. The current code is ln 372-541. Replace from `export function FullReportScreen({ plate }: Props) {` (ln 372) to the final closing `}` (ln 541) with:

  ```tsx
  /* ── Full single-scroll report ──────────────────────────────────────── */
  export function FullReportScreen({ plate }: Props) {
    const { locale } = useI18n();
    const nl = locale === "nl";
    const { settings } = useSiteSettings();
    const searchParams = useSearchParams();
    const { normalized, isValid, data } = useVehicleLookup(plate);
    const [showPayment, setShowPayment] = useState(false);

    const unlocked = usePlateUnlocked(normalized, settings.paymentEnabled);
    const priceLabel = `€ ${settings.payment.amount}`;

    const [openGroups, setOpenGroups] = useState<Record<GroupId, boolean>>(() => {
      const seed = {} as Record<GroupId, boolean>;
      for (const group of GROUPS) seed[group.id] = group.defaultOpen;
      return seed;
    });

    useEffect(() => {
      if (isValid && normalized) track("report_viewed", { sample: isSamplePlate(normalized) });
    }, [isValid, normalized]);

    const isPremiumGroup = (group: GroupDef): boolean => {
      if (!group.lockKey) return false;
      if (!settings.paymentEnabled) return false;
      if (unlocked) return false;
      return settings.lockSections[group.lockKey];
    };

    const groupStatus = (group: GroupDef): GroupStatus => {
      const fromSignals = data?.signals?.groupStatus?.[group.id];
      if (fromSignals) return fromSignals;
      return {
        tone: "ok",
        labelNl: "Gegevens beschikbaar",
        labelEn: "Data available"
      };
    };

    const toggleGroup = (id: GroupId) => {
      setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const allOpen = GROUPS.every((group) => openGroups[group.id]);

    const expandAll = () => {
      const next = {} as Record<GroupId, boolean>;
      const target = !allOpen;
      for (const group of GROUPS) next[group.id] = target;
      setOpenGroups(next);
    };

    const jumpToGroup = (id: string) => {
      setOpenGroups((prev) => ({ ...prev, [id as GroupId]: true }));
      // Open state flips on the next render; defer the scroll one frame so the
      // header is settled (it is always in the DOM, so this is just polish).
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    if (!isValid) {
      return (
        <div className={styles.page}>
          <div className={styles.statePanel}>{nl ? "Ongeldig kenteken." : "Invalid license plate."}</div>
        </div>
      );
    }

    const sharedQuery = searchParams?.toString();
    const withQuery = (href: string) => (sharedQuery ? `${href}?${sharedQuery}` : href);

    const navItems = GROUPS.map((group) => ({
      id: group.id as string,
      label: nl ? group.labelNl : group.labelEn,
      locked: isPremiumGroup(group)
    }));

    return (
      <div className={styles.page}>
        <ScanIntro plate={normalized} />

        <div className={styles.container}>
          <ReportSectionNav
            items={navItems}
            onJump={jumpToGroup}
            onExpandAll={expandAll}
            allOpen={allOpen}
          />

          <SectionErrorBoundary label="judgment-block">
            <JudgmentBlock plate={normalized} onJump={jumpToGroup} />
          </SectionErrorBoundary>

          {/* Phase 3 swaps RecordsSummary for ReportTeaser. */}
          <SectionErrorBoundary label="records-summary">
            <RecordsSummary
              plate={normalized}
              unlocked={unlocked}
              priceLabel={priceLabel}
              onUnlockClick={() => setShowPayment(true)}
            />
          </SectionErrorBoundary>

          <SectionErrorBoundary label="trust-badges">
            <TrustBadges plate={normalized} />
          </SectionErrorBoundary>

          {GROUPS.map((group, idx) => (
            <ReportGroup
              key={group.id}
              group={group}
              index={idx + 1}
              status={groupStatus(group)}
              isPremium={isPremiumGroup(group)}
              open={openGroups[group.id]}
              onToggle={toggleGroup}
              locale={locale}
            >
              {group.sectionIds.map((sectionId) => (
                <div key={sectionId}>{SECTIONS[sectionId].component(normalized)}</div>
              ))}
            </ReportGroup>
          ))}

          <SectionErrorBoundary label="acties">
            <div className={styles.actionsGrid}>
              <Link href={withQuery(`/search/${normalized}/vehicle-comparison`)} className={styles.actionCard}>
                <span className={styles.actionIcon}>
                  <Scale size={22} />
                </span>
                <span className={styles.actionCopy}>
                  <span className={styles.actionTitle}>{nl ? "Vergelijk met een tweede auto" : "Compare with a second car"}</span>
                  <span className={styles.actionDesc}>
                    {nl
                      ? "Zet dit kenteken naast een andere kandidaat over 30+ datapunten, met een duidelijk oordeel."
                      : "Put this plate next to another candidate across 30+ data points, with a clear verdict."}
                  </span>
                </span>
                <ChevronRight size={18} className={styles.actionChevron} />
              </Link>
              <Link href={withQuery(`/search/${normalized}/post-purchase-watch`)} className={styles.actionCard}>
                <span className={styles.actionIcon}>
                  <BellRing size={22} />
                </span>
                <span className={styles.actionCopy}>
                  <span className={styles.actionTitle}>{nl ? "Volg dit kenteken (watch mode)" : "Watch this plate"}</span>
                  <span className={styles.actionDesc}>
                    {nl
                      ? "Ontvang een melding bij nieuwe terugroepacties, APK-wijzigingen of risicoverschuivingen."
                      : "Get notified on new recalls, APK changes or risk shifts."}
                  </span>
                </span>
                <ChevronRight size={18} className={styles.actionChevron} />
              </Link>
            </div>
          </SectionErrorBoundary>
        </div>

        {/* Sticky mobile unlock bar */}
        {!unlocked && settings.paymentEnabled ? (
          <div className={styles.stickyBar}>
            <div className={styles.stickyCopy}>
              <span className={styles.stickyTitle}>
                {nl ? `Volledig rapport · ${priceLabel}` : `Full report · ${priceLabel}`}
              </span>
              <span className={styles.stickySub}>
                {nl ? "Eenmalig voor dit kenteken" : "One-time for this plate"}
              </span>
            </div>
            <button type="button" className={styles.stickyBtn} onClick={() => setShowPayment(true)}>
              {nl ? "Ontgrendel" : "Unlock"}
              <ArrowRight size={15} />
            </button>
          </div>
        ) : null}

        <SubscriptionModal
          isOpen={showPayment}
          onClose={() => setShowPayment(false)}
          featureName={nl ? "het volledige rapport" : "the full report"}
          plate={normalized}
          onUnlocked={() => setShowPayment(false)}
        />
      </div>
    );
  }
  ```

  Diff highlights vs the old body:
  - `useVehicleLookup(plate)` now also destructures `data` (was `{ normalized, isValid }`) so we can read `data.signals.groupStatus`.
  - Added controlled `openGroups` state seeded from `GROUPS` `defaultOpen`; `toggleGroup`, `allOpen`, `expandAll`, `jumpToGroup` helpers.
  - `isPremiumSection(section)` -> `isPremiumGroup(group)` (drives the group header chip + nav lock icon ONLY; bodies self-gate).
  - The 12 hand-written `<SectionBlock>` calls (old ln 423-511) collapse into the single `GROUPS.map(...)` loop. The `risico` SectionBlock (old ln 460-462, `RiskOverviewScreen`) is GONE — `risico` is not in any group's `sectionIds`.
  - `RecordsSummary` + `TrustBadges` kept (RecordsSummary swapped in Phase 3); `JudgmentBlock` added at the top.
  - The `acties` footer is rendered directly (free), not as a group, matching "acties = free footer, rendered after the groups, outside GROUPS".

- [ ] DELETE the now-unused `RiskOverviewScreen.tsx` orphan note: it is NOT deleted from disk (the file + its standalone route stay per the locked product decision); we only removed its import + render here. No action on disk.

- [ ] Typecheck the whole project:
  ```bash
  npm --prefix "C:/Users/Sabur/sites/kentekenrapport" run typecheck
  ```
  Expected: exits 0. If `data.signals` errors with "Property 'signals' does not exist on type 'VehicleProfile'", Phase 1 has not yet added `signals` to the `VehicleProfile` type — STOP and confirm Phase 1's type change is merged (the `groupStatus(group)` reader uses optional chaining so the value is safe at runtime, but TS needs the field on the type).

- [ ] Build:
  ```bash
  npm --prefix "C:/Users/Sabur/sites/kentekenrapport" run build
  ```
  Expected: "Compiled successfully" and the build completes (route pages generated). MongoDB-dependent API routes may log 500s at static-generation time which is normal per CLAUDE.md; the build itself must exit 0.

- [ ] Commit Tasks 2.3 + 2.4 together (interdependent nav contract + rewire):
  ```bash
  git -C "C:/Users/Sabur/sites/kentekenrapport" add components/vehicle/ReportSectionNav.tsx components/vehicle/FullReportScreen.tsx components/vehicle/FullReportScreen.module.css components/vehicle/JudgmentBlock.tsx
  git -C "C:/Users/Sabur/sites/kentekenrapport" commit -m "$(cat <<'EOF'
feat(report): drive report from GROUPS via accordion + group-level nav

- FullReportScreen layout now driven by lib/vehicle/groups GROUPS; sections
  rendered through a registry, each group via ReportGroup with controlled
  openGroups state seeded from defaultOpen.
- ReportSectionNav is group-level: onJump (open group then scroll header),
  onExpandAll toggle, scrollspy observes always-present group headers.
- Drop RiskOverviewScreen from the report (BLUF moved to JudgmentBlock);
  risico section not in any group. Free acties footer rendered after groups.
- Group status read from data.signals.groupStatus; per-section PremiumLock
  kept inside each screen (no double-gate).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 2.5: Consolidate the scroll offset to ONE value (132px) across nav, sections, observer, globals

**Files:** `components/vehicle/FullReportScreen.module.css` (MODIFY), `app/globals.css` (MODIFY)

Today there are THREE different offsets: `globals.css` `scroll-padding-top: 120px` (ln 46), `FullReportScreen.module.css` `.sectionBlock { scroll-margin-top: 130px }` (ln 262), and the observer `rootMargin: "-140px 0px -55% 0px"` (old nav ln 40). The site header is sticky and the in-report nav sits at `.navWrap { top: 58px }` (FullReportScreen.module.css ln 38-45) and is roughly 50px tall plus margin, so a jumped header must clear ~110-130px. We standardize on **132px** everywhere: `ReportGroup.module.css .group { scroll-margin-top: 132px }` (already set in Task 2.1), the observer `rootMargin` top `-132px` (already set in Task 2.3), `globals.css scroll-padding-top: 132px`, and we remove the now-dead `.sectionBlock`/`.sectionHead`/`.sectionIndex`/`.sectionMeta`/`.sectionTitle`/`.sectionSub`/`.sectionChip*` rules that only `SectionBlock` used (SectionBlock was deleted in Task 2.4).

- [ ] In `C:\Users\Sabur\sites\kentekenrapport\app\globals.css`, change the `scroll-padding-top` (ln 43-47):

  Old:
  ```css
    html {
      /* Account for the sticky site header + report section-nav so anchor jumps
         and scroll-into-view never land a heading hidden behind them. */
      scroll-padding-top: 120px;
    }
  ```

  New:
  ```css
    html {
      /* Account for the sticky site header + report section-nav so anchor jumps
         and scroll-into-view never land a heading hidden behind them. Single
         source of truth: 132px, matching ReportGroup scroll-margin-top and the
         scrollspy observer rootMargin. */
      scroll-padding-top: 132px;
    }
  ```

- [ ] In `C:\Users\Sabur\sites\kentekenrapport\components\vehicle\FullReportScreen.module.css`, DELETE the dead `SectionBlock` rules. Remove the entire block from `/* ---------- Section blocks ---------- */` through the end of `.sectionChipPremium` (currently ln 259-334):

  Remove:
  ```css
  /* ---------- Section blocks ---------- */

  .sectionBlock {
    scroll-margin-top: 130px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
    max-width: 100%;
  }

  .sectionHead {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 6px 14px;
  }

  .sectionIndex {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: #eef4ff;
    color: #1d4ed8;
    font-weight: 900;
    font-size: 0.8rem;
  }

  .sectionMeta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .sectionTitle {
    font-size: 1.05rem;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .sectionSub {
    color: #64748b;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .sectionChip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 3px 9px;
  }

  .sectionChipFree {
    background: #dcfce7;
    color: #166534;
  }

  .sectionChipPremium {
    background: #0f172a;
    color: #fff;
  }
  ```

  (Leave the `/* ---------- Next actions ---------- */` block and everything after it intact.)

- [ ] Typecheck + build again to confirm removing the dead CSS broke nothing (CSS Modules unused-class references would only matter in TSX, and we deleted those usages in Task 2.4):
  ```bash
  npm --prefix "C:/Users/Sabur/sites/kentekenrapport" run typecheck
  npm --prefix "C:/Users/Sabur/sites/kentekenrapport" run build
  ```
  Expected: typecheck exits 0; build "Compiled successfully".

- [ ] Commit:
  ```bash
  git -C "C:/Users/Sabur/sites/kentekenrapport" add app/globals.css components/vehicle/FullReportScreen.module.css
  git -C "C:/Users/Sabur/sites/kentekenrapport" commit -m "$(cat <<'EOF'
refactor(report): single 132px scroll offset + drop dead SectionBlock CSS

Align globals scroll-padding-top, ReportGroup scroll-margin-top and the
scrollspy observer rootMargin to one 132px value so jumped headers always
clear the sticky header + in-report nav. Remove the .sectionBlock rules that
the deleted SectionBlock used.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 2.6: Headless Chromium verification (desktop 1380px + mobile 390px)

**Files:** none (verification only). Uses the project's headless workflow (CLAUDE.md "Verificatie-workflow"): production mode (`next build` + `next start`), Playwright from `/opt/pw-browsers`, log `pageerror`/`console`, mock the vehicle API with a real production payload (sandbox cannot reach MongoDB / opendata.rdw.nl / *.vercel.app). The mocked payload MUST include a `signals` object (the Phase 1 `VehicleSignalReport`) so the colored status lines render; without it the group status falls back to the neutral "ok" line (still valid, but you cannot verify color tones).

- [ ] Create the verification script at `C:\Users\Sabur\sites\kentekenrapport\scripts\verify-phase2.mjs` (throwaway; do not commit). It mocks `/api/vehicle/*` with a payload that has both the RDW fields and a `signals` block, then checks: no horizontal scroll, G1+G2 open by default, G3-G6 collapsed (their body not in DOM), expand-all opens all, a nav jump opens a collapsed group and scrolls, scrollspy highlights, and sample plate H223JZ is fully expanded.

  ```js
  import { chromium } from "playwright";

  const BASE = "http://localhost:3000";

  // Minimal real-shape payload incl. the Phase 1 signals block.
  const vehiclePayload = {
    vehicle: {
      plate: "H223JZ",
      make: "VOLKSWAGEN",
      model: "GOLF",
      wok: false,
      transferPossible: true,
      isTaxi: false,
      hasOpenRecall: false,
      recallsCount: 0,
      napVerdict: "Logisch",
      apkExpiryDate: "2027-03-01"
    },
    enriched: { isImported: false, estimatedValueNow: 6150 },
    inspections: [],
    defects: [],
    recalls: [],
    signals: {
      verdict: { tone: "ok", headingNl: "Geen alarmsignalen gevonden", headingEn: "No alarms found" },
      signals: [],
      alerts: [],
      summary: { checked: 3, needAttention: 0, priceAffecting: 0 },
      groupStatus: {
        "g1-verdict": { tone: "ok", labelNl: "Geen alarmsignalen gevonden", labelEn: "No alarms found" },
        "g2-markt": { tone: "ok", labelNl: "Ontgrendel de marktwaarde-analyse", labelEn: "Unlock the market analysis" },
        "g3-risico": { tone: "ok", labelNl: "Geen schadesignalen", labelEn: "No damage signals" },
        "g4-km": { tone: "ok", labelNl: "Tellerstand logisch", labelEn: "Mileage plausible" },
        "g5-apk": { tone: "ok", labelNl: "APK geldig", labelEn: "APK valid" },
        "g6-voertuig": { tone: "ok", labelNl: "RDW-voertuiggegevens compleet", labelEn: "RDW vehicle data complete" }
      }
    }
  };

  const errors = [];
  const fail = (m) => { errors.push(m); console.error("FAIL:", m); };
  const ok = (m) => console.log("ok:", m);

  for (const [name, width] of [["desktop", 1380], ["mobile", 390]]) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (e) => fail(`${name} pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") fail(`${name} console: ${m.text()}`); });

    await page.route("**/api/vehicle/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(vehiclePayload) })
    );
    await page.route("**/api/payments/access/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ paid: true }) })
    );

    await page.goto(`${BASE}/search/H223JZ`, { waitUntil: "networkidle" });
    // ScanIntro animates; wait for the group headers.
    await page.waitForSelector("#g1-verdict", { timeout: 15000 });

    // No horizontal scroll.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) fail(`${name} horizontal overflow ${overflow}px`); else ok(`${name} no horizontal scroll`);

    // G1 + G2 default open (their -body present), G3-G6 collapsed.
    const open1 = await page.locator("#g1-verdict-body").count();
    const open2 = await page.locator("#g2-markt-body").count();
    const closed3 = await page.locator("#g3-risico-body").count();
    if (open1 === 1 && open2 === 1) ok(`${name} G1+G2 open by default`); else fail(`${name} G1/G2 not open (g1=${open1} g2=${open2})`);
    if (closed3 === 0) ok(`${name} G3 collapsed by default`); else fail(`${name} G3 body present while collapsed`);

    // All group headers always present even when collapsed.
    for (const id of ["g3-risico", "g4-km", "g5-apk", "g6-voertuig"]) {
      const has = await page.locator(`#${id}`).count();
      if (has === 1) ok(`${name} header ${id} present`); else fail(`${name} header ${id} missing`);
    }

    // Expand-all opens everything.
    await page.getByRole("button", { name: /Alles open|Inklappen/ }).click();
    await page.waitForTimeout(300);
    const g6openAfter = await page.locator("#g6-voertuig-body").count();
    if (g6openAfter === 1) ok(`${name} expand-all opened G6`); else fail(`${name} expand-all did not open G6`);

    // Collapse-all (toggle back), then nav jump opens a collapsed group + scrolls.
    await page.getByRole("button", { name: /Alles open|Inklappen/ }).click();
    await page.waitForTimeout(300);
    const g5beforeJump = await page.locator("#g5-apk-body").count();
    if (g5beforeJump === 0) ok(`${name} G5 collapsed before jump`); else fail(`${name} G5 unexpectedly open before jump`);
    await page.locator(`[data-nav-id="g5-apk"]`).click();
    await page.waitForTimeout(600);
    const g5afterJump = await page.locator("#g5-apk-body").count();
    if (g5afterJump === 1) ok(`${name} nav jump opened G5`); else fail(`${name} nav jump did not open G5`);
    const g5InView = await page.locator("#g5-apk").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.top < 200;
    });
    if (g5InView) ok(`${name} nav jump scrolled G5 header into view`); else fail(`${name} G5 header not near top after jump`);

    await browser.close();
  }

  if (errors.length) {
    console.error(`\n${errors.length} FAILURES`);
    process.exit(1);
  }
  console.log("\nAll Phase 2 headless checks passed.");
  ```

- [ ] Install Playwright (no-save) and run the build + start + verify. In one terminal start the production server, in another run the script:
  ```bash
  npm --prefix "C:/Users/Sabur/sites/kentekenrapport" i --no-save playwright@1.56.1
  npm --prefix "C:/Users/Sabur/sites/kentekenrapport" run build
  ```
  Then start the server in the background and run the script:
  ```bash
  npm --prefix "C:/Users/Sabur/sites/kentekenrapport" run start &
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node "C:/Users/Sabur/sites/kentekenrapport/scripts/verify-phase2.mjs"
  ```
  Expected output ends with: `All Phase 2 headless checks passed.` and exit 0. (On Windows, run `next start` in a separate PowerShell window if `&` backgrounding is unavailable; the CLAUDE.md workflow assumes a POSIX-ish runner via the Bash tool.)

- [ ] Manual visual spot-check (optional but recommended): screenshot desktop + mobile and confirm the colored status line under each collapsed group header is visible, the chevron rotates on open, and the lock chip shows on G2-G6 while logged-out (set the access mock to `{ paid: false }` and `lockSections` defaults). No code change.

- [ ] Clean up the throwaway script (do not commit it):
  ```bash
  rm -f "C:/Users/Sabur/sites/kentekenrapport/scripts/verify-phase2.mjs"
  ```

- [ ] No commit for this task (verification only). If any check failed, fix the offending task before proceeding to Phase 3.

---

### Phase 2 done-criteria recap
- [ ] `ReportGroup.tsx` + `.module.css` exist and match the locked props contract (header always in DOM with `id={group.id}`, colored status line, lock/free chip, chevron, body in `SectionErrorBoundary`).
- [ ] `FullReportScreen.tsx` renders `JudgmentBlock` -> `RecordsSummary` (Phase 3 swaps for `ReportTeaser`) -> `TrustBadges` -> 6 `ReportGroup`s from `GROUPS` -> free `acties` footer; `risico`/`RiskOverviewScreen` dropped.
- [ ] `ReportSectionNav` is group-level with `onJump`/`onExpandAll`/`allOpen`; scrollspy observes group headers.
- [ ] One 132px scroll offset across `globals.css`, `ReportGroup.module.css`, and the observer `rootMargin`.
- [ ] `npm run typecheck` clean, `npm run build` success, headless desktop+mobile all checks pass, sample H223JZ fully expanded.
