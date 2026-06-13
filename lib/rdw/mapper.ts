import { formatDisplayPlate } from "./normalize";
import type { RdwRecord, VehicleProfile } from "./types";
import { enrichVehicleData } from "./heuristics";

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}
function num(v: unknown): number | null {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n : null;
}
function bool(v: unknown): boolean {
  const s = String(v ?? "").toLowerCase();
  return s === "ja" || s === "j" || v === true || s === "yes";
}
function notBool(v: unknown): boolean {
  // "Nee" / "Geen" / "N" → false → hasOpenRecall = false means NO open recall
  const s = String(v ?? "").toLowerCase();
  return s === "ja" || s === "j" || v === true || s === "yes";
}
function dateStr(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (s.includes("T")) return s.split("T")[0];
  return s;
}

export function toVehicleProfile(input: {
  plate: string;
  fromCache: boolean;
  defectDescriptions?: Record<string, string>;
  main: RdwRecord[];
  fuel: RdwRecord[];
  apk: RdwRecord[];
  defects: RdwRecord[];
  recalls: RdwRecord[];
  body: RdwRecord[];
  typeApprovals: RdwRecord[];
}): VehicleProfile {
  const m = input.main[0] ?? {};
  // fuel[0] = primary fuel (petrol/diesel); fuel[1] = secondary (electric)
  const f = input.fuel[0] ?? {};
  // Prefer fuel's emission standard, fall back to main
  const allFuelStandards = input.fuel
    .map((r) => str(r.uitlaatemissieniveau))
    .filter(Boolean)
    .join(" / ");

  const yearRaw = str(m.datum_eerste_toelating ?? m.datum_eerste_toelating_dt);
  const year = yearRaw ? Number(String(yearRaw).replace(/\D/g, "").slice(0, 4)) : null;

  const profile: VehicleProfile = {
    plate: input.plate,
    displayPlate: formatDisplayPlate(input.plate),
    fromCache: input.fromCache,

    vehicle: {
      // Identity
      brand: str(m.merk),
      tradeName: str(m.handelsbenaming),
      typeCode: str(m.type),
      variant: str(m.variant),
      uitvoering: str(m.uitvoering),
      year: Number.isFinite(year) ? year : null,
      color: {
        primary: str(m.eerste_kleur),
        secondary: str(m.tweede_kleur) === "Niet geregistreerd" ? null : str(m.tweede_kleur)
      },

      // Body
      bodyType: str(m.inrichting),
      doors: num(m.aantal_deuren),
      seats: num(m.aantal_zitplaatsen),
      axles: num(m.aantal_assen),

      // Fuel & Emissions
      fuelType: str(f.brandstof_omschrijving),
      co2: num(f.co2_uitstoot_gecombineerd),
      energyLabel: str(m.zuinigheidsclassificatie ?? f.zuinigheidsclassificatie),
      consumptionCombined: num(f.brandstofverbruik_gecombineerd),
      emissionStandard: allFuelStandards || null,

      // Engine
      engine: {
        displacement: num(m.cilinderinhoud ?? f.cilinderinhoud),
        cylinders: num(m.aantal_cilinders),
        powerKw: num(f.nettomaximumvermogen ?? f.nominaal_continu_maximumvermogen)
      },

      // Dimensions
      dimensions: {
        wheels: num(m.aantal_wielen),
        wheelbase: num(m.wielbasis),
        length: num(m.lengte),
        width: num(m.breedte),
        height: num(m.hoogte_voertuig)
      },

      // Weight
      weight: {
        empty: num(m.massa_ledig_voertuig),
        max: num(m.toegestane_maximum_massa_voertuig),
        payload: num(m.laadvermogen),
        readyToDrive: num(m.massa_rijklaar),
        powerToMassRatio: num(m.vermogen_massarijklaar)
      },

      // APK
      apkExpiryDate: dateStr(m.vervaldatum_apk_dt ?? m.vervaldatum_apk),

      // Ownership
      owners: { count: num(m.aantal_houders) },

      // Import / export
      firstRegistrationNL: dateStr(m.datum_eerste_tenaamstelling_in_nederland_dt ?? m.datum_eerste_tenaamstelling_in_nederland),
      firstRegistrationWorld: dateStr(m.datum_eerste_toelating_dt ?? m.datum_eerste_toelating),
      exportIndicator: bool(m.export_indicator),

      // Flags
      wok: bool(m.wacht_op_keuren),
      transferPossible: bool(m.tenaamstellen_mogelijk),
      insured: bool(m.wam_verzekerd),
      isTaxi: bool(m.taxi_indicator),
      hasOpenRecall: notBool(m.openstaande_terugroepactie_indicator),

      // NAP mileage verdict
      napVerdict: str(m.tellerstandoordeel),
      napLastYear: num(m.jaar_laatste_registratie_tellerstand),

      // Financial
      cataloguePrice: num(m.catalogusprijs),

      recallsCount: input.recalls.length
    },

    inspections: input.apk,
    defects: input.defects,
    defectDescriptions: input.defectDescriptions ?? {},
    recalls: input.recalls,
    typeApprovals: input.typeApprovals,

    raw: {
      main: input.main,
      fuel: input.fuel,
      apk: input.apk,
      defects: input.defects,
      recalls: input.recalls,
      body: input.body,
      typeApprovals: input.typeApprovals
    }
  };

  profile.enriched = enrichVehicleData(profile);
  return profile;
}
