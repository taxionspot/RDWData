import type { VehicleProfile } from "@/lib/rdw/types";
import type { Locale } from "./messages";

const fuelMapEn: Record<string, string> = {
  Benzine: "Petrol",
  Diesel: "Diesel",
  Elektriciteit: "Electricity",
  LPG: "LPG",
  Waterstof: "Hydrogen"
};

const colorMapEn: Record<string, string> = {
  BLAUW: "Blue",
  ZWART: "Black",
  WIT: "White",
  GRIJS: "Grey",
  GROEN: "Green",
  ROOD: "Red",
  GEEL: "Yellow",
  BRUIN: "Brown",
  ORANJE: "Orange",
  PAARS: "Purple",
  BEIGE: "Beige",
  ZILVER: "Silver"
};

const napVerdictEn: Record<string, string> = {
  Logisch: "Plausible",
  Onlogisch: "Implausible",
  "Geen oordeel": "No verdict"
};

const knownIssueTranslationsNl: Record<string, { title: string; advice: string; target: string; severity: string }> = {
  "Timing chain wear": {
    title: "Distributiekettingslijtage",
    advice: "Controleer op ratelend geluid bij koude start.",
    target: "Oudere VVT-i motoren",
    severity: "Gemiddeld"
  },
  "Clutch issues": {
    title: "Koppelingsproblemen",
    advice: "Controleer slijtage tijdens proefrit.",
    target: "Alle bouwjaren",
    severity: "Algemeen"
  },
  "Oil consumption TFSI": {
    title: "Olieverbruik TFSI",
    advice: "Vraag naar oliehistorie en verbruik.",
    target: "1.8 en 2.0 motoren (2008-2012)",
    severity: "Hoog"
  }
};

const repairNameNl: Record<string, string> = {
  "Brakes (discs/pads)": "Remmen (schijven/blokken)",
  "Battery replacement": "Accuvervanging",
  "Timing belt/chain": "Distributieriem/-ketting",
  "Shock absorbers": "Schokdempers"
};

function toEn(value: string | null, map: Record<string, string>): string | null {
  if (!value) return value;
  return map[value] ?? value;
}

// Fuel type can be a combined multi-fuel string ("Benzine / Elektriciteit" for a
// plug-in hybrid); translate each part so the whole label is localized.
function toEnFuel(value: string | null): string | null {
  if (!value) return value;
  return value
    .split("/")
    .map((part) => map_(part.trim()))
    .join(" / ");
}

function map_(part: string): string {
  return fuelMapEn[part] ?? part;
}

export function localizeVehicleProfile(profile: VehicleProfile, locale: Locale): VehicleProfile {
  if (locale === "nl") {
    const enriched = profile.enriched
      ? {
          ...profile.enriched,
          repairChances: profile.enriched.repairChances.map((item) => ({
            ...item,
            name: repairNameNl[item.name] ?? item.name
          })),
          knownIssues: profile.enriched.knownIssues.map((item) => {
            const mapped = knownIssueTranslationsNl[item.title];
            return mapped
              ? { ...item, title: mapped.title, advice: mapped.advice, target: mapped.target, severity: mapped.severity }
              : item;
          })
        }
      : undefined;

    return {
      ...profile,
      enriched
    };
  }

  const vehicle = {
    ...profile.vehicle,
    fuelType: toEnFuel(profile.vehicle.fuelType),
    color: {
      primary: toEn(profile.vehicle.color.primary, colorMapEn),
      secondary: toEn(profile.vehicle.color.secondary, colorMapEn)
    },
    napVerdict: toEn(profile.vehicle.napVerdict, napVerdictEn)
  };

  return {
    ...profile,
    vehicle
  };
}
