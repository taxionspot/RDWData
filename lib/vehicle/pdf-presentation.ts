/**
 * Pure PDF-presentation helpers for the vehicle report PDF.
 *
 * These helpers are extracted from lib/api/pdf-report.ts so they can be
 * unit-tested without pulling in pdf-lib or Next.js server modules.
 *
 * Imports ONLY from lib/vehicle/signals and lib/vehicle/groups (no pdf-lib).
 */
import type { SignalTone } from "./signals";
import { GROUPS, type GroupId, type ReportSectionId } from "./groups";

/**
 * Tone to ASCII status word. The PDF must survive black-and-white printing so
 * colour never carries meaning alone: every coloured signal line also shows one
 * of these words. No Unicode glyphs (the embedded Helvetica cannot render them).
 */
export function toneToPdfWord(tone: SignalTone): string {
  if (tone === "ok") return "GOED";
  if (tone === "warn") return "LET OP";
  return "SLECHT";
}

/**
 * Light accent fill RGB triple per tone. These are LIGHT fills meant to sit
 * behind DARK text (never white-on-colour), so the word stays legible on a
 * grayscale printer while the hue still reads as green/amber/red in colour.
 * Returns [r, g, b] in 0..1 range for use with pdf-lib rgb().
 */
export function accentForTone(tone: SignalTone): [number, number, number] {
  if (tone === "ok") return [0.85, 0.94, 0.87];   // light green
  if (tone === "warn") return [0.99, 0.93, 0.8];  // light amber
  return [0.99, 0.86, 0.86];                       // light red
}

/**
 * Dark ink RGB triple per tone for the status word drawn on top of accentForTone.
 * Returns [r, g, b] in 0..1 range for use with pdf-lib rgb().
 */
export function inkForTone(tone: SignalTone): [number, number, number] {
  if (tone === "ok") return [0.06, 0.42, 0.22];
  if (tone === "warn") return [0.6, 0.4, 0.04];
  return [0.6, 0.1, 0.14];
}

/**
 * The PDF section order, driven from the SAME GROUPS definition as the web
 * report so the paper version is the fully-expanded twin of the on-screen
 * groups (G1..G6). The dropped "risico" RiskOverview section is absent because
 * it is not mapped to any group's sectionIds in groups.ts.
 */
export function pdfGroupOrder(): ReportSectionId[] {
  return GROUPS.flatMap((g) => g.sectionIds);
}

/**
 * Ordered list of group ids from GROUPS (G1..G6).
 * Useful for iterating groups in PDF render order.
 */
export function pdfGroupIds(): GroupId[] {
  return GROUPS.map((g) => g.id);
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
