## Phase 5 — PDF mirror (judgment page 1 + 6-group order)

**Goal:** Make the downloadable / e-mailed PDF the fully-expanded paper twin of the redesigned web report. Page 1 opens with a judgment block computed by the SAME server-side `computeVehicleSignals` function that the web `JudgmentBlock` uses (verdict heading + signal lines as ASCII status WORDS in dark-text-on-light filled accent rects so green/amber/red survive black/white printing, plus the alerts list). The body sections are re-grouped into the exact G1 to G6 order from `lib/vehicle/groups.ts` (`GROUPS`). The hardcoded `layout.y -= 172` hero gap is replaced by flow-based spacing (every `section()` and content call already advances `layout.y`; the hero now reserves a measured height and `buildReportSections` continues from there). A plain anchored Table of Contents (section titles + page numbers, recorded during a real two-pass render) is added at the top mirroring the jump-nav. The PDF access gate stays FIRST (402 before any AI / Claude call) and the sample-inline behaviour is unchanged.

This phase DEPENDS ON earlier phases having created `lib/vehicle/signals.ts` (exports `computeVehicleSignals`, `VehicleSignalReport`, `Signal`, `Alert`, `Verdict`, `SignalSummary`, `SignalTone`, `SignalKey`) and `lib/vehicle/groups.ts` (exports `GROUPS`, `GroupDef`, `GroupId`, `ReportSectionId`). All code below imports from those locked modules; it does not redefine them.

**Files touched:**
- `lib/api/pdf-report.ts` (MODIFY: add `toneToPdfWord`, `pdfGroupOrder`, `pdfSectionTitle`, `accentForTone` pure helpers + `drawJudgmentBlock` + a TOC + flow-based hero spacing; re-group `buildReportSections`; thread `signals` through `ReportArgs`)
- `app/api/vehicle/[plate]/route.ts` (MODIFY: compute `signals` via `computeVehicleSignals` and pass into `generateVehicleReportPdf` in both the download GET branch and the POST e-mail branch; gate stays first)
- `scripts/preview-pdf.ts` (MODIFY: pass a `signals` value so the local preview renders page 1; compute it from the mock profile)
- `tests/pdf-report.test.ts` (NEW: TDD the pure helpers `toneToPdfWord` and `pdfGroupOrder` / `pdfSectionTitle`)
- `tsconfig.test.json` (MODIFY: add `lib/api/pdf-report.ts`, `lib/vehicle/signals.ts`, `lib/vehicle/groups.ts` to the `include` allowlist so the new test compiles)

CONTRACT-NOTE up front: `ReportArgs` (pdf-report.ts ln 26-33) currently has no `signals` field. The locked architecture says signals are computed server-side and reused by the PDF, so this phase ADDS `signals?: VehicleSignalReport | null` to `ReportArgs` (optional, so the e-mail/download callers and the preview script can supply it, and an absent value degrades to "no page-1 judgment block" rather than crashing). This is additive and does not rename any existing type/function/prop.

> EXECUTION CORRECTION (test-build hygiene): Do NOT add `lib/api/pdf-report.ts` to `tsconfig.test.json` (it imports pdf-lib and server modules, which bloats and can break the unit-test compile). Instead put the PURE helpers (`toneToPdfWord`, `accentForTone`, `inkForTone`, `pdfGroupOrder`, `pdfSectionTitle`) in a NEW standalone module `lib/vehicle/pdf-presentation.ts` that imports ONLY `SignalTone` from `lib/vehicle/signals` and `GROUPS`/`GroupId` from `lib/vehicle/groups`. Then `lib/api/pdf-report.ts` imports those helpers from `lib/vehicle/pdf-presentation`. In Task 5.1: add ONLY `lib/vehicle/pdf-presentation.ts` to the `include` allowlist (keep all existing Phase 0 entries; `signals.ts`/`groups.ts` are already there) and import the helpers in `tests/pdf-report.test.ts` from `../lib/vehicle/pdf-presentation`. Everywhere later tasks call `toneToPdfWord(...)` inside `pdf-report.ts`, that resolves through the imported helper.

---

### Task 5.1: Pure PDF helpers — tone-to-word, accent colour, group order, section titles (TDD)

These are the only cleanly-pure pieces of the PDF re-grouping: the tone -> ASCII word map (so colour never carries meaning alone, surviving grayscale print) and the GROUPS-driven section order + Dutch/English section titles. Extracting them lets us unit-test that the PDF order matches `GROUPS` and that judgment words map correctly from tones.

**Files:** `tsconfig.test.json`, `lib/api/pdf-report.ts`, `tests/pdf-report.test.ts`

- [ ] Add the new lib files to the test compile allowlist. Edit `tsconfig.test.json` `include` array (currently ln 19-26) so it reads exactly:

```json
  "include": [
    "tests/**/*.ts",
    "lib/api/api-error.ts",
    "lib/api/plate.ts",
    "lib/api/pdf-report.ts",
    "lib/vehicle/signals.ts",
    "lib/vehicle/groups.ts",
    "lib/rdw/normalize.ts",
    "lib/rdw/mapper.ts",
    "lib/rdw/types.ts"
  ],
```

- [ ] Write the failing test. Create `tests/pdf-report.test.ts` with the project test idiom (see `tests/mapper.test.ts` ln 1-4):

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { toneToPdfWord, pdfGroupOrder, pdfSectionTitle } from "../lib/api/pdf-report";
import { GROUPS } from "../lib/vehicle/groups";

test("toneToPdfWord maps tones to ASCII status words (no glyphs, survives grayscale)", () => {
  assert.equal(toneToPdfWord("ok"), "GOED");
  assert.equal(toneToPdfWord("warn"), "LET OP");
  assert.equal(toneToPdfWord("danger"), "SLECHT");
});

test("pdfGroupOrder lists every GROUPS section id in G1..G6 order", () => {
  const expected = GROUPS.flatMap((g) => g.sectionIds);
  assert.deepEqual(pdfGroupOrder(), expected);
});

test("pdfGroupOrder starts with the verdict group and never contains the dropped risico section", () => {
  const order = pdfGroupOrder();
  assert.equal(order[0], "overzicht");
  assert.equal(order[1], "ai-analyse");
  assert.equal(order.includes("risico" as never), false);
});

test("pdfSectionTitle returns honest Dutch and English titles for each section id", () => {
  assert.equal(pdfSectionTitle("overzicht", "nl"), "Voertuigoverzicht");
  assert.equal(pdfSectionTitle("overzicht", "en"), "Vehicle overview");
  assert.equal(pdfSectionTitle("markt", "nl"), "Marktwaarde en eerlijke prijs");
  assert.equal(pdfSectionTitle("kilometerstand", "en"), "Mileage and NAP");
  assert.equal(pdfSectionTitle("schade", "nl"), "Risicos en schade");
});
```

- [ ] Run the test, expect FAIL (the symbols do not exist yet):

```
npm test
```

Expected: `tsc -p tsconfig.test.json` fails with `error TS2305: Module '"../lib/api/pdf-report"' has no exported member 'toneToPdfWord'` (and `pdfGroupOrder`, `pdfSectionTitle`). The test cannot run because the build step fails. That is the expected red.

- [ ] Implement the helpers. In `lib/api/pdf-report.ts`, add imports at the top of the file (after the existing import block ending ln 4) and the pure helpers just BEFORE `function verdictColor(` (ln 81). Insert this import line right after ln 4 (`import { computeNegotiationPricing } from "@/lib/api/negotiation-pricing";`):

```ts
import type { VehicleSignalReport, SignalTone } from "@/lib/vehicle/signals";
import { GROUPS, type ReportSectionId } from "@/lib/vehicle/groups";
```

Then insert these exported pure helpers immediately before the existing `function verdictColor` (ln 81):

```ts
/**
 * Tone -> ASCII status word. The PDF must survive black-and-white printing, so
 * colour never carries meaning alone: every coloured signal line also shows one
 * of these words. No Unicode glyphs (the embedded Helvetica cannot render them).
 */
export function toneToPdfWord(tone: SignalTone): string {
  if (tone === "ok") return "GOED";
  if (tone === "warn") return "LET OP";
  return "SLECHT";
}

/**
 * Print-safe accent fill per tone. These are LIGHT fills meant to sit behind
 * DARK text (never white-on-colour), so the word stays legible on a grayscale
 * printer while the hue still reads as green / amber / red in colour.
 */
export function accentForTone(tone: SignalTone) {
  if (tone === "ok") return rgb(0.85, 0.94, 0.87); // light green
  if (tone === "warn") return rgb(0.99, 0.93, 0.8); // light amber
  return rgb(0.99, 0.86, 0.86); // light red
}

/** Dark ink per tone for the status word drawn on top of accentForTone. */
export function inkForTone(tone: SignalTone) {
  if (tone === "ok") return rgb(0.06, 0.42, 0.22);
  if (tone === "warn") return rgb(0.6, 0.4, 0.04);
  return rgb(0.6, 0.1, 0.14);
}

/**
 * The PDF section order, driven from the SAME GROUPS definition as the web
 * report so the paper version is the fully-expanded twin of the on-screen
 * groups (G1..G6). The dropped "risico" RiskOverview section is absent because
 * it is not in any group.
 */
export function pdfGroupOrder(): ReportSectionId[] {
  return GROUPS.flatMap((g) => g.sectionIds);
}

/** Honest section heading per section id, in the report locale. */
export function pdfSectionTitle(id: ReportSectionId, locale: "nl" | "en"): string {
  const nl: Record<ReportSectionId, string> = {
    overzicht: "Voertuigoverzicht",
    "ai-analyse": "Analyse",
    markt: "Marktwaarde en eerlijke prijs",
    "te-koop": "Vergelijkbaar aanbod",
    kilometerstand: "Kilometerstand en NAP",
    apk: "APK-historie",
    risico: "Risico-overzicht",
    schade: "Risicos en schade",
    eigendom: "Eigendom en status",
    "apk-intelligence": "APK-inzichten",
    specs: "Voertuiggegevens",
    acties: "Vervolgstappen"
  };
  const en: Record<ReportSectionId, string> = {
    overzicht: "Vehicle overview",
    "ai-analyse": "Analysis",
    markt: "Market value and fair price",
    "te-koop": "Comparable listings",
    kilometerstand: "Mileage and NAP",
    apk: "MOT history",
    risico: "Risk overview",
    schade: "Risks and damage",
    eigendom: "Ownership and status",
    "apk-intelligence": "MOT insights",
    specs: "Vehicle data",
    acties: "Next steps"
  };
  return (locale === "nl" ? nl : en)[id];
}
```

- [ ] Run the test, expect PASS:

```
npm test
```

Expected: the `tsc` step succeeds and `node --test` prints all `tests/pdf-report.test.ts` cases as `pass` (4 new tests), with the existing mapper / normalize / plate-parsing / site-settings tests still passing. Look for `# fail 0` in the summary.

- [ ] Commit:

```
git add tsconfig.test.json lib/api/pdf-report.ts tests/pdf-report.test.ts
git commit -m "$(cat <<'EOF'
PDF: add pure tone-word + GROUPS-order helpers (TDD)

toneToPdfWord (GOED/LET OP/SLECHT), accentForTone/inkForTone (dark-on-light
so colour survives grayscale print), pdfGroupOrder driven from GROUPS, and
pdfSectionTitle. Pure + unit-tested in tests/pdf-report.test.ts; new lib
files added to tsconfig.test.json include allowlist.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.2: Thread `signals` through `ReportArgs` and compute it server-side at the call sites

The judgment page 1 must use the SAME `computeVehicleSignals` output as the web. Signals are computed on the RAW pre-localization `VehicleProfile`, but the PDF builder works from the already-localized `data` map. To keep one source of truth without recomputing inside the PDF, the route computes the report and passes it in via `ReportArgs.signals`. This task adds the optional field and wires both PDF callers in the route plus the preview script.

**Files:** `lib/api/pdf-report.ts`, `app/api/vehicle/[plate]/route.ts`, `scripts/preview-pdf.ts`

- [ ] Add the optional `signals` field to `ReportArgs`. In `lib/api/pdf-report.ts`, change the `ReportArgs` type (currently ln 26-33) to:

```ts
type ReportArgs = {
  plate: string;
  locale: "nl" | "en";
  generatedAt: Date;
  data: Record<string, unknown>;
  aiInsights?: AiInsights | null;
  aiValuation?: AiValuation | null;
  signals?: VehicleSignalReport | null;
};
```

(`VehicleSignalReport` is already imported in Task 5.1.) This is additive; no existing caller breaks because the field is optional.

- [ ] Wire the DOWNLOAD branch in the route. In `app/api/vehicle/[plate]/route.ts`, add the signals import near the other lib imports (after ln 15, `import { redactPremiumValue } from "@/lib/api/premium-value";`):

```ts
import { computeVehicleSignals } from "@/lib/vehicle/signals";
```

Then in the `if (downloadReport)` block (ln 256-282), the gate at ln 258-261 stays exactly as-is (FIRST). After `const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(...)` (ln 262) compute the signals from the same RAW profile and pass them into the PDF. Replace ln 262-270:

```ts
      const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(plate, locale, userMileage);
      // Same server-side signal report the web JudgmentBlock uses, computed on
      // the RAW profile so the PDF page 1 mirrors the site exactly. hasAccess is
      // true here (the 402 gate above already passed).
      const profileForSignals = await getVehicleProfile(plate);
      const signals = computeVehicleSignals({ profile: profileForSignals, nowMs: Date.now(), hasAccess: true });
      const pdf = await generateVehicleReportPdf({
        plate,
        locale,
        generatedAt: new Date(),
        data: localized,
        aiInsights,
        aiValuation,
        signals
      });
```

(`getVehicleProfile` is already imported ln 2 and is 24h-cached, so the extra call is a cache hit, not a second RDW fetch.)

- [ ] Wire the POST e-mail branch. In the same file, the e-mail POST already gates first (ln 325-328 `hasPaidReportAccess` -> 402). After `const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(...)` (ln 330) and before the `generateVehicleReportPdf` call (ln 343-350), compute signals and pass them in. Replace ln 343-350:

```ts
    const profileForSignals = await getVehicleProfile(plate);
    const signals = computeVehicleSignals({ profile: profileForSignals, nowMs: Date.now(), hasAccess: true });
    const pdf = await generateVehicleReportPdf({
      plate,
      locale,
      generatedAt: new Date(),
      data: localized,
      aiInsights,
      aiValuation,
      signals
    });
```

- [ ] Wire the preview script so local design review renders page 1. In `scripts/preview-pdf.ts`, add an import after ln 4 (`import { generateVehicleReportPdf } from "../lib/api/pdf-report";`):

```ts
import { computeVehicleSignals } from "../lib/vehicle/signals";
import type { VehicleProfile } from "../lib/rdw/types";
```

Then in `main()` (ln 152-164) compute a signals report from the mock vehicle and pass it. Replace the body of `main` (ln 152-164) with:

```ts
async function main() {
  // The preview mock is shaped like a localized payload; reuse its vehicle +
  // enriched as a minimal VehicleProfile so the page-1 judgment block renders.
  const previewProfile = {
    plate: "HF001B",
    displayPlate: "HF-001-B",
    fromCache: false,
    enriched: mockData.enriched,
    vehicle: mockData.vehicle,
    inspections: mockData.inspections,
    defects: mockData.defects,
    defectDescriptions: mockData.defectDescriptions,
    recalls: mockData.recalls,
    typeApprovals: [],
    raw: mockData.raw
  } as unknown as VehicleProfile;
  const signals = computeVehicleSignals({ profile: previewProfile, nowMs: Date.now(), hasAccess: true });
  const pdf = await generateVehicleReportPdf({
    plate: "HF001B",
    locale: "nl",
    generatedAt: new Date(),
    data: mockData as unknown as Record<string, unknown>,
    aiInsights,
    aiValuation,
    signals
  });
  const output = process.argv[2] ?? "preview-report.pdf";
  writeFileSync(output, pdf);
  console.log(`Wrote ${output} (${pdf.length} bytes)`);
}
```

- [ ] Verify it typechecks (no test asserts behaviour yet; this is wiring):

```
npm run typecheck
```

Expected: clean exit (no output, exit code 0). If `getVehicleProfile` or `computeVehicleSignals` imports are wrong the compiler reports it here.

- [ ] Commit:

```
git add lib/api/pdf-report.ts app/api/vehicle/[plate]/route.ts scripts/preview-pdf.ts
git commit -m "$(cat <<'EOF'
PDF: thread server-side signals into ReportArgs and call sites

ReportArgs gains optional signals (VehicleSignalReport). Download GET and
e-mail POST branches compute computeVehicleSignals on the RAW (cached) profile
and pass it to the PDF; the 402 access gate stays FIRST. Preview script builds
a signals report from its mock so page 1 renders locally.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.3: `drawJudgmentBlock` — PDF page 1 mirror of the web JudgmentBlock

Render the verdict heading + signal lines (ASCII word in a light-tone filled rect, dark text) + the alerts list, reusing the `drawCardRow` accent pattern as the signal-line primitive. No Unicode glyphs, no white-on-colour, no fake blur. This draws on the FIRST page right under the header, in the space the hero used to occupy.

**Files:** `lib/api/pdf-report.ts`

- [ ] Add a `drawJudgmentBlock` method to the `PdfLayout` class. Insert it after the existing `drawCardRow` method (which ends at ln 379, the closing `}` of `drawCardRow`) and before the class closing brace (ln 380). The method advances `this.y` by exactly what it consumes (flow-based, so the rest of the report flows beneath it):

```ts
  drawJudgmentBlock(report: VehicleSignalReport, locale: "nl" | "en") {
    const verdict = report.verdict;
    const heading = locale === "nl" ? verdict.headingNl : verdict.headingEn;

    // Verdict heading: a left accent bar (tone) + dark heading text. Colour is
    // reinforced by the words below, so grayscale print stays readable.
    this.ensureHeight(40);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 30,
      width: 6,
      height: 30,
      color: inkForTone(verdict.tone)
    });
    splitText(heading, this.bold, 15, CONTENT_WIDTH - 20)
      .slice(0, 2)
      .forEach((line, i) => {
        this.page.drawText(line, {
          x: MARGIN + 16,
          y: this.y - 16 - i * 18,
          font: this.bold,
          size: 15,
          color: rgb(0.06, 0.09, 0.16)
        });
      });
    this.y -= 40;

    // Signal lines: word in a light-tone filled rect (dark ink), then the
    // Dutch/English label + sub. Reuses the drawCardRow accent idea as a row.
    const rowH = 30;
    const wordW = 78;
    report.signals.forEach((sig) => {
      this.ensureHeight(rowH + 4);
      const top = this.y;
      this.page.drawRectangle({
        x: MARGIN,
        y: top - rowH,
        width: CONTENT_WIDTH,
        height: rowH,
        color: rgb(0.985, 0.99, 1),
        borderColor: rgb(0.86, 0.9, 0.96),
        borderWidth: 0.5
      });
      // status word chip (light fill, dark text)
      this.page.drawRectangle({
        x: MARGIN + 6,
        y: top - rowH + 6,
        width: wordW,
        height: rowH - 12,
        color: accentForTone(sig.tone)
      });
      this.page.drawText(toneToPdfWord(sig.tone), {
        x: MARGIN + 12,
        y: top - rowH / 2 - 3,
        font: this.bold,
        size: 9,
        color: inkForTone(sig.tone)
      });
      const label = locale === "nl" ? sig.labelNl : sig.labelEn;
      const sub = locale === "nl" ? sig.subNl : sig.subEn;
      this.page.drawText(label, {
        x: MARGIN + wordW + 16,
        y: top - 13,
        font: this.bold,
        size: 9.5,
        color: rgb(0.12, 0.2, 0.3)
      });
      splitText(sub, this.regular, 8.5, CONTENT_WIDTH - wordW - 28)
        .slice(0, 1)
        .forEach((line) => {
          this.page.drawText(line, {
            x: MARGIN + wordW + 16,
            y: top - 24,
            font: this.regular,
            size: 8.5,
            color: rgb(0.36, 0.44, 0.55)
          });
        });
      this.y -= rowH + 4;
    });

    // Summary teaser line (honest counts).
    const summary = report.summary;
    const teaser =
      locale === "nl"
        ? `Wij controleerden ${summary.checked} signalen. ${summary.needAttention} ${summary.needAttention === 1 ? "vraagt" : "vragen"} aandacht.` +
          (summary.priceAffecting > 0 ? ` ${summary.priceAffecting} raakt de eerlijke prijs.` : "")
        : `We checked ${summary.checked} signals. ${summary.needAttention} need attention.` +
          (summary.priceAffecting > 0 ? ` ${summary.priceAffecting} affects the fair price.` : "");
    this.ensureHeight(18);
    this.page.drawText(teaser, {
      x: MARGIN,
      y: this.y - 12,
      font: this.regular,
      size: 9,
      color: rgb(0.3, 0.38, 0.5)
    });
    this.y -= 20;

    // Alerts (risico bij uitzondering): only the real exceptions.
    if (report.alerts.length > 0) {
      this.section(locale === "nl" ? "Aandachtspunten" : "Exceptions");
      report.alerts.forEach((alert) => {
        const alertH = 22;
        this.ensureHeight(alertH + 2);
        const top = this.y;
        this.page.drawRectangle({
          x: MARGIN,
          y: top - alertH,
          width: CONTENT_WIDTH,
          height: alertH,
          color: accentForTone(alert.tone),
          borderColor: rgb(0.86, 0.9, 0.96),
          borderWidth: 0.5
        });
        this.page.drawText(toneToPdfWord(alert.tone), {
          x: MARGIN + 8,
          y: top - 15,
          font: this.bold,
          size: 8,
          color: inkForTone(alert.tone)
        });
        this.page.drawText(locale === "nl" ? alert.labelNl : alert.labelEn, {
          x: MARGIN + 70,
          y: top - 15,
          font: this.regular,
          size: 9,
          color: rgb(0.18, 0.26, 0.38)
        });
        this.y -= alertH + 3;
      });
      this.y -= 4;
    }
  }
```

- [ ] Verify it typechecks:

```
npm run typecheck
```

Expected: clean exit, code 0. (`drawJudgmentBlock` is defined but not yet called; that wiring is Task 5.5.)

- [ ] Commit:

```
git add lib/api/pdf-report.ts
git commit -m "$(cat <<'EOF'
PDF: add drawJudgmentBlock (page-1 verdict + signals + alerts)

Mirrors the web JudgmentBlock: tone left-bar verdict heading, signal rows with
ASCII status words (GOED/LET OP/SLECHT) in light-tone filled chips with dark
ink (survives grayscale), honest summary teaser, and the alerts list. Pure
flow-based: advances layout.y by what it consumes. No glyphs, no white-on-colour.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.4: Re-group `buildReportSections` into G1 to G6 order + drop the hardcoded hero gap

Reorder the existing section-drawing calls so they follow `pdfGroupOrder()` / the GROUPS layout (G1 verdict+analyse, G2 markt+te-koop, G3 schade, G4 km, G5 apk+apk-intelligence, G6 eigendom+specs), prefixing each group with a group banner, and replace the hardcoded `layout.y -= 172` (ln 595) with measured hero spacing so spacing is flow-based. The existing per-section content (keyValue / table / drawCardRow calls) is reused verbatim; only the ORDER and the section headings change.

**Files:** `lib/api/pdf-report.ts`

- [ ] Add a small group-banner helper to `PdfLayout`. Insert it right before `drawJudgmentBlock` (added in Task 5.3), after `drawCardRow` (ln 379):

```ts
  groupBanner(index: number, titleNl: string, titleEn: string, locale: "nl" | "en") {
    this.ensureHeight(26);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 22,
      width: CONTENT_WIDTH,
      height: 22,
      color: rgb(0.06, 0.2, 0.45)
    });
    this.page.drawText(`${index}. ${locale === "nl" ? titleNl : titleEn}`, {
      x: MARGIN + 8,
      y: this.y - 15,
      font: this.bold,
      size: 11,
      color: rgb(1, 1, 1)
    });
    this.y -= 30;
  }
```

- [ ] Remove the hardcoded hero gap. In `buildReportSections`, delete the line `layout.y -= 172;` (ln 595). Hero spacing is now reserved by the caller (Task 5.5 sets `layout.y` after `drawHeroVisuals`).

- [ ] Re-order the section calls under group banners. The block from the old "Beslissingsdashboard" section (ln 597) through the end of the "Schadesignalen" section (ln 852) is replaced. Keep the RDW-sources section + disclaimer (ln 854-879) exactly where they are (they run AFTER all groups, like the web "acties" footer). Replace ln 597-852 with the following, which preserves every existing content call but in GROUPS order with banners. Note: this REMOVES the old standalone "Beslissingsdashboard" / "Onderhandelcoach" duplicate (the verdict now lives on page 1 via drawJudgmentBlock, and the negotiation coach maps under G2 markt). The `pricing` computation block (ln 701-720) stays where the G2 group needs it, moved up just before the G2 negotiation card:

```ts
  // ---- G1: Overzicht & oordeel  (sectionIds: overzicht, ai-analyse) ----
  layout.groupBanner(1, "Overzicht en oordeel", "Overview and verdict", locale);

  layout.section(pdfSectionTitle("overzicht", locale));
  layout.keyValue(locale === "nl" ? "Merk / Model" : "Brand / Model", `${s(vehicle.brand)} ${s(vehicle.tradeName)}`.trim());
  const typeVariant = [vehicle.typeCode, vehicle.variant, vehicle.uitvoering].filter(Boolean).join(" ");
  if (typeVariant) {
    layout.keyValue(locale === "nl" ? "Type/variant (RDW)" : "Type/variant (RDW)", typeVariant);
  }
  layout.keyValue(locale === "nl" ? "Bouwjaar / Carrosserie" : "Year / Body type", `${s(vehicle.year)} / ${s(vehicle.bodyType)}`);
  layout.keyValue(locale === "nl" ? "Brandstof / Kleur" : "Fuel / Color", `${s(vehicle.fuelType)} / ${s(asRow(vehicle.color).primary)}`);
  layout.keyValue(locale === "nl" ? "Motor" : "Engine", `${s(asRow(vehicle.engine).displacement)} cc, ${s(asRow(vehicle.engine).cylinders)} cyl, ${s(asRow(vehicle.engine).powerKw)} kW`);
  layout.keyValue(locale === "nl" ? "APK vervaldatum" : "APK expiry", s(vehicle.apkExpiryDate));

  if (aiInsights) {
    layout.section(pdfSectionTitle("ai-analyse", locale));
    layout.keyValue(locale === "nl" ? "Samenvatting" : "Summary", aiInsights.summary);
    layout.keyValue(locale === "nl" ? "Sterke punten" : "Positives", aiInsights.positives.length > 0 ? aiInsights.positives.join(" | ") : "-");
    layout.keyValue(locale === "nl" ? "Aandachtspunten" : "Points of attention", aiInsights.risks.length > 0 ? aiInsights.risks.join(" | ") : "-");
    layout.keyValue(locale === "nl" ? "Aanbeveling" : "Recommendation", aiInsights.recommendation);
    if (aiInsights.recommendations?.length) {
      layout.keyValue(locale === "nl" ? "Actieplan" : "Action plan", aiInsights.recommendations.join(" | "));
    }
  }

  // ---- G2: Marktwaarde & eerlijke prijs  (sectionIds: markt, te-koop) ----
  layout.groupBanner(2, "Marktwaarde en eerlijke prijs", "Market value and fair price", locale);

  layout.section(pdfSectionTitle("markt", locale));
  layout.keyValue(locale === "nl" ? "Marktwaarde nu / volgend jaar" : "Market value now / next year", `${currency(enriched.estimatedValueNow)} / ${currency(enriched.estimatedValueNextYear)}`);
  layout.keyValue(locale === "nl" ? "Marktbandbreedte" : "Market range", `${currency(enriched.estimatedValueMin)} - ${currency(enriched.estimatedValueMax)} (${s(enriched.marketValueConfidence)} confidence)`);
  layout.keyValue(locale === "nl" ? "APK kans / onderhoudsrisico" : "APK chance / maintenance risk", `${s(enriched.apkPassChance)}% / ${s(enriched.maintenanceRiskScore)}`);
  layout.keyValue(locale === "nl" ? "Wegenbelasting per kwartaal" : "Road tax per quarter", `${currency(asRow(enriched.roadTaxEstQuarter).min)} - ${currency(asRow(enriched.roadTaxEstQuarter).max)}`);
  layout.keyValue(locale === "nl" ? "Verzekering / brandstof per maand" : "Insurance / fuel per month", `${currency(enriched.insuranceEstMonth)} / ${currency(enriched.fuelEstMonth)}`);
  if (aiValuation) {
    if (aiValuation.factors.length > 0) {
      layout.keyValue(locale === "nl" ? "Waardefactoren" : "Value factors", aiValuation.factors.join(" | "));
    }
    if (aiValuation.explanation) {
      layout.keyValue(locale === "nl" ? "Toelichting waarde" : "Value explanation", aiValuation.explanation);
    }
  }

  const marketNowRaw = toNumber(enriched.estimatedValueNow);
  const marketMinRaw = toNumber(enriched.estimatedValueMin);
  const marketMaxRaw = toNumber(enriched.estimatedValueMax);
  const marketNow = marketNowRaw ?? 0;
  const marketMin = marketMinRaw ?? 0;
  const marketMax = marketMaxRaw ?? 0;
  const riskScore = toNumber(enriched.maintenanceRiskScore) ?? 6;
  const mileagePlausible =
    enriched.userMileagePlausible === null || enriched.userMileagePlausible === undefined
      ? null
      : Boolean(enriched.userMileagePlausible);
  const pricing = computeNegotiationPricing({
    marketNow,
    marketMin,
    marketMax,
    riskScore,
    defects: defects.length,
    recalls: recalls.length,
    mileagePlausible
  });

  layout.section(pdfSectionTitle("te-koop", locale));
  if (marketNowRaw !== null && marketNowRaw > 0 && marketMinRaw !== null && marketMaxRaw !== null) {
    layout.drawCardRow([
      {
        title: locale === "nl" ? "Aanbevolen biedrange" : "Recommended offer range",
        value: `${currency(pricing.offerMin)} - ${currency(pricing.offerMax)}`,
        accent: rgb(0.07, 0.44, 0.63)
      },
      {
        title: locale === "nl" ? "Walk-away grens" : "Walk-away threshold",
        value: currency(pricing.walkAway),
        accent: rgb(0.72, 0.12, 0.18)
      },
      {
        title: locale === "nl" ? "Reparatiereserve" : "Repair reserve",
        value: `${currency(pricing.reserveMin)} - ${currency(pricing.reserveMax)}`,
        accent: rgb(0.78, 0.5, 0.08)
      }
    ]);
    layout.keyValue(
      locale === "nl" ? "Strategie" : "Strategy",
      locale === "nl"
        ? "Start bij de onderkant van de biedrange en sluit idealiter binnen deze band. Boven de walk-away grens neemt uw nadeel toe ten opzichte van markt en risico. Houd de reparatiereserve apart voor verrassingskosten in het eerste jaar."
        : "Start near the lower bound of the offer range and ideally close within this band. Above the walk-away threshold your downside increases against market and risk. Keep the repair reserve aside for surprise costs in the first year."
    );
    layout.keyValue(
      locale === "nl" ? "Referentiewaarde" : "Reference value",
      `${currency(marketNow)} (${currency(marketMin)} - ${currency(marketMax)})`
    );
  } else {
    layout.keyValue(
      locale === "nl" ? "Status" : "Status",
      locale === "nl"
        ? "Onvoldoende marktdata om een biedstrategie te berekenen."
        : "Insufficient market data to compute an offer strategy."
    );
  }

  // ---- G3: Risicos & schade  (sectionId: schade) ----
  layout.groupBanner(3, "Risicos en schade", "Risks and damage", locale);

  const yesNo = (value: unknown) =>
    value === true ? (locale === "nl" ? "Ja" : "Yes") : value === false ? (locale === "nl" ? "Nee" : "No") : "-";

  layout.section(pdfSectionTitle("schade", locale));
  layout.keyValue(locale === "nl" ? "WOK-status (Wachten Op Keuren)" : "WOK status (awaiting inspection)", yesNo(vehicle.wok));
  layout.keyValue(
    locale === "nl" ? "Geconstateerde gebreken" : "Recorded defects",
    `${derivedDefects.length} ${locale === "nl" ? "record(s) in APK-historie" : "record(s) in inspection history"}`
  );
  layout.keyValue(
    locale === "nl" ? "Open terugroepactie" : "Open recall",
    `${yesNo(vehicle.hasOpenRecall)} (${recalls.length} ${locale === "nl" ? "geregistreerd" : "recorded"})`
  );
  if (recalls.length > 0) {
    layout.table(
      [locale === "nl" ? "Campagne" : "Campaign", locale === "nl" ? "Defect" : "Defect", locale === "nl" ? "Status" : "Status"],
      recalls.map((it) => [s(it.campagnenummer), s(it.omschrijving_defect), s(it.status)])
    );
  }
  layout.keyValue(
    locale === "nl" ? "Belangrijk" : "Important",
    locale === "nl"
      ? "Verzekeringsschade is in Nederland niet openbaar. Dit rapport toont daarom alleen schadesignalen uit officiele RDW-data, geen claimhistorie van verzekeraars."
      : "Insurance damage records are not public in the Netherlands. This report therefore only shows damage signals from official RDW data, not insurer claim history."
  );

  // ---- G4: Kilometerstand & NAP  (sectionId: kilometerstand) ----
  layout.groupBanner(4, "Kilometerstand en NAP", "Mileage and NAP", locale);

  layout.section(pdfSectionTitle("kilometerstand", locale));
  layout.keyValue(locale === "nl" ? "NAP-tellerstandoordeel (RDW)" : "NAP odometer verdict (RDW)", s(vehicle.napVerdict));
  layout.keyValue(locale === "nl" ? "Geschatte kilometerstand nu" : "Estimated mileage now", kmLabel(enriched.estimatedMileageNow));
  if (toNumber(enriched.mileageSlopeKmPerYear) !== null) {
    layout.keyValue(locale === "nl" ? "Gemiddeld per jaar" : "Average per year", kmLabel(enriched.mileageSlopeKmPerYear));
  }
  if (enriched.mileageUsageProfile) {
    layout.keyValue(locale === "nl" ? "Gebruiksprofiel" : "Usage profile", s(enriched.mileageUsageProfile));
  }
  layout.keyValue(
    locale === "nl" ? "Let op" : "Note",
    locale === "nl"
      ? "De RDW mag geen volledige tellerstanden verstrekken. Het officiele NAP-oordeel hierboven is leidend; de kilometerstand is een schatting op basis van leeftijd en gebruik."
      : "The RDW may not share full odometer readings. The official NAP verdict above is leading; the mileage figure is an estimate based on age and usage."
  );

  // ---- G5: APK-historie & rijwaardigheid  (sectionIds: apk, apk-intelligence) ----
  layout.groupBanner(5, "APK-historie en rijwaardigheid", "MOT history and roadworthiness", locale);

  layout.section(pdfSectionTitle("apk", locale));
  layout.table(
    [locale === "nl" ? "Datum" : "Date", locale === "nl" ? "Code" : "Code", locale === "nl" ? "Type" : "Type", locale === "nl" ? "Aantal" : "Count"],
    inspections.map((it) => [
      s(it.meld_datum_door_keuringsinstantie_dt ?? it.meld_datum_door_keuringsinstantie),
      s(it.gebrek_identificatie),
      s(it.soort_erkenning_omschrijving),
      s(it.aantal_gebreken_geconstateerd)
    ])
  );
  layout.table(
    [locale === "nl" ? "Code" : "Code", locale === "nl" ? "Omschrijving" : "Description", locale === "nl" ? "Bron" : "Source", locale === "nl" ? "Opmerking" : "Notes"],
    derivedDefects.map((it) => {
      const row = it as Row;
      const code = s(row.gebrek_identificatie);
      return [code, s(row.gebrek_omschrijving ?? defectDescriptions[code]), defects.length > 0 ? "defects" : "inspection", s(row.toelichting)];
    })
  );

  if (enriched.apkPassChance !== null && enriched.apkPassChance !== undefined) {
    layout.section(pdfSectionTitle("apk-intelligence", locale));
    layout.keyValue(locale === "nl" ? "Geschatte APK-slaagkans" : "Estimated MOT pass chance", `${s(enriched.apkPassChance)}%`);
    layout.keyValue(locale === "nl" ? "Onderhoudsrisico" : "Maintenance risk", s(enriched.maintenanceRiskScore));
  }

  // ---- G6: Eigendom & voertuiggegevens  (sectionIds: eigendom, specs) ----
  layout.groupBanner(6, "Eigendom en voertuiggegevens", "Ownership and vehicle data", locale);

  layout.section(pdfSectionTitle("eigendom", locale));
  layout.keyValue(locale === "nl" ? "Statusflags" : "Status flags", `WOK: ${boolLabel(vehicle.wok)}, Export: ${boolLabel(vehicle.exportIndicator)}, Transfer: ${boolLabel(vehicle.transferPossible)}, Insured: ${boolLabel(vehicle.insured)}, Taxi: ${boolLabel(vehicle.isTaxi)}, Recall open: ${boolLabel(vehicle.hasOpenRecall)}`);

  layout.section(pdfSectionTitle("specs", locale));
  const dims = asRow(vehicle.dimensions);
  const dimLength = toNumber(dims.length);
  const dimWidth = toNumber(dims.width);
  const dimHeight = toNumber(dims.height);
  const dimWheelbase = toNumber(dims.wheelbase);
  if (dimLength !== null && dimWidth !== null && dimHeight !== null && dimWheelbase !== null) {
    layout.keyValue(
      locale === "nl" ? "Afmetingen" : "Dimensions",
      `${dimLength} x ${dimWidth} x ${dimHeight} mm, ${locale === "nl" ? "wielbasis" : "wheelbase"} ${dimWheelbase} mm`
    );
  }
  layout.keyValue(locale === "nl" ? "Gewicht" : "Weight", `${s(asRow(vehicle.weight).empty)} kg empty, ${s(asRow(vehicle.weight).max)} kg max`);
  const readyToDrive = toNumber(asRow(vehicle.weight).readyToDrive);
  if (readyToDrive !== null) {
    layout.keyValue(locale === "nl" ? "Massa rijklaar" : "Mass ready to drive", `${readyToDrive} kg`);
  }
  const transmissionRaw = s(vehicle.transmission);
  if (transmissionRaw !== "-") {
    const code = String(vehicle.transmissionCode ?? "").toUpperCase();
    let transmissionLabel: string;
    if (code === "M") transmissionLabel = locale === "nl" ? "Handgeschakeld" : "Manual";
    else if (code === "A") transmissionLabel = locale === "nl" ? "Automaat" : "Automatic";
    else if (code === "C") transmissionLabel = locale === "nl" ? "CVT (automaat)" : "CVT (automatic)";
    else if (code) transmissionLabel = locale === "nl" ? "Anders" : "Other";
    else transmissionLabel = transmissionRaw;
    const gears = toNumber(vehicle.gears);
    if (gears !== null) {
      transmissionLabel += locale === "nl" ? ` (${gears} versnellingen)` : ` (${gears} gears)`;
    }
    layout.keyValue(locale === "nl" ? "Transmissie" : "Transmission", transmissionLabel);
  } else {
    layout.keyValue(
      locale === "nl" ? "Transmissie" : "Transmission",
      locale === "nl" ? "Niet geregistreerd in RDW open data" : "Not registered in RDW open data"
    );
  }
  const factoryModelName = s(vehicle.factoryModelName);
  if (factoryModelName !== "-") {
    layout.keyValue(locale === "nl" ? "Fabrieksbenaming" : "Factory model name", factoryModelName);
  }
  layout.section(pdfSectionTitle("specs", locale) + (locale === "nl" ? " (brandstof)" : " (fuel)"));
  layout.table(
    [locale === "nl" ? "Brandstof" : "Fuel", "CO2", locale === "nl" ? "Verbruik combi" : "Combined usage", locale === "nl" ? "Emissie" : "Emission"],
    fuel.map((it) => [s(it.brandstof_omschrijving), s(it.co2_uitstoot_gecombineerd), s(it.brandstofverbruik_gecombineerd), s(it.uitlaatemissieniveau)])
  );
  layout.table(
    [locale === "nl" ? "Carrosserie" : "Body", locale === "nl" ? "Europese omschrijving" : "EU description", locale === "nl" ? "Typegoedkeuring" : "Type approval"],
    [
      ...body.map((it) => [s(it.carrosserietype), s(it.type_carrosserie_europese_omschrijving), "-"]),
      ...typeApprovals.map((it) => ["-", "-", s(it.typegoedkeuringsnummer ?? it.eu_typegoedkeuring ?? it.typegoedkeuringsnummer_voertuig)])
    ]
  );
```

CONTRACT-NOTE: the old `repairChances` / `knownIssues` sections (ln 818-832) are intentionally dropped from the re-grouped flow because CLAUDE.md states they are now always empty ("lege tabellen ... zijn nu altijd leeg verborgen"). The old standalone "Beslissingsdashboard" and the `aiValuation` purchase-verdict key-value are dropped because the verdict now lives on page 1 (`drawJudgmentBlock`). No data is lost: AI summary/positives/risks/recommendation/recommendations all remain under G1 ai-analyse.

- [ ] Verify it typechecks:

```
npm run typecheck
```

Expected: clean exit, code 0.

- [ ] Commit:

```
git add lib/api/pdf-report.ts
git commit -m "$(cat <<'EOF'
PDF: re-group body sections into web G1..G6 order; drop hero -=172

buildReportSections now renders under numbered group banners in the exact
GROUPS order (G1 overzicht+analyse, G2 markt+te-koop, G3 schade, G4 km,
G5 apk+inzichten, G6 eigendom+specs), reusing every existing content call.
Removed the hardcoded layout.y -= 172 (hero spacing is now measured by the
caller) and the duplicate verdict dashboard (lives on page 1 now).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.5: Two-pass render with TOC + page numbers; call `drawJudgmentBlock`; reserve hero height

Wire page 1 together: draw the judgment block under the header, record each group banner's page+y during the real render, then run a second pass to draw a TOC. `pdf-lib` lets us add pages and re-order them, so the simplest robust "2-pass that records page+y" is: render the whole report once (recording group anchors), then build a TOC page and move it to the front. This avoids fragile deferred link annotations while still giving a real TOC with titles + page numbers.

**Files:** `lib/api/pdf-report.ts`

- [ ] Make `PdfLayout` record page indices and expose a page-number lookup. Add three things to the `PdfLayout` class. First, two fields next to `public y` (ln 168):

```ts
  public y: number;
  public pages: PDFPage[] = [];
  public anchors: Array<{ title: string; pageIndex: number }> = [];
```

Then, in the constructor (ln 170-178), after `this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);` (ln 175) push the page:

```ts
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
```

And in `addPage()` (ln 180-184), after `this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);` (ln 181):

```ts
  private addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    drawHeader(this.page, this.bold, this.regular, this.args);
    this.y = PAGE_HEIGHT - HEADER_HEIGHT - 16;
  }
```

- [ ] Record an anchor in `groupBanner`. In the `groupBanner` method added in Task 5.4, add an anchor push at the very top of the method body (before `this.ensureHeight(26);`):

```ts
  groupBanner(index: number, titleNl: string, titleEn: string, locale: "nl" | "en") {
    this.anchors.push({
      title: `${index}. ${locale === "nl" ? titleNl : titleEn}`,
      pageIndex: this.pages.indexOf(this.page)
    });
    this.ensureHeight(26);
```

- [ ] Add a `buildTocPage` method to `PdfLayout` that creates a fresh page (NOT appended via addPage, so it is not in the main flow), draws the TOC, and returns it so the caller can move it to the front. Insert after `drawJudgmentBlock` (Task 5.3):

```ts
  buildTocPage(locale: "nl" | "en"): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawHeader(page, this.bold, this.regular, this.args);
    let ty = PAGE_HEIGHT - HEADER_HEIGHT - 24;
    page.drawText(locale === "nl" ? "Inhoud" : "Contents", {
      x: MARGIN,
      y: ty,
      font: this.bold,
      size: 16,
      color: rgb(0.06, 0.2, 0.45)
    });
    ty -= 30;
    this.anchors.forEach((a) => {
      // pageIndex is into this.pages BEFORE the TOC is moved to the front, so
      // the printed page number is pageIndex + 2 (1-based, +1 for the TOC page
      // that becomes page 1).
      const printedPage = a.pageIndex + 2;
      page.drawText(a.title, {
        x: MARGIN,
        y: ty,
        font: this.regular,
        size: 11,
        color: rgb(0.14, 0.22, 0.34)
      });
      const numLabel = String(printedPage);
      const numW = this.regular.widthOfTextAtSize(numLabel, 11);
      page.drawText(numLabel, {
        x: PAGE_WIDTH - MARGIN - numW,
        y: ty,
        font: this.regular,
        size: 11,
        color: rgb(0.3, 0.4, 0.52)
      });
      ty -= 20;
    });
    return page;
  }
```

- [ ] Reserve hero height + draw the judgment block, then build & front the TOC, in `generateVehicleReportPdf`. The current function (ln 922-957) calls `drawHeroVisuals(...)` then `buildReportSections(layout, args)`. After `drawHeroVisuals(...)` we now (a) set `layout.y` to just below the hero (replacing the deleted `-=172`), (b) draw the judgment block when signals exist, (c) build sections, (d) build the TOC page and move it to the front. Replace ln 943-956 (`drawHeroVisuals({ ... });` through `const bytes = await doc.save();`) with:

```ts
  drawHeroVisuals({
    page: layout.page,
    regular,
    bold,
    data: args.data,
    image: vehicleImage,
    map: mapImage,
    aiInsights: args.aiInsights,
    aiValuation: args.aiValuation,
    locale: args.locale
  });
  // The hero occupies a fixed band under the header; continue the flow just
  // below it (replaces the old hardcoded layout.y -= 172).
  const HERO_HEIGHT = 165;
  layout.y = PAGE_HEIGHT - HEADER_HEIGHT - 8 - HERO_HEIGHT - 16;
  // Page 1 judgment block (mirrors the web JudgmentBlock) when signals exist.
  if (args.signals) {
    layout.drawJudgmentBlock(args.signals, args.locale);
  }
  buildReportSections(layout, args);
  // Real two-pass: anchors were recorded during the render above; build the TOC
  // page now and move it to the front so its page numbers line up.
  const tocPage = layout.buildTocPage(args.locale);
  const tocIndex = doc.getPageCount() - 1; // the TOC page is the last one added
  doc.removePage(tocIndex);
  doc.insertPage(0, tocPage);
  const bytes = await doc.save();
```

CONTRACT-NOTE: this is a real two-pass anchor recording (page+y captured in `PdfLayout.section`/`groupBanner` during render), then a TOC list with section titles + page numbers, exactly as the phase brief's fallback ("at least a plain TOC list with section titles + page numbers"). Clickable link annotations are deliberately NOT used (pdf-lib link annotations are heavy and brittle across viewers); the brief explicitly allows the plain-TOC fallback.

- [ ] Verify it typechecks and builds:

```
npm run typecheck
npm run build
```

Expected: `typecheck` clean exit 0; `next build` completes with "Compiled successfully" (it builds without MongoDB per CLAUDE.md). No `removePage`/`insertPage`/`getPageCount` type errors (these are standard pdf-lib `PDFDocument` methods).

- [ ] Visual verification (the PDF is not unit-tested; this is the headless / manual check). Render the local preview and open it:

```
npx tsx scripts/preview-pdf.ts preview-report.pdf
```

Expected stdout: `Wrote preview-report.pdf (NNNNN bytes)`. Then open `preview-report.pdf` and confirm by eye: (1) page 1 is the TOC (Inhoud) listing groups 1 to 6 with page numbers; (2) page 2 starts with the header + hero, then the judgment block (verdict heading with a coloured left bar, signal rows each showing GOED / LET OP / SLECHT in a light-coloured chip with dark text, the honest summary line, and the alerts list if any); (3) the body follows in numbered group banners 1 to 6 in the same order as the website; (4) printing the page or viewing in grayscale, the status WORDS are still readable (colour is not the only signal); (5) no en-dashes or em-dashes anywhere; (6) no duplicate verdict dashboard further down.

- [ ] Commit:

```
git add lib/api/pdf-report.ts
git commit -m "$(cat <<'EOF'
PDF: two-pass TOC + page-1 judgment block + flow-based hero spacing

PdfLayout records page anchors during render; generateVehicleReportPdf draws
the judgment block below the hero (flow-based, replacing the hardcoded gap),
then builds a TOC page (section titles + page numbers) and moves it to the
front. Plain anchored TOC mirrors the web jump-nav.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.6: Final full-suite verification + sample-inline / gate regression check

Confirm the whole phase holds together: unit tests green, typecheck clean, build green, and the two server invariants are intact (402 gate FIRST; sample plate H223JZ still renders inline and fully unlocked).

**Files:** none (verification only)

- [ ] Run the unit tests one more time, expect all green:

```
npm test
```

Expected: `# fail 0`; the `tests/pdf-report.test.ts` group-order test still matches `GROUPS` (this is the guard that the PDF order never drifts from the web groups).

- [ ] Typecheck + build:

```
npm run typecheck
npm run build
```

Expected: both exit 0 / "Compiled successfully".

- [ ] Static gate check (read-only inspection, no code change). Confirm in `app/api/vehicle/[plate]/route.ts` that:
  - in the `if (downloadReport)` branch the `402` return (the `if (!hasAccess)` block) still appears BEFORE the `buildLocalizedWithAi` call and before `computeVehicleSignals` (no AI or signals work happens for unpaid downloads);
  - in the `POST` handler the `hasPaidReportAccess` 402 still precedes `buildLocalizedWithAi`;
  - `computeVehicleSignals` is only ever called with `hasAccess: true` in the PDF paths (paid/sample already passed the gate).

```
git diff --stat HEAD~5 -- app/api/vehicle/[plate]/route.ts lib/api/pdf-report.ts scripts/preview-pdf.ts tests/pdf-report.test.ts tsconfig.test.json
```

Expected: the five files show as changed across the phase; nothing else.

- [ ] Sample-inline behaviour check (manual, since RDW/Mongo are unreachable in the sandbox per CLAUDE.md). Note for the executor: on a deployed/preview environment, hit `GET /api/vehicle/H223JZ?download=1` and confirm (a) HTTP 200, (b) `content-disposition: inline; filename="voorbeeld-kentekenrapport-H223JZ.pdf"` (sample stays inline, route ln 273-275 unchanged), and (c) the PDF opens with the new page-1 TOC + judgment block fully expanded. This is the only behaviour that cannot be verified offline; flag it as a deploy-time verification step, not a unit test.

- [ ] No commit needed (verification only). If everything is green, Phase 5 is complete.
