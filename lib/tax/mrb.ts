/**
 * Motorrijtuigenbelasting (MRB) per kwartaal, indicatie 2026.
 *
 * Structuur volgt de Belastingdienst: nationaal tarief op basis van
 * gewichtsklasse (afgerond op 100 kg) en brandstof, vermenigvuldigd met de
 * provinciale opcenten. Omdat de provincie van de koper onbekend is tonen we
 * de bandbreedte over alle provincies. Tarieven zijn gekalibreerd op publieke
 * referentiepunten en jaarlijks bij te werken in dit bestand.
 */

// Provinciale opcenten 2026 (percentage bovenop het nationale tarief).
const PROVINCIAL_OPCENTEN: Record<string, number> = {
  Groningen: 95.7,
  Friesland: 87.0,
  Drenthe: 92.0,
  Overijssel: 82.2,
  Flevoland: 82.2,
  Gelderland: 93.0,
  Utrecht: 79.1,
  "Noord-Holland": 67.9,
  "Zuid-Holland": 98.7,
  Zeeland: 82.3,
  "Noord-Brabant": 80.8,
  Limburg: 87.6
};

const OPCENTEN_MIN = Math.min(...Object.values(PROVINCIAL_OPCENTEN));
const OPCENTEN_MAX = Math.max(...Object.values(PROVINCIAL_OPCENTEN));

type FuelKind = "benzine" | "diesel" | "lpg" | "elektrisch" | "overig";

function fuelKind(fuelType: string | null): FuelKind {
  const fuel = (fuelType ?? "").toLowerCase();
  if (fuel.includes("diesel")) return "diesel";
  if (fuel.includes("lpg") || fuel.includes("cng") || fuel.includes("aardgas")) return "lpg";
  if (fuel.includes("elektr") && !fuel.includes("benz") && !fuel.includes("diesel")) return "elektrisch";
  if (fuel.includes("benz") || fuel.includes("petrol") || fuel.includes("hybr")) return "benzine";
  return "overig";
}

/** Nationaal kwartaaltarief benzine: lineair per gewichtsklasse boven 550 kg. */
function nationalQuarterPetrol(weightKg: number): number {
  const weightClass = Math.ceil(Math.max(weightKg, 500) / 100) * 100;
  return Math.max(22, (weightClass - 550) * 0.105);
}

function nationalQuarter(weightKg: number, kind: FuelKind): number {
  const petrol = nationalQuarterPetrol(weightKg);
  switch (kind) {
    case "diesel":
      // Inclusief gemiddelde fijnstoftoeslag-impact.
      return petrol * 2.15;
    case "lpg":
      return petrol * 1.95;
    case "elektrisch":
      // 2026: tariefkorting voor emissievrije personenauto's.
      return petrol * 0.7;
    default:
      return petrol;
  }
}

export type MrbEstimate = {
  min: number;
  max: number;
  /** Indicatie voor een gemiddelde provincie. */
  typical: number;
};

export function computeMrbQuarter(weightKg: number | null, fuelType: string | null): MrbEstimate | null {
  if (!weightKg || weightKg <= 0) return null;
  const kind = fuelKind(fuelType);
  const national = nationalQuarter(weightKg, kind);
  const avgOpcenten =
    Object.values(PROVINCIAL_OPCENTEN).reduce((sum, value) => sum + value, 0) / Object.values(PROVINCIAL_OPCENTEN).length;
  return {
    min: Math.round(national * (1 + OPCENTEN_MIN / 100)),
    max: Math.round(national * (1 + OPCENTEN_MAX / 100)),
    typical: Math.round(national * (1 + avgOpcenten / 100))
  };
}
