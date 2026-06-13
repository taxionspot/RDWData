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

/** Read a Socrata field tolerant of underscore-stripping in the raw JSON API. */
function field(row: RdwRecord, ...names: string[]): unknown {
  for (const n of names) {
    if (row[n] != null && row[n] !== "") return row[n];
  }
  return null;
}

/**
 * From a set of TGK rows (already filtered by typegoedkeuringsnummer), pick the
 * row whose variant + uitvoering match the main register. Falls back to the
 * first row when there is no exact match.
 */
function pickTgkRow(
  rows: RdwRecord[],
  variant: string | null,
  uitvoering: string | null,
  variantKeys: string[]
): RdwRecord | null {
  if (!rows.length) return null;
  if (variant && uitvoering) {
    const exact = rows.find(
      (r) =>
        String(field(r, ...variantKeys) ?? "") === variant &&
        String(field(r, "code_uitvoering_tgk", "codeuitvoeringtgk") ?? "") === uitvoering
    );
    if (exact) return exact;
  }
  if (variant) {
    const byVariant = rows.find((r) => String(field(r, ...variantKeys) ?? "") === variant);
    if (byVariant) return byVariant;
  }
  return rows[0];
}

/** Human transmission label (nl/en) for a raw RDW versnellingsbak code. */
function transmissionLabel(code: string | null, locale: "nl" | "en" = "nl"): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === "M") return locale === "nl" ? "Handgeschakeld" : "Manual";
  if (c === "A") return locale === "nl" ? "Automaat" : "Automatic";
  if (c === "C") return locale === "nl" ? "CVT (automaat)" : "CVT (automatic)";
  // G / F / W / O / H / D and any other documented code -> overig
  return locale === "nl" ? "Anders" : "Other";
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
  tgkGears?: RdwRecord[];
  tgkNames?: RdwRecord[];
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

  // --- TGK type-approval enrichment (transmission + factory model name) ---
  const variant = str(m.variant);
  const uitvoering = str(m.uitvoering);

  // 7rjk-eycs (gears) uses code_variant_tgk; x5v3-sewk (names) uses code_variant_gk.
  const gearsRow = pickTgkRow(
    input.tgkGears ?? [],
    variant,
    uitvoering,
    ["code_variant_tgk", "codevarianttgk"]
  );
  const nameRow = pickTgkRow(
    input.tgkNames ?? [],
    variant,
    uitvoering,
    ["code_variant_gk", "codevariantgk", "code_variant_tgk", "codevarianttgk"]
  );

  const transmissionCode = gearsRow
    ? str(field(gearsRow, "code_type_versnellingsbak", "codetypeversnellingsbak"))
    : null;
  const transmission = transmissionLabel(transmissionCode, "nl");
  const gears = gearsRow
    ? num(
        field(
          gearsRow,
          "aantal_versnellingen_boven_grens",
          "aantalversnellingenbovengrens",
          "aantal_versnellingen_onder_grens",
          "aantalversnellingenondergrens"
        )
      )
    : null;

  let factoryModelName: string | null = null;
  if (nameRow) {
    const benaming = str(field(nameRow, "handelsbenaming_fabrikant", "handelsbenamingfabrikant"));
    const typeAanduiding = str(field(nameRow, "type_aanduiding_fabrikant", "typeaanduidingfabrikant"));
    // Only append the factory type code when it adds information.
    if (benaming && typeAanduiding && typeAanduiding.toUpperCase() !== benaming.toUpperCase()) {
      factoryModelName = `${benaming} (${typeAanduiding})`;
    } else {
      factoryModelName = benaming ?? typeAanduiding;
    }
  }

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

      // Transmission & factory naming (TGK type-approval datasets)
      transmission,
      transmissionCode,
      gears,
      factoryModelName,

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
      typeApprovals: input.typeApprovals,
      tgkGears: input.tgkGears ?? [],
      tgkNames: input.tgkNames ?? []
    }
  };

  profile.enriched = enrichVehicleData(profile);
  return profile;
}
