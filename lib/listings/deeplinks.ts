/**
 * Builds outbound deep-links to pre-filtered "same car for sale" searches on the
 * big NL marketplaces. We only generate URLs to public search pages (legal, no
 * scraping, no listing data copied into our report). All URL patterns live here
 * so link rot is fixable in one place, and an affiliate wrapper can be added in
 * wrapAffiliate() once an affiliate-network account exists.
 */

import { normalizeFuel, KM_BAND_PCT, KM_BAND_FLOOR } from "./comparable";

export type ListingVehicle = {
  brand: string | null;
  model: string | null; // RDW tradeName
  year: number | null;
  estValue: number | null; // enriched.estimatedValueNow
  /** enriched.estimatedMileageNow - used for km-band deeplinks */
  mileage?: number | null;
  /** vehicle.fuelType - used for fuel filter deeplinks */
  fuelType?: string | null;
};

export type ListingProvider = "AutoScout24" | "Marktplaats" | "Gaspedaal";
export type ListingLink = { provider: ListingProvider; url: string };

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A generous +/-20% band around our estimate, rounded to tidy steps of 500. */
function priceBand(estValue: number | null): { min: number; max: number } | null {
  if (!estValue || estValue <= 0) return null;
  const round500 = (n: number) => Math.max(500, Math.round(n / 500) * 500);
  return { min: round500(estValue * 0.8), max: round500(estValue * 1.2) };
}

/**
 * Mileage band for deeplink filters: +/- max(40%, 40000 km), rounded to 5000.
 * Matches the KM_BAND_PCT / KM_BAND_FLOOR constants from comparable.ts.
 */
function kmBand(mileage: number | null | undefined): { min: number; max: number } | null {
  if (!mileage || mileage <= 0) return null;
  const round5000 = (n: number) => Math.max(0, Math.round(n / 5000) * 5000);
  const delta = Math.max(KM_BAND_PCT * mileage, KM_BAND_FLOOR);
  return { min: round5000(mileage - delta), max: round5000(mileage + delta) };
}

/**
 * Wrap an outbound URL for affiliate tracking. No-op until an affiliate program
 * (e.g. TradeTracker/Awin) is connected; then route through the network's
 * tracking template here so every link earns commission with one change.
 */
export function wrapAffiliate(url: string): string {
  return url;
}

/** Tier 0: the exact car (make + model), price-banded and optionally km/fuel filtered. */
export function buildExactLinks(v: ListingVehicle): ListingLink[] {
  if (!v.brand || !v.model) return [];
  const mk = slug(v.brand);
  const md = slug(v.model);
  const band = priceBand(v.estValue);
  const km = kmBand(v.mileage);
  const fuelToken = normalizeFuel(v.fuelType ?? null);
  const links: ListingLink[] = [];

  const as24 = new URLSearchParams();
  if (band) {
    as24.set("pricefrom", String(band.min));
    as24.set("priceto", String(band.max));
  }
  if (km) {
    as24.set("kmfrom", String(km.min));
    as24.set("kmto", String(km.max));
  }
  // AutoScout24 fuel param: "B"=petrol, "D"=diesel, "E"=ev, "H"=hybrid, "L"=lpg
  const as24FuelMap: Record<string, string> = { petrol: "B", diesel: "D", ev: "E", hybrid: "H", lpg: "L" };
  if (fuelToken && as24FuelMap[fuelToken]) as24.set("fuel", as24FuelMap[fuelToken]);
  as24.set("sort", "price");
  as24.set("desc", "0");
  links.push({ provider: "AutoScout24", url: `https://www.autoscout24.nl/lst/${mk}/${md}?${as24.toString()}` });

  // Marktplaats: forgiving keyword search inside the cars category.
  links.push({
    provider: "Marktplaats",
    url: `https://www.marktplaats.nl/l/auto-s/q/${encodeURIComponent(`${v.brand} ${v.model}`)}/`
  });

  const gp = new URLSearchParams();
  if (band) {
    gp.set("pmin", String(band.min));
    gp.set("pmax", String(band.max));
  }
  if (km) {
    gp.set("kmin", String(km.min));
    gp.set("kmax", String(km.max));
  }
  // Gaspedaal fuel param: "benzine", "diesel", "elektrisch", "hybride", "lpg"
  const gpFuelMap: Record<string, string> = { petrol: "benzine", diesel: "diesel", ev: "elektrisch", hybrid: "hybride", lpg: "lpg" };
  if (fuelToken && gpFuelMap[fuelToken]) gp.set("brandstof", gpFuelMap[fuelToken]);
  const gpQuery = gp.toString();
  links.push({ provider: "Gaspedaal", url: `https://www.gaspedaal.nl/${mk}/${md}${gpQuery ? `?${gpQuery}` : ""}` });

  return links.map((l) => ({ ...l, url: wrapAffiliate(l.url) }));
}

/** Tier 2: alternatives, same make + price band (model dropped). */
export function buildAlternativeLinks(v: ListingVehicle): ListingLink[] {
  if (!v.brand) return [];
  const mk = slug(v.brand);
  const band = priceBand(v.estValue);
  const links: ListingLink[] = [];

  const as24 = new URLSearchParams();
  if (band) {
    as24.set("pricefrom", String(band.min));
    as24.set("priceto", String(band.max));
  }
  links.push({ provider: "AutoScout24", url: `https://www.autoscout24.nl/lst/${mk}?${as24.toString()}` });

  links.push({ provider: "Marktplaats", url: `https://www.marktplaats.nl/l/auto-s/${mk}/` });

  const gp = new URLSearchParams();
  if (band) {
    gp.set("pmin", String(band.min));
    gp.set("pmax", String(band.max));
  }
  const gpQuery = gp.toString();
  links.push({ provider: "Gaspedaal", url: `https://www.gaspedaal.nl/${mk}${gpQuery ? `?${gpQuery}` : ""}` });

  return links.map((l) => ({ ...l, url: wrapAffiliate(l.url) }));
}
