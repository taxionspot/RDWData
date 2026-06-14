import { wrapAffiliate } from "./deeplinks";

/**
 * A normalized "comparable car for sale" used by the report's listings cards.
 * Sourced from the Gaspedaal Apify actor (NL aggregator), which returns a photo,
 * price, mileage, year and a deeplink to the original listing.
 */
export type ComparableCar = {
  title: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  priceEur: number | null;
  mileageKm: number | null;
  fuelType: string | null;
  bodyType: string | null;
  city: string | null;
  region: string | null;
  imageUrl: string | null;
  sourceUrl: string | null; // deeplink to the real source listing (autotrack.nl etc.)
  source: string | null; // e.g. "gaspedaal.nl"
};

// Apify actor id (slash replaced by ~ for the REST path).
const ACTOR = "unfenced-group~gaspedaal-nl-scraper";

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function normalize(item: Record<string, unknown>): ComparableCar | null {
  const sourceUrl = str(item.sourceListingUrl) ?? str(item.url);
  const title = str(item.title);
  if (!sourceUrl && !title) return null;
  return {
    title,
    brand: str(item.brand),
    model: str(item.model),
    year: num(item.year),
    priceEur: num(item.priceEur) ?? num(item.price),
    mileageKm: num(item.mileageKm),
    fuelType: str(item.fuelType),
    bodyType: str(item.bodyType),
    city: str(item.sellerCity) ?? str(item.city),
    region: str(item.sellerRegion),
    imageUrl: str(item.imageUrl),
    sourceUrl: sourceUrl ? wrapAffiliate(sourceUrl) : null,
    source: str(item.source)
  };
}

/**
 * Fetch a pool of NL listings for a make/model from the Gaspedaal Apify actor.
 * Returns [] when APIFY_TOKEN is missing or anything fails (timeout, error, bad
 * shape), so callers fall back to plain marketplace deeplinks. The actor has no
 * price/year filter, so we fetch by brand+model and rank by similarity upstream.
 */
export async function fetchComparablePool(brand: string, model: string, maxResults = 12): Promise<ComparableCar[]> {
  const token = (process.env.APIFY_TOKEN || "").trim();
  if (!token || !brand || !model) return [];
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand: brand.toLowerCase(), model: model.toLowerCase(), maxResults }),
      signal: controller.signal
    });
    if (!res.ok) return [];
    const items = (await res.json()) as unknown;
    if (!Array.isArray(items)) return [];
    return items
      .map((it) => normalize(it as Record<string, unknown>))
      .filter((c): c is ComparableCar => c !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Diagnostic probe (no secrets in output): reports whether APIFY_TOKEN is
 * present, the raw Apify HTTP status, item count and a short body snippet, so we
 * can tell "token not active" from "actor returned nothing / needs renting".
 * Used by the comparable route's ?debug=1 branch; remove once verified live.
 */
export async function probeComparable(
  brand: string,
  model: string
): Promise<{ hasToken: boolean; status: number | null; count: number; snippet: string }> {
  const token = (process.env.APIFY_TOKEN || "").trim();
  if (!token) return { hasToken: false, status: null, count: 0, snippet: "" };
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand: brand.toLowerCase(), model: model.toLowerCase(), maxResults: 10 }),
      signal: controller.signal
    });
    const body = await res.text();
    let count = 0;
    try {
      const j = JSON.parse(body);
      if (Array.isArray(j)) count = j.length;
    } catch {
      // non-json body
    }
    return { hasToken: true, status: res.status, count, snippet: body.slice(0, 300) };
  } catch (e) {
    return { hasToken: true, status: null, count: 0, snippet: e instanceof Error ? e.message : "error" };
  } finally {
    clearTimeout(timer);
  }
}
