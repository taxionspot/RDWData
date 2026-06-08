# Kentekenrapport — Design Brief (handover to Claude Design)

> **Purpose.** This document gives a designer (or "Claude Design") everything
> needed to propose a refined, consistent, mobile-first design for our product
> **without rebranding it**. The job is to *systematise and polish* what we already
> have, fix concrete inconsistencies, and present our data more clearly — not to
> reinvent the look. Treat the brand tokens in §3 as fixed guardrails.

---

## 1. Product overview

**Kentekenrapport** is a Dutch web app where a buyer of a used car types a Dutch
licence plate ("kenteken") and gets a vehicle history & risk report built on
official **RDW open data**, enriched with deterministic models and a
**multi-agent AI analysis**. It is a paid product: a free teaser, then a one-time
payment unlocks the full report per plate.

- **Stack:** Next.js (App Router) + React + TypeScript, **Tailwind CSS** + **CSS
  Modules** (mixed today — see §7). Charts via **Recharts**. Icons via
  **lucide-react**.
- **Audience:** ordinary consumers about to buy a second-hand car. Mostly on
  **mobile**, often *standing next to the car at a dealer*. Not car experts.
- **Tone:** trustworthy, calm, concrete, human. Think "independent inspection
  report", not "flashy dashboard".
- **Languages:** **Dutch-first**, English secondary (every label exists in NL/EN).
- **The decisive moment:** "should I buy this car, and for how much?" Every screen
  should move the user toward that decision.

### Design goals (in priority order)
1. **Overzichtelijk / clear** — a non-expert grasps the verdict in seconds, then
   can drill down. Strong hierarchy, scannable, no wall-of-data.
2. **Mobile-friendly** — designed mobile-first; thumb-reachable actions; the
   11-tab report must work on a small screen.
3. **User-friendly** — obvious next action on every screen, friendly empty/locked
   states, plain language, consistent components.
4. **Dynamic** — tasteful motion and micro-interactions (we already have the
   easings/animations — reuse them, don't overdo it).
5. **Trustworthy** — source labels (RDW vs AI), confidence, "last updated",
   honest disclaimers, consistent severity colours.

### Hard constraint
**Evolve our identity, do not replace it.** Keep the blue brand palette, the
yellow NL plate motif, Inter/Outfit type, rounded cards and soft shadows. No new
logo, no new primary colour, no heavy new UI framework. "Beetje volgen, niet te
drastisch."

---

## 2. What "good" looks like (research / references)

Patterns proven for data-heavy consumer report products (Carfax, carVertical,
AutoUncle, Finn, banking apps). Apply the spirit, not a copy:

- **Verdict-first, then evidence.** Lead with a single score + a plain verdict
  ("Kopen / Overwegen / Voorzichtig / Afraden"), then the supporting sections.
- **Progressive disclosure.** Summary cards that expand into detail; don't show
  every RDW field at once. Each section opens with a one-line TL;DR.
- **Traffic-light semantics, used sparingly.** Green/amber/red only for real
  status; never decorative. Keep most surfaces neutral so red actually pops.
- **Cards as the unit of meaning.** One idea per card: a title, a status, a
  human summary, key facts, optional findings. Uniform card = calm page.
- **Trust scaffolding.** "Bron: RDW", "AI-analyse", confidence pills, timestamps,
  short methodology/disclaimer lines.
- **Mobile report navigation.** Replace a long scroll-strip of tabs with a
  clearer pattern (sticky section nav, grouped accordion, or a "jump to" menu).
- **Sticky decision bar on mobile** (we already have one for unlock) — keep the
  price + primary CTA reachable.

---

## 3. Brand & design tokens — KEEP THESE (the guardrails)

These come straight from `app/globals.css` and `tailwind.config.js`. The designer
should design *with* these and only propose additions (e.g. a documented spacing
scale), never replace the core palette.

### Colour — brand (primary), blue
`brand` scale: 50 `#eff4ff` · 100 `#dbe8ff` · 200 `#bfd5ff` · 300 `#93b8ff` ·
400 `#608eff` · 500 `#3b67ff` · **600 `#1a44f5` (primary actions)** · 700
`#1330e1` · 800 `#1628b5` · 900 `#17278e` · 950 `#111856`.
Legacy `--primary: #2563EB` is also in use — **pick one primary blue and apply it
everywhere** (recommend standardising on `brand-600`).

### Colour — accents & semantic
- `accent` (emerald/green): 500 `#10b981`, 600 `#059669` — success/positive.
- `sky`: 400 `#38bdf8`, 500 `#0ea5e9`, 600 `#0284c7` — info/secondary highlight.
- `plate.yellow #fbbf24` / `plate.yellow-dark #f59e0b` — the NL licence-plate motif
  (keep; it's part of our identity).
- **Semantic (already used across the report):**
  - success `#16a34a`, warning `#d97706`/`#f59e0b`, danger/destructive `#dc2626`.
  - **Severity scale** (findings): high `#dc2626`, medium `#d97706`, low `#65a30d`,
    info `#2563eb`.
  - **Verdict colours:** BUY `#16a34a`, CONSIDER `#0ea5e9`, CAUTION `#d97706`,
    AVOID `#dc2626`.

### Neutrals
`--background #F5F7FB` · `--card #FFFFFF` · `--foreground #0F172A` · `--border
#D9E1EC` · `--muted #E9EEF5` · `--muted-foreground #64748B`. (Tailwind `slate`
scale is used for the rest.)

### Typography
- Body: **Inter** (`--font-inter`), display/headings: **Outfit** (`--font-outfit`).
  `font-feature-settings: "cv11","ss01"`.
- Observed sizes: 12–13px meta, 14–16px body, 18–21px section titles, 28–44px
  hero/score. Weights 500/600/700/800/900. **Please define one type scale** (e.g.
  xs 12 / sm 13 / base 14 / md 16 / lg 18 / xl 21 / 2xl 28 / 3xl 36) and stick to it.

### Radius
`--radius-sm 4 · md 8 · lg 10 · xl 14`, plus Tailwind `2xl` (16) and `4xl` (32px).
Cards today use 14–24px. **Standardise:** controls/inputs `xl` (14), cards `2xl`
(16), hero/cover 20px. One scale, applied consistently.

### Shadows (from config — reuse, don't invent new ones)
`xs, sm, md, lg, xl, card (0 0 0 1px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.07)),
card-hover, brand, brand-sm`. Default card = `shadow-card`; hover = `card-hover`.

### Motion (reuse these)
- Easings: `--ease-spring cubic-bezier(.34,1.56,.64,1)`,
  `--ease-out-expo cubic-bezier(.16,1,.3,1)`, `--ease-in-out cubic-bezier(.4,0,.2,1)`.
- Animations: `fade-in-up`, `fade-in`, `scale-in`, `shimmer` (skeletons),
  `float`, `spin`. Utilities: `.hover-lift`, `.card-glow`, `.reveal`, stagger
  `.delay-*`.
- **Rule:** entrance fades/lifts on cards, hover-lift on interactive cards,
  shimmer skeletons while loading. Keep it subtle and fast (200–600ms).

### Gradients & texture (identity flourishes — keep light)
`hero-mesh`, `brand-grad (#6366f1→#4f46e5)`, `cta-grad (#4f46e5→#7c3aed→#0ea5e9)`,
`.text-gradient`, `.noise-overlay`. The AI report cover uses a dark slate gradient
(`#0f172a→#1e293b`) — that's our "premium analysis" surface; keep it for the
analyst banner.

### Spacing
No formal scale today (values 12/16/18/20/24/28 are scattered). **Deliverable:**
define a 4px-based scale (4/8/12/16/20/24/32/40) and map all gaps/padding to it.

---

## 4. Pages we have (full inventory)

### A. Marketing / public
| Route | What it is |
|---|---|
| `/` (`app/page.tsx`) | Landing: hero + plate search (compact yellow plate field), sample-report CTA (PDF + online), trust strip, feature grid, how-it-works, pricing teaser, footer. |
| `/pricing` | Pricing page. |
| `/contact` | Contact form. |
| `/p/[slug]`, `/privacy-policy`, `/terms-and-conditions` | CMS/legal content pages. |

### B. The report (the heart of the product) — `/search/[plate]/…`
All share the top **VehicleNavBar** (11 scrollable tabs) and the **PremiumLock**
paywall pattern. Tabs:

| Tab (route) | Delivers | Current layout |
|---|---|---|
| **Overzicht** (`/`) | Hero car image (3 angles), plate badge, spec chips, quick metrics, **score gauge**, insight strip, **AI report** (analyst cover + 4 sections). | 3-col hero grid + insight strip + AI report |
| **Technische specs** (`/technical-specs`) | Engine, consumption, CO₂, emission norm, dimensions, weight/towing, BPM, APK, road tax. | 4 accordion sections |
| **Risico-overzicht** (`/risk-overview`) | Trust snapshot, **AI analyst verdict banner**, full deterministic findings list (severity), 4 risk cards. | glass hero + summary + findings + card grid |
| **APK-tijdlijn** (`/inspection-timeline`) | Inspection events (pass/advisory/fail), defects per event, recurring flags. | filter pills + vertical timeline |
| **Schade** (`/damage-history`) | **AI damage & MOT-forecast section** + unique defects grouped by code, counts, last date. | hero + agent section + defect cards |
| **Eigendom** (`/ownership-history`) | Registration dates (world/NL), owner count, import, transfer/WOK, recalls. | metadata grid + timeline |
| **Kilometerhistorie** (`/mileage-history`) | NAP verdict, estimated mileage + range, usage profile, user-input km, model curve, APK readings. | hero + custom SVG chart + events |
| **Markt** (`/market-analysis`) | **AI value & cost section** + estimated value, range, confidence, depreciation chart, price-check calculator, estimates grid. | hero value + Recharts area + calc panel |
| **Vergelijking** (`/vehicle-comparison`) | Side-by-side of 2 plates (25+ rows) + AI comparison verdict. | controls + dual hero + metric table |
| **Onderhandelcoach** (`/negotiation-copilot`) | Offer range, walk-away, repair reserve + AI script + talking points. | KPI cards + Recharts bar + script |
| **APK Intelligence** (`/apk-failure-intelligence`) | Pass/fail probability, recurring defect categories. | KPI cards + horizontal bar + list |
| **Watch mode** (`/post-purchase-watch`) | Follow a plate; recall/APK/risk status + alert timeline. | status grid + alert timeline (thin today) |

### C. Account & admin
| Route | What it is |
|---|---|
| `/account` | User dashboard: saved vehicles, downloaded reports. |
| `/admin`, `/admin/login`, `/admin/signup`, `/admin/legal` | Internal CMS/settings (dark theme; lower priority for redesign). |

---

## 5. The report data model (so components map to real data)

The new **multi-agent report** (the centrepiece) has a fixed shape the design must
present. Components should be built around this.

```
report.analyst = {
  score: 0–100,
  verdict: "BUY" | "CONSIDER" | "CAUTION" | "AVOID",
  riskLevel: "LOW" | "MEDIUM" | "HIGH",
  headline: string,        // 1 sentence
  summary: string,         // ~100–180 words, plain language
  positives: string[],     // strengths
  risks: string[],         // watch-outs
  recommendation: string,  // explicit advice
}

report.sections[] = {        // 4 specialist agents
  id: "odometer" | "defects" | "compliance" | "value",
  title: string,
  status: string,            // short label, e.g. "Plausibel", "3 aandachtspunten"
  tone: "success" | "warning" | "danger" | "neutral",
  summary: string,           // 2–4 sentences
  facts: { label, value }[], // deterministic key numbers (never AI-invented)
  findings: { label, detail, severity }[],  // severity: high|medium|low|info
}
```

Existing components that render this (good starting points, see
`components/vehicle/AgentReport.tsx`):
- **`AnalystCover`** — dark gradient banner: eyebrow, verdict chip, headline,
  summary, strengths/watch-outs columns, recommendation box.
- **`AgentSection`** — white card: icon + title + status pill (tone colour),
  summary, 2×2 facts grid, severity-dotted findings list.
- **Score gauge** — conic-gradient ring (the single page score; reflects the
  analyst score/verdict).
- **`PlateBadge`** — authentic NL plate (blue EU strip + yellow body); sizes
  sm/md/lg/xl.

---

## 6. Existing component primitives (consolidate around these)

We already have a partial library — the problem is it isn't used consistently.
**Adopt and complete it; don't create parallel one-offs.**

`components/ui/`: `Button`, `Card`, `Panel`, `GlassPanel`, `Badge`, `Spinner`,
`ProgressBar`, `FeatureCard`, `GaugeChart`, `PlateBadge`, `PremiumLock`,
`SubscriptionModal`, `UserAuthModal`.
`components/vehicle/`: `VehicleNavBar`, `AgentReport` (+ `AnalystCover`,
`AgentSection`), `VehicleCard`, `InspectionTable`, `RecallList`, `MapPanel`.
`components/layout/`: `SiteHeader`, `CookieConsent`.

---

## 7. Concrete problems to fix (from a code/UX audit)

The design system must resolve these — they're the main reason the product looks
unfinished:

1. **Inline styles vs CSS Modules vs Tailwind, mixed per file** (e.g.
   `RiskOverviewScreen`, `VehicleResultScreen` have large inline `style={}`
   blocks). → Move everything to tokens/components; one styling approach per layer.
2. **Duplicate helpers** — `formatCurrency`/`formatDate`/`formatNumber`/`titleCase`
   re-implemented in 5+ screens. → One `lib/format.ts`.
3. **Inconsistent cards/panels** — `.card`, `.glass-card`, `.surface`,
   `.heroPanel`, `.panel`, `.spec-card`, plus inline cards. → 3–4 canonical
   surfaces with variants.
4. **Buttons & inputs differ per screen** (`.actionPrimary`, `.unlockButton`,
   `.pillBtn`, `.search-btn`, ad-hoc inputs). → One `Button`/`Input` with variants.
5. **Spacing/radius/icon-size drift** — many one-off values. → enforce the scales
   in §3 (icon sizes too: pick e.g. 14/16/18/20/24).
6. **Two blues** (`#2563EB` vs `brand-600 #1a44f5`). → one primary.
7. **Mixed NL/EN inline ternaries everywhere** — verbose, error-prone. → keep using
   the i18n locale, but tidy long ternary chains; design must work in both lengths.
8. **Empty/loading/error states are generic and look "broken"** ("Geen data", "-",
   blank cards). → designed `EmptyState`, `LoadingState` (shimmer skeletons),
   `ErrorState` with clear "why".
9. **Inconsistent "data unavailable" wording** ("Onbekend" / "-" / "Niet
   beschikbaar"). → one pattern + icon.
10. **Mobile tab nav is a clunky scroll-strip with arrows** for 11 tabs. → propose
    a better mobile navigation pattern.
11. **Thin premium features** (Watch mode, comparison empty state) feel incomplete.
12. **Locked tabs show only a blur** — no preview of value before paywall. → design
    a teaser/preview-then-unlock pattern.

---

## 8. What we want designed (deliverables)

Please produce, **mobile-first (design at 375px, then 768px, then 1280px)** and
on-brand:

### 8a. Foundations
- Confirmed **token sheet** (colours, type scale, spacing scale, radius, shadow,
  motion) — reconciling the duplicates above into one source of truth.

### 8b. Core component specs (states: default / hover / focus / active / disabled / loading / empty)
- **Button** (primary, secondary, ghost, danger; sizes sm/md/lg; icon).
- **Card / Surface** (base, elevated, glass, "premium dark" analyst surface).
- **MetricCard / Fact** (label + value, optional trend/icon).
- **Badge / StatusPill** (success/warning/danger/neutral/info + severity).
- **Score gauge** (ring + value + verdict chip).
- **Section header** (eyebrow + title + subtitle + optional action).
- **Tabs / report navigation** (desktop strip + the mobile pattern).
- **Finding row** (severity dot + label + detail).
- **Input / select / search** (incl. the compact yellow plate field).
- **Chart wrapper** (consistent Recharts styling: axes, grid, tooltip, colours).
- **Modal** (payment, auth) and **PremiumLock / paywall teaser**.
- **EmptyState / LoadingState (skeletons) / ErrorState**.
- **Timeline** (used by inspection, ownership, mileage, alerts).
- **Comparison table** (zebra, sticky header, mobile = stacked).

### 8c. Page/section templates
- **Report shell**: header + plate + score + nav, with the mobile nav solution.
- **Report section template**: the reusable "analysis section" (TL;DR → facts →
  detail → CTA) used across all tabs.
- **Overzicht (overview)** hero + score + AI report layout.
- **Landing** (refresh within identity; keep the plate search + sample CTA).
- **Account** dashboard.
- **Paywall/teaser** state for locked tabs.

### 8d. For each, deliver
desktop + mobile layout, the key states, redlines (spacing/sizes referencing the
token scale), and notes on motion. Annotated mockups or a clickable prototype both
fine.

---

## 9. Mobile-first requirements (must-haves)
- Design at **375px first**. Single-column by default; 2-col only ≥768px; 3-col
  hero only ≥1024px. No fixed-pixel multi-column grids that break on tablets
  (current overview hero uses `360px / 1fr / 320px` — must become responsive).
- **Touch targets ≥ 44px**; primary action thumb-reachable; sticky unlock/price bar.
- **Report navigation on mobile** is the #1 problem to solve — propose your pattern
  (sticky segmented control, "sections" sheet, or accordion) instead of the
  arrow scroll-strip.
- Charts must degrade gracefully (smaller, simplified, still legible at 375px).
- Tables → stacked cards on mobile.

## 10. Dynamic & motion
Use our existing motion vocabulary (§3): entrance `fade-in-up` with `.delay-*`
stagger for card grids, `hover-lift`/`card-glow` on interactive cards, `shimmer`
skeletons on load, `scale-in` for modals, the score ring animating to its value.
Subtle, fast, purposeful — never blocking the content.

## 11. Accessibility & quality bar
- **WCAG AA** contrast (watch amber/yellow on white — pair with dark text/borders).
- Visible focus rings (we have `0 0 0 3px rgba(99,102,241,.10)` — formalise it).
- Semantic headings, labelled controls, `aria` on icon-only buttons, reduced-motion
  fallback.
- Colour is never the only signal (pair severity colour with icon/label).

## 12. Trust & credibility patterns
Design reusable bits for: **source tags** ("Bron: RDW" vs "AI-analyse"),
**confidence pill** (Laag/Middel/Hoog), **"laatst bijgewerkt"** timestamp,
**disclaimer** line, and the **severity/verdict legend**. These appear throughout
the report and must look consistent.

---

## 13. Out of scope / do NOT do
- ❌ No rebrand: keep the blue palette, yellow plate motif, Inter/Outfit, rounded
  soft-shadow cards, our gradients.
- ❌ No new heavy UI library / design framework; we stay on Tailwind + CSS Modules
  + Recharts + lucide.
- ❌ Don't redesign the **admin** area (internal, dark, low priority) beyond basic
  consistency.
- ❌ Don't change product copy/flows or the payment/RDW logic — this is visual &
  interaction design only.
- ❌ Don't introduce a dark mode for the public app right now (the analyst banner
  is the only intentional dark surface).

## 14. Definition of done
A design is "done" when: a non-expert sees a clear verdict + score on opening a
report; every report tab uses the same section template and one card/button/spacing
system; it looks intentional on a 375px phone; locked content teases its value
before the paywall; and it still unmistakably looks like *our* product.

---

### Appendix — quick file map for reference
- Tokens: `app/globals.css`, `tailwind.config.js`
- Report shell & nav: `components/vehicle/VehicleNavBar.tsx`,
  `components/vehicle/VehicleResultScreen.tsx`
- AI report components: `components/vehicle/AgentReport.tsx` (`AnalystCover`,
  `AgentSection`) + `components/vehicle/AgentReport.module.css`
- Paywall: `components/ui/PremiumLock.tsx`, `components/ui/SubscriptionModal.tsx`
- Plate motif & search: `components/ui/PlateBadge.tsx`, `app/page.tsx` (`.plate-field`)
- Existing primitives: `components/ui/{Button,Card,Panel,GlassPanel,Badge,GaugeChart,Spinner,ProgressBar}.tsx`
