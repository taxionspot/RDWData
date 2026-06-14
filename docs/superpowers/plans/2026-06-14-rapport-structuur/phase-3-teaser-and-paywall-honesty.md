## Phase 3 — Teaser component + honest paywall (de-blur)

**Goal:** Replace the synthetic "datapoints" math and the fake-blur paywall with honest, signal-driven copy. (1) Extract the inline `RecordsSummary` (FullReportScreen ln 173-327) into a standalone `ReportTeaser` that sources its counts from the server-computed `data.signals.summary` (`checked` / `needAttention` / `priceAffecting`) and adds the honest "1 raakt de eerlijke prijs" line. (2) De-blur `PremiumLock`: drop `filter:blur` + `max-height:300px` crop in favour of an honest compact teaser (factual preview line + clear lock card + unlock CTA) and converge every per-instance `SubscriptionModal` onto a single page-level modal via the `lib/payments/access.ts` event bus, killing ~13 modal instances. (3) `SubscriptionModal` honesty: no money-back text anywhere, price rendered small from settings, keep herroepingsrecht, add iDEAL/secure badge, an OPTIONAL reviews slot that renders nothing when empty (new `reviews` field in settings, default empty), an honest value stack with a couple of genuinely-locked proof rows (no fake blur), and the honest stake line.

**Dependency note:** This phase assumes Phase 1 added `lib/vehicle/signals.ts` (exporting `computeVehicleSignals` + `VehicleSignalReport`) and Phase 2 attached the computed report to the API response as `signals?: VehicleSignalReport` on `VehicleProfile` (`lib/rdw/types.ts`), and to the `data` returned by `useVehicleLookup`. Every `data.signals` read below is defensively optional-chained so this phase still typechecks and renders (teaser falls back to a neutral state) even if a plate response lacks `signals`.

**Files touched:**
- `lib/site-settings/defaults.ts` (MODIFY: add `reviews` field to type + default empty array)
- `lib/site-settings/sanitize.ts` (MODIFY: sanitize `reviews`)
- `tests/site-settings-sanitize.test.ts` (MODIFY: cover `reviews` sanitization)
- `tsconfig.test.json` (no change needed; sanitize.ts already in `include` via `tests/**` import chain — see Task 3.1 note)
- `components/vehicle/ReportTeaser.tsx` (NEW)
- `components/vehicle/ReportTeaser.module.css` (NEW)
- `components/vehicle/FullReportScreen.tsx` (MODIFY: remove inline `RecordsSummary`, render `ReportTeaser`)
- `components/ui/PremiumLock.tsx` (MODIFY: de-blur, single-modal via `onUnlockClick`)
- `components/ui/PremiumLock.module.css` (MODIFY: remove blur/crop, add honest teaser styles)
- `components/ui/SubscriptionModal.tsx` (MODIFY: value stack, reviews slot, stake line, iDEAL/secure badge, small price)
- `components/ui/SubscriptionModal.module.css` (MODIFY: value-stack + reviews + stake + badge styles, remove `.guaranteeLine`)

---

### Task 3.1: Add an OPTIONAL `reviews` field to site settings (type + default + sanitizer), TDD

**Files:** `lib/site-settings/defaults.ts`, `lib/site-settings/sanitize.ts`, `tests/site-settings-sanitize.test.ts`

This gives the owner ONE place to later add 2-3 real NL quotes. Default is an empty array so the reviews slot renders nothing until then. `sanitize.ts` is already compiled by `tsconfig.test.json` because `tests/site-settings-sanitize.test.ts` imports it and the test glob `tests/**/*.ts` is in `include`; TypeScript follows the import. No `tsconfig.test.json` edit needed for this task.

- [ ] Write the failing test. Append to `tests/site-settings-sanitize.test.ts` (after the last test, currently ending ln 73):

```ts
test("sanitizeSiteSettings defaults reviews to an empty array", () => {
  assert.deepEqual(sanitizeSiteSettings(null).reviews, []);
  assert.deepEqual(sanitizeSiteSettings({}).reviews, []);
  assert.deepEqual(sanitizeSiteSettings({ reviews: "not-an-array" }).reviews, []);
});

test("sanitizeSiteSettings keeps valid reviews and drops malformed entries", () => {
  const result = sanitizeSiteSettings({
    reviews: [
      { quote: "Snel en duidelijk.", author: "Jeroen K." },
      { quote: "Bespaarde me een miskoop.", author: "" },
      { quote: "", author: "Lege quote" },
      { broken: true },
      42
    ]
  });
  assert.deepEqual(result.reviews, [
    { quote: "Snel en duidelijk.", author: "Jeroen K." },
    { quote: "Bespaarde me een miskoop.", author: "" }
  ]);
});
```

- [ ] Run the test, expect FAIL (the `reviews` field does not exist yet, so `sanitizeSiteSettings(null).reviews` is `undefined`):

```
npm test
```

Expected: the two new `reviews` tests FAIL (assertion error: `undefined` deepEqual `[]`); all existing tests still pass.

- [ ] Add the `reviews` field to the type. In `lib/site-settings/defaults.ts`, the `PublicSiteSettings` type currently ends with the `email` block (ln 73-80) then `};` (ln 81). Add a `reviews` member just before the closing `};` of the type (after the `email` block, ln 80):

```ts
  email: {
    fromName: string;
    fromAddress: string;
    reportSubjectNl: string;
    reportSubjectEn: string;
    welcomeBodyNl: string;
    welcomeBodyEn: string;
  };
  // Optional real customer quotes for the paywall. Empty by default: the
  // reviews slot renders nothing until the owner adds genuine NL quotes here.
  reviews: Array<{ quote: string; author: string }>;
};
```

- [ ] Add the default empty array. In `lib/site-settings/defaults.ts`, the `defaultSiteSettings` object ends with the `email` block (ln 211-218) then `};` (ln 219). Add `reviews: []` after the `email` block:

```ts
  email: {
    fromName: "Anouk van Kentekenrapport",
    fromAddress: "info@kentekenrapport.com",
    reportSubjectNl: "Jouw kentekenrapport",
    reportSubjectEn: "Your vehicle report",
    welcomeBodyNl: "Bedankt voor het gebruiken van Kentekenrapport. Uw rapport is bijgevoegd.",
    welcomeBodyEn: "Thank you for using Kentekenrapport. Your report is attached."
  },
  reviews: []
};
```

- [ ] Add the sanitizer helper. In `lib/site-settings/sanitize.ts`, add this function after `workflowItems` (which ends ln 94) and before `export function sanitizeSiteSettings` (ln 96):

```ts
function reviewItems(
  value: unknown,
  fallback: PublicSiteSettings["reviews"]
): PublicSiteSettings["reviews"] {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((item) => {
      const obj = asRecord(item);
      const quote = typeof obj.quote === "string" ? obj.quote.trim() : "";
      const author = typeof obj.author === "string" ? obj.author.trim() : "";
      return { quote, author };
    })
    .filter((item) => item.quote !== "");
}
```

- [ ] Wire it into the returned object. In `lib/site-settings/sanitize.ts`, the return object's `email` block ends ln 189 and the object closes with `};` ln 190. Add `reviews` after the `email` block:

```ts
    email: {
      fromName: str(email.fromName, d.email.fromName),
      fromAddress: str(email.fromAddress, d.email.fromAddress),
      reportSubjectNl: str(email.reportSubjectNl, d.email.reportSubjectNl),
      reportSubjectEn: str(email.reportSubjectEn, d.email.reportSubjectEn),
      welcomeBodyNl: str(email.welcomeBodyNl, d.email.welcomeBodyNl),
      welcomeBodyEn: str(email.welcomeBodyEn, d.email.welcomeBodyEn)
    },
    reviews: reviewItems(raw.reviews, d.reviews)
  };
}
```

- [ ] Run the test, expect PASS:

```
npm test
```

Expected: all tests pass, including the two new `reviews` tests. The empty-array test passes because `reviewItems` returns the (empty) fallback for non-arrays and an empty filtered list otherwise; the malformed-entries test passes because entries with an empty `quote` are dropped while `{ quote, author:"" }` is kept.

- [ ] Commit:

```
git add lib/site-settings/defaults.ts lib/site-settings/sanitize.ts tests/site-settings-sanitize.test.ts
git commit -m "Add optional reviews field to site settings (default empty, sanitized)"
```

---

### Task 3.2: Create `ReportTeaser.module.css` (extracted + honest styles)

**Files:** `components/vehicle/ReportTeaser.module.css`

We give `ReportTeaser` its own stylesheet rather than reusing `FullReportScreen.module.css` so the component is self-contained. Styles mirror the existing summary look (the original used `.summary`, `.summaryCopy`, `.summaryEyebrow`, `.summaryTitle`, `.summaryChips`, `.summaryChip`, `.summaryChipDanger/Warn/Ok`, `.summaryHint`, `.summaryAction`, `.unlockBtn`, `.unlockMicro`, `.unlockedBadge` in `FullReportScreen.module.css` ln 105-260) but use the agreed palette and add a `.priceAffecting` line. No blur, no fake crop. No em-dashes/en-dashes in any class comment or content.

- [ ] Create `components/vehicle/ReportTeaser.module.css` with the complete file:

```css
.teaser {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-end;
  justify-content: space-between;
  background: #f8fafc;
  border: 1px solid #e2e8f2;
  border-radius: 18px;
  padding: 20px 22px;
  margin: 8px 0 4px;
}

.copy {
  flex: 1 1 320px;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #5b6b84;
}

.title {
  font-size: 17px;
  line-height: 1.45;
  color: #0f172a;
  font-weight: 600;
}

.title strong {
  font-weight: 800;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #e2e8f2;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}

.chipOk {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #15803d;
}

.chipWarn {
  border-color: #fde68a;
  background: #fffbeb;
  color: #b45309;
}

.chipDanger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.priceAffecting {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: #1d4ed8;
}

.hint {
  font-size: 13px;
  line-height: 1.55;
  color: #5b6b84;
  margin: 0;
}

.action {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  min-width: 220px;
}

.unlockBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  cursor: pointer;
  border-radius: 12px;
  padding: 12px 18px;
  background: #2563eb;
  color: #fff;
  font-weight: 800;
  font-size: 14px;
  transition: background 0.2s ease;
}

.unlockBtn:hover {
  background: #1d4ed8;
}

.unlockMicro {
  font-size: 11px;
  line-height: 1.5;
  color: #5b6b84;
  text-align: center;
}

.unlockedBadge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #15803d;
  border-radius: 12px;
  padding: 12px 18px;
  font-weight: 800;
  font-size: 14px;
}

@media (max-width: 640px) {
  .teaser {
    flex-direction: column;
    align-items: stretch;
    padding: 16px;
  }

  .action {
    min-width: 0;
  }
}
```

- [ ] Verify the CSS file has no em-dash or en-dash characters:

```
node -e "const s=require('fs').readFileSync('components/vehicle/ReportTeaser.module.css','utf8');process.exit(/[–—]/.test(s)?1:0)"
```

Expected: exit code 0 (no dashes found; command prints nothing).

- [ ] Commit:

```
git add components/vehicle/ReportTeaser.module.css
git commit -m "Add ReportTeaser stylesheet (honest, no blur)"
```

---

### Task 3.3: Create `components/vehicle/ReportTeaser.tsx` (counts from `data.signals.summary`)

**Files:** `components/vehicle/ReportTeaser.tsx`

This replaces the synthetic `counts.datapoints = 28 + inspections*3 + defects + recalls` math (FullReportScreen ln 188-199) and the hand-rolled `findings` list (ln 201-232) with the server-computed `data.signals.summary` (`checked`, `needAttention`, `priceAffecting`) plus `data.signals.alerts` for the colored chips. The teaser line is honest: "Wij controleerden N signalen. M vragen aandacht." and, when `priceAffecting > 0`, " 1 raakt de eerlijke prijs." (rendered as its own line). Payment-methods micro + unlock button are kept. Defensive fallback: if `data.signals` is absent, render a neutral checked-count line with no findings.

React components are not unit-tested in this repo (see CLAUDE.md headless-Chromium workflow). This is an implement-then-verify task; functional verification happens at the end of Task 3.4.

- [ ] Create `components/vehicle/ReportTeaser.tsx` with the complete file:

```tsx
"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Radar, Tag, Unlock } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { formatDisplayPlate } from "@/lib/rdw/normalize";
import type { SignalTone } from "@/lib/vehicle/signals";
import styles from "./ReportTeaser.module.css";

type Props = {
  plate: string;
  unlocked: boolean;
  priceLabel: string;
  onUnlockClick: () => void;
};

function chipClass(tone: SignalTone): string {
  if (tone === "danger") return `${styles.chip} ${styles.chipDanger}`;
  if (tone === "warn") return `${styles.chip} ${styles.chipWarn}`;
  return `${styles.chip} ${styles.chipOk}`;
}

export function ReportTeaser({ plate, unlocked, priceLabel, onUnlockClick }: Props) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const { data } = useVehicleLookup(plate);
  const signals = data?.signals;

  // Honest, server-derived numbers. No synthetic "datapoints" math.
  const summary = useMemo(
    () => ({
      checked: signals?.summary.checked ?? 0,
      needAttention: signals?.summary.needAttention ?? 0,
      priceAffecting: signals?.summary.priceAffecting ?? 0
    }),
    [signals]
  );

  // Colored chips come straight from the server alerts (the real exceptions).
  // When there are none, show a single calm "no alarm signals" chip.
  const chips = useMemo(() => {
    const alerts = signals?.alerts ?? [];
    if (alerts.length === 0) {
      return [
        {
          key: "none",
          tone: "ok" as SignalTone,
          label: nl ? "Geen alarmsignalen" : "No alarm signals"
        }
      ];
    }
    return alerts.slice(0, 5).map((alert) => ({
      key: alert.key,
      tone: alert.tone,
      label: nl ? alert.labelNl : alert.labelEn
    }));
  }, [signals, nl]);

  return (
    <div className={styles.teaser}>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>
          <Radar size={13} />
          {nl ? "Scan voltooid" : "Scan complete"} {"·"} {formatDisplayPlate(plate)}
        </span>

        <div className={styles.title}>
          {nl ? (
            <>
              Wij controleerden <strong>{summary.checked} signalen</strong>.{" "}
              {summary.needAttention > 0 ? (
                <>
                  <strong>{summary.needAttention}</strong>{" "}
                  {summary.needAttention === 1 ? "vraagt" : "vragen"} aandacht.
                </>
              ) : (
                <>Geen daarvan vraagt aandacht.</>
              )}
            </>
          ) : (
            <>
              We checked <strong>{summary.checked} signals</strong>.{" "}
              {summary.needAttention > 0 ? (
                <>
                  <strong>{summary.needAttention}</strong>{" "}
                  {summary.needAttention === 1 ? "needs" : "need"} attention.
                </>
              ) : (
                <>None of them need attention.</>
              )}
            </>
          )}
        </div>

        {summary.priceAffecting > 0 ? (
          <span className={styles.priceAffecting}>
            <Tag size={14} />
            {nl
              ? `${summary.priceAffecting} ${
                  summary.priceAffecting === 1 ? "punt raakt" : "punten raken"
                } de eerlijke prijs.`
              : `${summary.priceAffecting} ${
                  summary.priceAffecting === 1 ? "point affects" : "points affect"
                } the fair price.`}
          </span>
        ) : null}

        <div className={styles.chips}>
          {chips.map((chip) => (
            <span key={chip.key} className={chipClass(chip.tone)}>
              {chip.tone === "ok" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {chip.label}
            </span>
          ))}
        </div>

        {!unlocked ? (
          <p className={styles.hint}>
            {nl
              ? "Hieronder open je per onderdeel de volledige analyse: marktwaarde, kilometerstand, APK-historie en meer. Eenmalig ontgrendelen voor dit kenteken."
              : "Below you open the full analysis per section: market value, mileage, MOT history and more. Unlock once for this plate."}
          </p>
        ) : null}
      </div>

      <div className={styles.action}>
        {unlocked ? (
          <span className={styles.unlockedBadge}>
            <Unlock size={16} />
            {nl ? "Volledig rapport ontgrendeld" : "Full report unlocked"}
          </span>
        ) : (
          <>
            <button type="button" className={styles.unlockBtn} onClick={onUnlockClick}>
              <Unlock size={16} />
              {nl ? `Ontgrendel alles voor ${priceLabel}` : `Unlock everything for ${priceLabel}`}
            </button>
            <span className={styles.unlockMicro}>
              {nl
                ? "Eenmalig voor dit kenteken. iDEAL, Apple Pay, Google Pay, PayPal. Direct toegang."
                : "One-time for this plate. iDEAL, Apple Pay, Google Pay, PayPal. Instant access."}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
```

Notes on honesty/contract: the original used a synthetic 28-base datapoint count; this version reports only the real `checked` count from the server signal report. The `·` middot replaces the literal "·" used in the original eyebrow; both are fine and neither is an em/en-dash. `Tag` icon marks the price-affecting line. The component imports only the `SignalTone` TYPE from `@/lib/vehicle/signals` (no runtime import), and reads `data.signals` defensively.

- [ ] Typecheck the new component compiles against the project tsconfig:

```
npm run typecheck
```

Expected: clean (exit 0). If `signals` is not yet a member of `VehicleProfile` (Phase 2 not merged), this step will error on `data?.signals`; that confirms the Phase 2 dependency. Do not patch it here, surface it.

- [ ] Verify no em-dash/en-dash in the component source:

```
node -e "const s=require('fs').readFileSync('components/vehicle/ReportTeaser.tsx','utf8');process.exit(/[–—]/.test(s)?1:0)"
```

Expected: exit code 0.

- [ ] Commit:

```
git add components/vehicle/ReportTeaser.tsx
git commit -m "Add ReportTeaser component sourcing counts from server signals"
```

---

### Task 3.4: Swap `FullReportScreen` to use `ReportTeaser`, delete inline `RecordsSummary`

**Files:** `components/vehicle/FullReportScreen.tsx`

Remove the inline `RecordsSummary` function (ln 173-327) and its now-unused imports, and render `<ReportTeaser .../>` where it was used (ln 431-438). The props are identical (`plate`, `unlocked`, `priceLabel`, `onUnlockClick`), so the call site barely changes.

- [ ] Add the import. In `components/vehicle/FullReportScreen.tsx`, after the existing import of `ReportSectionNav` (ln 42) and before `TrustBadges` (ln 43), add:

```tsx
import { ReportSectionNav } from "./ReportSectionNav";
import { ReportTeaser } from "./ReportTeaser";
import { TrustBadges } from "./TrustBadges";
```

- [ ] Delete the inline `RecordsSummary` component. Remove the entire block from the comment header at ln 172 through the closing brace at ln 327:

Delete this whole range (ln 172-327), which begins:

```tsx
/* ── "Records found" banner ─────────────────────────────────────────── */
function RecordsSummary({
```

and ends (ln 325-327):

```tsx
    </div>
  );
}
```

(That is the entire `RecordsSummary` function plus its leading comment. The next surviving line is the `/* ── Section wrapper with numbered header ─ */` comment at ln 329.)

- [ ] Replace the `RecordsSummary` call site. In `components/vehicle/FullReportScreen.tsx`, the render currently wraps `RecordsSummary` (ln 431-438):

```tsx
        <SectionErrorBoundary label="records-summary">
          <RecordsSummary
            plate={normalized}
            unlocked={unlocked}
            priceLabel={priceLabel}
            onUnlockClick={() => setShowPayment(true)}
          />
        </SectionErrorBoundary>
```

Replace it with:

```tsx
        <SectionErrorBoundary label="report-teaser">
          <ReportTeaser
            plate={normalized}
            unlocked={unlocked}
            priceLabel={priceLabel}
            onUnlockClick={() => setShowPayment(true)}
          />
        </SectionErrorBoundary>
```

- [ ] Remove now-unused imports. After deleting `RecordsSummary`, these lucide icons / hooks may be unused in `FullReportScreen.tsx`: `Radar`, `CheckCircle2`, `Unlock` (icon import block ln 6-16), `useI18n` is still used (FullReportScreen body ln 373) and `useVehicleLookup` is still used (ln 377), `formatDisplayPlate` (ln 20) is now only used by `ReportTeaser`. Run typecheck (next step) and remove whatever it flags as unused. Concretely, edit the icon import block (ln 6-16) to drop `Radar` and `CheckCircle2` if `npm run typecheck` / `npm run build` reports them unused (note: `Unlock` is still used by the `unlockedBadge`? No, that moved into ReportTeaser; FullReportScreen no longer uses `Unlock`, `Radar`, or `CheckCircle2`). Resulting import block:

```tsx
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  ChevronRight,
  Lock,
  Scale
} from "lucide-react";
```

And remove the now-unused `formatDisplayPlate` import (ln 20):

```tsx
import { formatDisplayPlate } from "@/lib/rdw/normalize";
```

(Delete that line. `AlertTriangle` stays only if still used elsewhere in the file; if typecheck flags it, drop it too. Let typecheck be the source of truth for the final import list.)

- [ ] Typecheck:

```
npm run typecheck
```

Expected: clean (exit 0). Iterate on the import list until there are no "declared but never read" / unused errors.

- [ ] Build:

```
npm run build
```

Expected: build succeeds (exit 0).

- [ ] Headless-Chromium visual check (per CLAUDE.md). Mock the vehicle API with a production payload that includes a `signals` block (fetch a real one via Vercel MCP `web_fetch_vercel_url` for the sample plate H223JZ, then add/keep the `signals` field), run `next build` + `next start`, load the report at desktop 1380px and mobile 390px:

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-report-teaser.mjs
```

Verify in the captured output / screenshots:
  - The teaser shows "Wij controleerden N signalen." with the real `checked` count (not a 3-digit synthetic number).
  - When the mocked `summary.priceAffecting > 0`, the blue "N punten raken de eerlijke prijs." line appears; when 0, it is absent.
  - No console `pageerror` (hydration safe: the teaser reads the server JSON, computes no time/random at render).
  - No em-dash/en-dash visible in the rendered teaser text.

- [ ] Commit:

```
git add components/vehicle/FullReportScreen.tsx
git commit -m "Render ReportTeaser in report, remove synthetic RecordsSummary"
```

---

### Task 3.5: De-blur `PremiumLock` styles (honest teaser, no crop)

**Files:** `components/ui/PremiumLock.module.css`

Remove the dishonest blur (`filter: blur(5px); opacity: 0.6` on `.contentBlur`, ln 11-19), the fake `max-height: 300px; overflow: hidden` crop on `.lockContainer` (ln 1-9), and the fading gradient overlay (`.overlay` ln 21-35). Replace with an honest compact lock card: a short factual preview line + a clear lock card + an unlock CTA, with NO blurred real data behind it. The locked section renders the lock card INSTEAD of the children (the component change in Task 3.6 stops rendering children when locked), so we no longer need a positioned overlay.

- [ ] Replace the top of `components/ui/PremiumLock.module.css`. The current `.lockContainer` (ln 1-9), `.contentBlur` (ln 11-19), and `.overlay` (ln 21-35) blocks:

```css
.lockContainer {
  position: relative;
  width: 100%;
  /* Compact teaser: show a blurred preview of the real data instead of a tall
     empty card, so customers see there IS data and do not scroll endlessly. */
  max-height: 300px;
  overflow: hidden;
  border-radius: var(--radius-xl);
}

.contentBlur {
  filter: blur(5px);
  pointer-events: none;
  user-select: none;
  /* Visible but unreadable: the real data shows through as a teaser. */
  opacity: 0.6;
  transition: filter 300ms ease;
  overflow: hidden;
}

.overlay {
  position: absolute;
  inset: 0;
  padding: 20px 20px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  /* Light at the top so the blurred data peeks through, solid at the bottom
     where the unlock call-to-action sits. */
  background: linear-gradient(180deg, rgba(247, 249, 253, 0.1) 0%, rgba(247, 249, 253, 0.72) 52%, rgba(247, 249, 253, 0.97) 100%);
  z-index: 20;
  border-radius: var(--radius-xl);
}
```

Replace ALL THREE blocks above with this honest, blur-free version:

```css
.lockContainer {
  position: relative;
  width: 100%;
  border-radius: var(--radius-xl);
}

/* Honest preview: one short factual line about what this section contains.
   No blurred real data, no fake crop. */
.previewLine {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #5b6b84;
  font-size: 13px;
  line-height: 1.55;
  margin: 0 0 12px;
}

.previewIcon {
  flex-shrink: 0;
  color: #2563eb;
  margin-top: 2px;
}

.lockBody {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f2;
  border-radius: 16px;
  padding: 22px 20px;
  text-align: center;
}
```

- [ ] Simplify `.lockCard` to sit inside the static `.lockBody` (no backdrop blur, no absolute positioning). The current `.lockCard` (ln 39-52):

```css
.lockCard {
  max-width: 480px;
  width: 100%;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid #e2e8f2;
  box-shadow: 0 12px 32px -14px rgba(37, 99, 235, 0.28);
  border-radius: 16px;
  padding: 16px 22px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
```

Replace with:

```css
.lockCard {
  max-width: 480px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
```

- [ ] Verify there is no remaining blur in the file:

```
node -e "const s=require('fs').readFileSync('components/ui/PremiumLock.module.css','utf8');const bad=/filter:\s*blur|backdrop-filter:\s*blur|max-height:\s*300px/.test(s);process.exit(bad?1:0)"
```

Expected: exit code 0 (no `filter: blur`, no `backdrop-filter: blur`, no `max-height: 300px`). If exit 1, a blur reference remains; remove it.

- [ ] Verify no em-dash/en-dash:

```
node -e "const s=require('fs').readFileSync('components/ui/PremiumLock.module.css','utf8');process.exit(/[–—]/.test(s)?1:0)"
```

Expected: exit code 0.

- [ ] Commit:

```
git add components/ui/PremiumLock.module.css
git commit -m "De-blur PremiumLock styles: honest static lock card, no fake crop"
```

---

### Task 3.6: De-blur `PremiumLock.tsx` + converge onto a single page-level modal

**Files:** `components/ui/PremiumLock.tsx`

Two changes: (1) render an honest preview line + lock card INSTEAD of the blurred children (no `.contentBlur` wrapper at all); (2) stop mounting a per-instance `SubscriptionModal` (~13 instances on a full report). Instead the lock CTA calls an optional `onUnlockClick` prop that the page wires to the single page-level modal; when `onUnlockClick` is not provided (standalone screen routes that still use `PremiumLock` on their own), fall back to `grantPaidAccessForPlate` is NOT correct, so keep a minimal local-modal fallback only when no `onUnlockClick` is given. We pass a short factual `previewNl`/`previewEn` line via new optional props (with a sensible generic default), so each section can describe honestly what is behind the lock.

- [ ] Rewrite `components/ui/PremiumLock.tsx` with the complete file:

```tsx
import { useEffect, useState, type ReactNode } from "react";
import styles from "./PremiumLock.module.css";
import { Button } from "./Button";
import { Lock, FileText } from "lucide-react";
import { SubscriptionModal } from "./SubscriptionModal";
import { useI18n } from "@/lib/i18n/context";
import { hasPaidAccessForPlate, ensurePaidAccessChecked, onPlateAccessChanged } from "@/lib/payments/access";
import { isSamplePlate } from "@/lib/sample";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { track } from "@/lib/analytics";
import type { PublicSiteSettings } from "@/lib/site-settings/defaults";

interface PremiumLockProps {
  children: ReactNode;
  isLocked?: boolean;
  featureName: string;
  plate?: string;
  sectionKey?: keyof PublicSiteSettings["lockSections"];
  /** Honest one-line description of what is behind the lock (NL). */
  previewNl?: string;
  /** Honest one-line description of what is behind the lock (EN). */
  previewEn?: string;
  /**
   * When provided, the unlock CTA opens the single page-level modal instead of
   * mounting a per-instance SubscriptionModal. This stops ~13 modal instances
   * on a full report. Standalone screens that have no page-level modal omit it
   * and get a local fallback modal.
   */
  onUnlockClick?: () => void;
}

export function PremiumLock({
  children,
  isLocked = true,
  featureName,
  plate,
  sectionKey,
  previewNl,
  previewEn,
  onUnlockClick
}: PremiumLockProps) {
  const { locale } = useI18n();
  const { settings } = useSiteSettings();
  const [showModal, setShowModal] = useState(false);
  const [isUnlockedForPlate, setIsUnlockedForPlate] = useState(false);

  useEffect(() => {
    if (!plate) return;
    setIsUnlockedForPlate(hasPaidAccessForPlate(plate));
    // Restore paid access after refresh (server is source of truth) and stay
    // in sync when another section on the page unlocks this plate.
    void ensurePaidAccessChecked(plate).then((paid) => {
      if (paid) setIsUnlockedForPlate(true);
    });
    const unsubscribe = onPlateAccessChanged(plate, (paid) => setIsUnlockedForPlate(paid));
    return unsubscribe;
  }, [plate]);

  const lockByAdmin = sectionKey ? settings.lockSections[sectionKey] : isLocked;
  const shouldLock = settings.paymentEnabled && lockByAdmin && isLocked;

  // The public sample plate is always fully open so visitors can see the product.
  if (!shouldLock || isUnlockedForPlate || isSamplePlate(plate)) return <>{children}</>;

  const openUnlock = () => {
    track("lock_clicked", { feature: featureName, section: sectionKey ?? "generic" });
    if (onUnlockClick) {
      onUnlockClick();
      return;
    }
    setShowModal(true);
  };

  const nl = locale === "nl";
  const preview = nl
    ? previewNl ?? `Dit onderdeel toont de volledige ${featureName} uit de officiele RDW-data.`
    : previewEn ?? `This section shows the full ${featureName} from the official RDW data.`;

  return (
    <div className={styles.lockContainer}>
      {/* Honest factual preview line, no blurred data. */}
      <p className={styles.previewLine}>
        <FileText className={styles.previewIcon} size={16} />
        <span>{preview}</span>
      </p>

      <div className={styles.lockBody}>
        <div className={styles.lockCard}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper}>
              <div className={styles.pulse} />
              <Lock className={styles.lockIcon} size={22} />
            </div>
            <h3 className={styles.title}>{nl ? `Ontgrendel ${featureName}` : `Unlock ${featureName}`}</h3>
            <p className={styles.description}>
              {nl
                ? "Eenmalig ontgrendelen voor dit kenteken. Je krijgt direct toegang tot het hele rapport."
                : "Unlock once for this plate. You get instant access to the whole report."}
            </p>
          </div>

          <Button variant="primary" className={styles.unlockButton} onClick={openUnlock}>
            {nl ? "Ontgrendel het volledige rapport" : "Unlock the full report"}
          </Button>
        </div>
      </div>

      {/* Local fallback modal only when no page-level modal is wired in. */}
      {onUnlockClick ? null : (
        <SubscriptionModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          featureName={featureName}
          plate={plate ?? ""}
          onUnlocked={() => setIsUnlockedForPlate(true)}
        />
      )}
    </div>
  );
}
```

Notes: blurred children are gone entirely (no `.contentBlur`). The lock CTA copy drops the "Upgrade naar Premium" buzzword for the honest "Ontgrendel het volledige rapport". When `onUnlockClick` is supplied, NO `SubscriptionModal` is mounted by this instance, which is how 13 modal instances collapse to one. The `description` no longer claims "verified by official industry partners" (that was an EN copy claim referencing partners we do not have); it states the honest one-time-unlock fact.

- [ ] Typecheck:

```
npm run typecheck
```

Expected: clean (exit 0). Any caller passing the old prop set still compiles (`onUnlockClick`, `previewNl`, `previewEn` are all optional).

- [ ] Verify no blur class is referenced anymore in the TSX:

```
node -e "const s=require('fs').readFileSync('components/ui/PremiumLock.tsx','utf8');process.exit(/contentBlur|styles\.overlay/.test(s)?1:0)"
```

Expected: exit code 0 (neither `contentBlur` nor `styles.overlay` referenced).

- [ ] Verify no em-dash/en-dash:

```
node -e "const s=require('fs').readFileSync('components/ui/PremiumLock.tsx','utf8');process.exit(/[–—]/.test(s)?1:0)"
```

Expected: exit code 0.

- [ ] Commit:

```
git add components/ui/PremiumLock.tsx
git commit -m "De-blur PremiumLock and converge unlock onto a single page-level modal"
```

---

### Task 3.7: Wire the section `PremiumLock` instances to the single page-level modal in `FullReportScreen`

**Files:** `components/vehicle/FullReportScreen.tsx`

The report already owns one page-level `SubscriptionModal` (ln 532-538) toggled by `setShowPayment`. Per-section gating in the current report goes through `isPremiumSection` + the screens' own internal `PremiumLock` usage. To make the new `onUnlockClick` convergence effective, pass an unlock handler down to the embedded screens so their `PremiumLock` instances route to the page-level modal. Because the locked contracts keep per-section gating per-section, the cleanest seam without touching every screen is: expose the page-level opener through React context so any `PremiumLock` on the page can call it.

Add a tiny context in `FullReportScreen` and a `usePageUnlock()` consumed by `PremiumLock`. This avoids threading `onUnlockClick` through ~10 screen components.

- [ ] Create the context module `components/vehicle/page-unlock-context.ts` with the complete file:

```ts
"use client";

import { createContext, useContext } from "react";

/**
 * Lets any PremiumLock deep in the report open the SINGLE page-level
 * SubscriptionModal instead of mounting its own. Null outside the report
 * (standalone screens), where PremiumLock falls back to a local modal.
 */
export const PageUnlockContext = createContext<(() => void) | null>(null);

export function usePageUnlock(): (() => void) | null {
  return useContext(PageUnlockContext);
}
```

- [ ] Consume the context in `PremiumLock`. In `components/ui/PremiumLock.tsx`, add the import (after the `track` import):

```tsx
import { track } from "@/lib/analytics";
import { usePageUnlock } from "@/components/vehicle/page-unlock-context";
import type { PublicSiteSettings } from "@/lib/site-settings/defaults";
```

Then, inside the component, read the context and prefer an explicit prop, then context, then local modal. Replace the `openUnlock` function body:

```tsx
  const pageUnlock = usePageUnlock();

  const openUnlock = () => {
    track("lock_clicked", { feature: featureName, section: sectionKey ?? "generic" });
    const opener = onUnlockClick ?? pageUnlock;
    if (opener) {
      opener();
      return;
    }
    setShowModal(true);
  };
```

And update the local-fallback modal condition to also account for the context (only mount the local modal when neither prop nor context is available):

```tsx
      {/* Local fallback modal only when no page-level modal is wired in. */}
      {onUnlockClick || pageUnlock ? null : (
        <SubscriptionModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          featureName={featureName}
          plate={plate ?? ""}
          onUnlocked={() => setIsUnlockedForPlate(true)}
        />
      )}
```

- [ ] Provide the context in `FullReportScreen`. In `components/vehicle/FullReportScreen.tsx`, add the import (next to the `ReportTeaser` import):

```tsx
import { ReportTeaser } from "./ReportTeaser";
import { PageUnlockContext } from "./page-unlock-context";
```

Then wrap the report container with the provider. The current return opens with (ln 416-420):

```tsx
  return (
    <div className={styles.page}>
      <ScanIntro plate={normalized} />

      <div className={styles.container}>
```

Change it to provide the opener:

```tsx
  return (
    <PageUnlockContext.Provider value={() => setShowPayment(true)}>
    <div className={styles.page}>
      <ScanIntro plate={normalized} />

      <div className={styles.container}>
```

And close the provider at the end of the component. The current return ends (ln 538-540):

```tsx
        onUnlocked={() => setShowPayment(false)}
      />
    </div>
  );
}
```

Change to:

```tsx
        onUnlocked={() => setShowPayment(false)}
      />
    </div>
    </PageUnlockContext.Provider>
  );
}
```

- [ ] Typecheck:

```
npm run typecheck
```

Expected: clean (exit 0).

- [ ] Build:

```
npm run build
```

Expected: build succeeds (exit 0).

- [ ] Headless-Chromium verification (per CLAUDE.md). With the report mocked for an UNPAID, non-sample plate (so sections lock), at desktop 1380px and mobile 390px:

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-premiumlock-single-modal.mjs
```

Verify:
  - Locked sections show the honest preview line + lock card, with NO blurred data and NO `max-height` crop (the section is not artificially cut to 300px).
  - Clicking any section's "Ontgrendel het volledige rapport" opens exactly ONE modal (assert `document.querySelectorAll('[class*="overlay"]')` for the modal resolves to a single open instance, not multiple stacked).
  - No `pageerror` in console.

- [ ] Commit:

```
git add components/vehicle/page-unlock-context.ts components/ui/PremiumLock.tsx components/vehicle/FullReportScreen.tsx
git commit -m "Route all section locks to one page-level modal via PageUnlockContext"
```

---

### Task 3.8: `SubscriptionModal` honesty: small price, value stack, reviews slot, stake line, iDEAL/secure badge

**Files:** `components/ui/SubscriptionModal.tsx`, `components/ui/SubscriptionModal.module.css`

The modal already has NO money-back text (the old `guaranteeLine` is defined in CSS at ln 320-325 but is no longer rendered in the TSX). This task: (a) render the price small (it currently renders at `font-size: 24px` via `.planPrice`, ln 203 in CSS) by adding a small price treatment; (b) add an honest value stack listing what is unlocked (koopoordeel, marktwaarde/eerlijke prijs, vergelijkbare autos, onderhandelhulp, diepte-analyse) with two rows flagged as genuinely locked (a Lock icon, no fake blur); (c) add the OPTIONAL reviews slot from `settings.reviews` that renders nothing when empty; (d) add the honest stake line; (e) add an iDEAL/secure badge to the footer; (f) remove the unused `.guaranteeLine` CSS so no money-back styling lingers.

- [ ] Add the value-stack, reviews, stake, small-price, and badge styles, and remove `.guaranteeLine`. In `components/ui/SubscriptionModal.module.css`, DELETE the `.guaranteeLine` block (ln 320-325):

```css
.guaranteeLine {
  margin-top: 10px;
  color: #16a34a;
  font-size: 0.78rem;
  font-weight: 700;
}
```

Then append these new styles at the end of `components/ui/SubscriptionModal.module.css` (after the `.successUpsell` block, ln 426-433):

```css
/* Small inline price treatment so the price is present but not shouted. */
.priceSmall {
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}

.priceSmall span {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  margin-left: 4px;
}

/* Honest value stack: what unlocking actually gives you. */
.valueStack {
  list-style: none;
  padding: 0;
  margin: 4px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.valueRow {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #334155;
  font-weight: 600;
}

.valueRowLocked {
  color: #1d4ed8;
}

.valueIconOk {
  color: #16a34a;
  flex-shrink: 0;
}

.valueIconLocked {
  color: #2563eb;
  flex-shrink: 0;
}

/* Honest stake line. Factual, no guarantee. */
.stakeLine {
  margin: 12px 0 0;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f2;
  border-radius: 12px;
  color: #0f172a;
  font-size: 13px;
  line-height: 1.55;
  font-weight: 600;
}

/* Optional real reviews. Hidden entirely when settings.reviews is empty. */
.reviews {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.reviewCard {
  border: 1px solid #e2e8f2;
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
}

.reviewQuote {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  line-height: 1.55;
}

.reviewAuthor {
  margin: 6px 0 0;
  color: #5b6b84;
  font-size: 12px;
  font-weight: 700;
}
```

- [ ] Add the imports the modal needs. In `components/ui/SubscriptionModal.tsx`, the icon import (ln 5) is:

```tsx
import { X, Check, ShieldCheck, Zap, Sparkles } from "lucide-react";
```

Replace with (adds `Lock` for the locked proof rows, `Landmark` for the iDEAL/secure badge):

```tsx
import { X, Check, ShieldCheck, Zap, Sparkles, Lock, Landmark } from "lucide-react";
```

- [ ] Render the price small. In `components/ui/SubscriptionModal.tsx`, the plan header currently renders (ln 156-163):

```tsx
          <div className={styles.planHeader}>
              <div className={styles.planName}>{locale === "nl" ? "Veilig betalen" : "Secure payment"}</div>
              <div className={styles.planPrice}>
                {settings.payment.currency} {settings.payment.amount}
                <span>/{locale === "nl" ? "zoekopdracht" : "search"}</span>
              </div>
            </div>
```

Replace the `.planPrice` div with the small treatment (uses `.priceSmall`, value pulled from settings, never hardcoded):

```tsx
          <div className={styles.planHeader}>
              <div className={styles.planName}>{locale === "nl" ? "Veilig betalen" : "Secure payment"}</div>
              <div className={styles.priceSmall}>
                {settings.payment.currency} {settings.payment.amount}
                <span>/{locale === "nl" ? "kenteken" : "plate"}</span>
              </div>
            </div>
```

- [ ] Replace the generic feature list with the honest value stack + locked proof rows. The current feature list (ln 164-168):

```tsx
            <ul className={styles.features}>
              <li><Check size={14} className={styles.checkIcon} /> {locale === "nl" ? "Ontgrendelt alle premium tabbladen voor dit kenteken" : "Unlocks all premium tabs for this plate"}</li>
              <li><Check size={14} className={styles.checkIcon} /> {locale === "nl" ? "Maakt rapportdownload beschikbaar voor dit kenteken" : "Enables report download for this plate"}</li>
              <li><Check size={14} className={styles.checkIcon} /> {locale === "nl" ? "Per zoekopdracht betaling" : "Payment per search"}</li>
            </ul>
```

Replace with the honest value stack (3 "ok" rows + 2 genuinely-locked proof rows with a Lock icon, no fake blur):

```tsx
            <ul className={styles.valueStack}>
              <li className={styles.valueRow}>
                <Check size={15} className={styles.valueIconOk} />
                {locale === "nl" ? "Koopoordeel: koop, twijfel of pas op" : "Buy verdict: buy, doubt or beware"}
              </li>
              <li className={styles.valueRow}>
                <Check size={15} className={styles.valueIconOk} />
                {locale === "nl" ? "Vergelijkbare autos en alternatieven" : "Comparable cars and alternatives"}
              </li>
              <li className={styles.valueRow}>
                <Check size={15} className={styles.valueIconOk} />
                {locale === "nl" ? "Diepte-analyse: APK, kilometerstand en risicos" : "Deep analysis: MOT, mileage and risks"}
              </li>
              <li className={`${styles.valueRow} ${styles.valueRowLocked}`}>
                <Lock size={14} className={styles.valueIconLocked} />
                {locale === "nl" ? "Marktwaarde en eerlijke prijs (vergrendeld)" : "Market value and fair price (locked)"}
              </li>
              <li className={`${styles.valueRow} ${styles.valueRowLocked}`}>
                <Lock size={14} className={styles.valueIconLocked} />
                {locale === "nl" ? "Onderhandelhulp met argumenten (vergrendeld)" : "Negotiation help with arguments (locked)"}
              </li>
            </ul>
```

- [ ] Add the honest stake line. In `components/ui/SubscriptionModal.tsx`, immediately AFTER the closing `</ul>` of the value stack (the block you just added) and BEFORE the `<label className={styles.emailLabel}>` (ln 169), insert:

```tsx
            <p className={styles.stakeLine}>
              {locale === "nl"
                ? `Een verkeerde occasion kost zo honderden euros. Dit rapport: ${settings.payment.currency} ${settings.payment.amount}.`
                : `The wrong used car can cost hundreds of euros. This report: ${settings.payment.currency} ${settings.payment.amount}.`}
            </p>
```

- [ ] Add the OPTIONAL reviews slot. In `components/ui/SubscriptionModal.tsx`, just BEFORE the closing `</div>` of `.planCard` (the planCard div opens ln 156 with `<div className={`${styles.planCard} ${styles.planActive}`}>` and closes ln 264 with `</div>` right before `</div>` of `.plans`), insert the reviews block after the demo/owner-test button block (which ends ln 263 with `) : null}`):

```tsx
            {canSkipPaymentForDemo || isOwnerTestEmail ? (
              <button
                type="button"
                className={styles.skipButton}
                onClick={async () => {
                  try {
                    await fetch(`/api/payments/access/${encodeURIComponent(plate)}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: email.trim().toLowerCase() || undefined })
                    });
                  } catch {
                    // Keep the unlock UX non-blocking even if the backend grant fails.
                  }
                  handleUnlocked();
                }}
              >
                {canSkipPaymentForDemo
                  ? locale === "nl" ? "Demo: betaling overslaan" : "Demo: Skip payment"
                  : locale === "nl" ? "Eigenaar-test: gratis ontgrendelen" : "Owner test: unlock for free"}
              </button>
            ) : null}
            {settings.reviews.length > 0 ? (
              <div className={styles.reviews}>
                {settings.reviews.map((review, index) => (
                  <figure key={`${review.author}-${index}`} className={styles.reviewCard}>
                    <blockquote className={styles.reviewQuote}>{review.quote}</blockquote>
                    {review.author ? <figcaption className={styles.reviewAuthor}>{review.author}</figcaption> : null}
                  </figure>
                ))}
              </div>
            ) : null}
```

(The first half of this block is the EXISTING demo/owner-test button left unchanged for location context; the NEW code is the `settings.reviews.length > 0 ? ...` block appended right after it.)

- [ ] Add the iDEAL/secure badge to the footer. The current footer (ln 268-275):

```tsx
        <div className={styles.footer}>
          <div className={styles.trustItem}>
            <ShieldCheck size={16} /> {locale === "nl" ? "Geverifieerde RDW-data" : "Verified RDW Data"}
          </div>
          <div className={styles.trustItem}>
            <Sparkles size={16} /> {locale === "nl" ? "Direct toegang na betaling" : "Instant access after payment"}
          </div>
        </div>
```

Replace with (adds an iDEAL/secure-payment trust item using `Landmark`):

```tsx
        <div className={styles.footer}>
          <div className={styles.trustItem}>
            <ShieldCheck size={16} /> {locale === "nl" ? "Geverifieerde RDW-data" : "Verified RDW Data"}
          </div>
          <div className={styles.trustItem}>
            <Landmark size={16} /> {locale === "nl" ? "iDEAL en beveiligd betalen" : "iDEAL and secure payment"}
          </div>
          <div className={styles.trustItem}>
            <Sparkles size={16} /> {locale === "nl" ? "Direct toegang na betaling" : "Instant access after payment"}
          </div>
        </div>
```

- [ ] Confirm there is NO money-back / guarantee string anywhere in the modal source:

```
node -e "const s=require('fs').readFileSync('components/ui/SubscriptionModal.tsx','utf8').toLowerCase();const bad=/geld terug|geld-terug|money.?back|garantie|guarantee/.test(s);process.exit(bad?1:0)"
```

Expected: exit code 0 (no money-back/guarantee wording).

- [ ] Confirm no em-dash/en-dash in the modal source:

```
node -e "const s=require('fs').readFileSync('components/ui/SubscriptionModal.tsx','utf8');process.exit(/[–—]/.test(s)?1:0)"
```

Expected: exit code 0.

- [ ] Typecheck:

```
npm run typecheck
```

Expected: clean (exit 0). `settings.reviews` resolves because Task 3.1 added it to `PublicSiteSettings`.

- [ ] Build:

```
npm run build
```

Expected: build succeeds (exit 0).

- [ ] Headless-Chromium verification (per CLAUDE.md). Open the report for an unpaid non-sample plate, click an unlock CTA to open the modal, at desktop 1380px and mobile 390px:

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-subscription-modal-honesty.mjs
```

Verify in output/screenshots:
  - Price shows small (`.priceSmall`), with the value from settings (default seeded for the mock; e.g. "EUR 6.95") and the "/kenteken" suffix; never a hardcoded number.
  - The value stack shows 3 check rows + 2 Lock rows (genuinely locked, no blur).
  - The stake line "Een verkeerde occasion kost zo honderden euros. Dit rapport: EUR 6.95." is present.
  - With `settings.reviews = []` (default) the reviews slot renders NOTHING (assert `document.querySelector('[class*="reviews"]')` for the new slot is null).
  - With `settings.reviews = [{quote,author}]` injected into the mocked settings, the review card renders.
  - Footer shows the iDEAL/secure badge.
  - No money-back string in the rendered DOM; no console `pageerror`.

- [ ] Commit:

```
git add components/ui/SubscriptionModal.tsx components/ui/SubscriptionModal.module.css
git commit -m "SubscriptionModal honesty: small price, value stack, optional reviews, stake line, iDEAL badge"
```

---

### Task 3.9: Phase verification gate (full typecheck, build, dash sweep)

**Files:** none (verification only)

- [ ] Full typecheck:

```
npm run typecheck
```

Expected: clean (exit 0).

- [ ] Full unit tests (signals/groups/sanitize from earlier phases + this phase's reviews tests):

```
npm test
```

Expected: all tests pass.

- [ ] Production build:

```
npm run build
```

Expected: build succeeds (exit 0).

- [ ] Repo-wide dash sweep on the files this phase created/changed:

```
node -e "const fs=require('fs');const files=['lib/site-settings/defaults.ts','lib/site-settings/sanitize.ts','components/vehicle/ReportTeaser.tsx','components/vehicle/ReportTeaser.module.css','components/vehicle/FullReportScreen.tsx','components/vehicle/page-unlock-context.ts','components/ui/PremiumLock.tsx','components/ui/PremiumLock.module.css','components/ui/SubscriptionModal.tsx','components/ui/SubscriptionModal.module.css'];let bad=0;for(const f of files){if(/[–—]/.test(fs.readFileSync(f,'utf8'))){console.log('DASH IN',f);bad=1;}}process.exit(bad);"
```

Expected: exit code 0 (no em-dash/en-dash in any touched file).

- [ ] Final combined headless-Chromium smoke (per CLAUDE.md), unpaid non-sample plate, desktop 1380px + mobile 390px, real production payload with `signals`:
  - Teaser shows honest signal counts (no synthetic datapoints).
  - Locked sections: honest preview + lock card, no blur, no fake crop.
  - Exactly one modal opens from any section.
  - Modal: small price from settings, value stack with locked proof rows, stake line, reviews slot hidden when empty, iDEAL/secure badge, no money-back text.
  - Zero console `pageerror` on both viewports.

- [ ] Commit (only if the verification produced any small fixups; otherwise skip):

```
git add -A
git commit -m "Phase 3 verification fixups"
```
