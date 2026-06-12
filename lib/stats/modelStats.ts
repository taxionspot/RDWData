import { DATASETS, rdwSoqlCustomUrl } from "@/lib/rdw/endpoints";
import { fetchRdwDataset } from "@/lib/rdw/client";
import { connectMongo } from "@/lib/db/mongodb";
import {
  ModelStatsModel,
  type ModelStatsDoc,
  type ModelStatsTopDefect
} from "@/models/ModelStats";

const SAMPLE_LIMIT = 240;
const MIN_SAMPLE_SIZE = 5;
const BATCH_SIZE = 40;
const MAX_BATCH_CALLS = 6;
const BATCH_ROW_LIMIT = 4000;
const TOP_DEFECT_COUNT = 8;
const STATS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type ModelStats = {
  key: string;
  brand: string;
  tradeName: string;
  year: number;
  sampleSize: number;
  vehiclesWithDefects: number;
  totalDefects: number;
  topDefects: ModelStatsTopDefect[];
  computedAt: string;
};

/** Escape single quotes for SoQL string literals. */
function escapeSoql(value: string): string {
  return value.replace(/'/g, "''");
}

function toStats(
  key: string,
  brand: string,
  tradeName: string,
  year: number,
  doc: Pick<
    ModelStatsDoc,
    "sampleSize" | "vehiclesWithDefects" | "totalDefects" | "topDefects" | "computedAt"
  >
): ModelStats {
  return {
    key,
    brand,
    tradeName,
    year,
    sampleSize: doc.sampleSize,
    vehiclesWithDefects: doc.vehiclesWithDefects,
    totalDefects: doc.totalDefects,
    topDefects: (doc.topDefects ?? []).map((item) => ({
      code: item.code,
      description: item.description,
      count: item.count,
      pctOfVehicles: item.pctOfVehicles
    })),
    computedAt: new Date(doc.computedAt).toISOString()
  };
}

/** Sample up to SAMPLE_LIMIT plates of the same brand/trade name/build year. */
async function samplePlates(brand: string, tradeName: string, year: number): Promise<string[]> {
  const where =
    `merk='${escapeSoql(brand)}' AND handelsbenaming='${escapeSoql(tradeName)}'` +
    ` AND date_extract_y(datum_eerste_toelating_dt)=${year}`;
  const url = new URL(rdwSoqlCustomUrl(DATASETS.main, where, SAMPLE_LIMIT));
  url.searchParams.set("$select", "kenteken");
  const rows = await fetchRdwDataset(url.toString(), { allowErrorStatuses: [400, 404] });
  const plates = new Set<string>();
  for (const row of rows) {
    const plate = String(row.kenteken ?? "").trim().toUpperCase();
    if (plate) plates.add(plate);
  }
  return Array.from(plates);
}

/** Fetch a34c-vvps defect findings for the sampled plates in batches. */
async function fetchDefectRows(plates: string[]) {
  const batches: string[][] = [];
  for (let i = 0; i < plates.length && batches.length < MAX_BATCH_CALLS; i += BATCH_SIZE) {
    batches.push(plates.slice(i, i + BATCH_SIZE));
  }
  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        const list = batch.map((plate) => `'${escapeSoql(plate)}'`).join(",");
        return await fetchRdwDataset(
          rdwSoqlCustomUrl(DATASETS.apk, `kenteken in(${list})`, BATCH_ROW_LIMIT),
          { allowErrorStatuses: [400, 404] }
        );
      } catch {
        return [];
      }
    })
  );
  return results.flat();
}

/** Fetch human-readable descriptions for the given defect codes (tbph-ct3j). */
async function fetchDescriptions(codes: string[]): Promise<Record<string, string>> {
  if (codes.length === 0) return {};
  try {
    const list = codes.map((code) => `'${escapeSoql(code)}'`).join(",");
    const rows = await fetchRdwDataset(
      rdwSoqlCustomUrl(DATASETS.defectDescriptions, `gebrek_identificatie in(${list})`, 100),
      { allowErrorStatuses: [400, 404] }
    );
    const map: Record<string, string> = {};
    for (const row of rows) {
      if (row.gebrek_identificatie && row.gebrek_omschrijving) {
        map[String(row.gebrek_identificatie)] = String(row.gebrek_omschrijving);
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Computes real APK defect statistics for a brand/trade name/build year cohort
 * from RDW open data, with a 30-day Mongo cache.
 * Never throws: returns null on any failure or when the sample is too small.
 */
export async function getModelStats(
  brand: string | null | undefined,
  tradeName: string | null | undefined,
  year: number | null | undefined
): Promise<ModelStats | null> {
  try {
    const merk = String(brand ?? "").trim().toUpperCase();
    const handelsbenaming = String(tradeName ?? "").trim().toUpperCase();
    const bouwjaar = Number(year);
    if (!merk || !handelsbenaming || !Number.isInteger(bouwjaar) || bouwjaar < 1900 || bouwjaar > 2100) {
      return null;
    }
    const key = `${merk}|${handelsbenaming}|${bouwjaar}`;
    const now = Date.now();

    // --- Cache read ---
    try {
      await connectMongo();
      const cached = await ModelStatsModel.findById(key).lean<ModelStatsDoc | null>();
      if (cached && new Date(cached.expiresAt).getTime() > now) {
        return toStats(key, merk, handelsbenaming, bouwjaar, cached);
      }
    } catch (error) {
      console.warn("Model stats cache read unavailable; computing live.", error);
    }

    // --- Sample plates from the vehicle registry ---
    const plates = await samplePlates(merk, handelsbenaming, bouwjaar);
    if (plates.length < MIN_SAMPLE_SIZE) return null;

    // --- Aggregate defect findings per plate ---
    const sampled = new Set(plates);
    const vehiclesWithDefects = new Set<string>();
    const platesByDefect = new Map<string, Set<string>>();
    let totalDefects = 0;

    const defectRows = await fetchDefectRows(plates);
    for (const row of defectRows) {
      const plate = String(row.kenteken ?? "").trim().toUpperCase();
      if (!plate || !sampled.has(plate)) continue;
      const code = String(row.gebrek_identificatie ?? "").trim();
      if (!code) continue;
      vehiclesWithDefects.add(plate);
      const reported = Number(row.aantal_gebreken_geconstateerd);
      totalDefects += Number.isFinite(reported) && reported > 0 ? reported : 1;
      const set = platesByDefect.get(code) ?? new Set<string>();
      set.add(plate);
      platesByDefect.set(code, set);
    }

    // --- Top defects by number of unique vehicles affected ---
    const top = Array.from(platesByDefect.entries())
      .map(([code, set]) => ({ code, vehicles: set.size }))
      .sort((a, b) => b.vehicles - a.vehicles)
      .slice(0, TOP_DEFECT_COUNT);

    const descriptions = await fetchDescriptions(top.map((item) => item.code));
    const topDefects: ModelStatsTopDefect[] = top.map((item) => ({
      code: item.code,
      description: descriptions[item.code] ?? item.code,
      count: item.vehicles,
      pctOfVehicles: Math.round((item.vehicles / plates.length) * 1000) / 10
    }));

    const doc = {
      sampleSize: plates.length,
      vehiclesWithDefects: vehiclesWithDefects.size,
      totalDefects,
      topDefects,
      computedAt: new Date(now)
    };

    // --- Cache write (best-effort) ---
    try {
      await connectMongo();
      await ModelStatsModel.findByIdAndUpdate(
        key,
        { _id: key, ...doc, expiresAt: new Date(now + STATS_TTL_MS) },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      console.warn("Model stats cache write skipped.", error);
    }

    return toStats(key, merk, handelsbenaming, bouwjaar, doc);
  } catch (error) {
    console.warn("Model stats computation failed.", error);
    return null;
  }
}
