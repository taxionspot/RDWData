import {
  rdwUrl,
  rdwSoqlUrl,
  rdwSoqlCustomUrl,
  rdwTgkUrl,
  DATASETS,
  NON_PLATE_FILTERABLE_DATASETS
} from "@/lib/rdw/endpoints";
import { fetchRdwDataset } from "@/lib/rdw/client";
import { toVehicleProfile } from "@/lib/rdw/mapper";
import { connectMongo } from "@/lib/db/mongodb";
import { VehicleCacheModel } from "@/models/VehicleCache";
import type { VehicleCacheDoc } from "@/models/VehicleCache";
import type { RdwRecord, VehicleProfile } from "@/lib/rdw/types";
import { ApiError } from "@/lib/api/api-error";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REVALIDATE_COOLDOWN_MS = 15 * 60 * 1000;
const lastRevalidateByPlate = new Map<string, number>();

export type PlateLookupDatasetKey =
  | "main" | "fuel" | "apk" | "defects" | "recalls" | "body" | "typeApprovals";

type PlateLookupOptions = {
  allowErrorStatuses?: number[];
  returnEmptyIfNotPlateFilterable?: boolean;
};

/**
 * Re-hydrate a cached profile by re-running the mapper over its raw data.
 * This ensures any mapper improvements apply automatically without clearing cache.
 */
function rehydrateFromRaw(plate: string, cachedData: Partial<VehicleProfile>): VehicleProfile {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = cachedData.raw ?? ({} as any);
  return toVehicleProfile({
    plate,
    fromCache: true,
    defectDescriptions: cachedData.defectDescriptions ?? {},
    main: raw.main ?? [],
    fuel: raw.fuel ?? [],
    apk: raw.apk ?? [],
    defects: raw.defects ?? [],
    recalls: raw.recalls ?? [],
    body: raw.body ?? [],
    typeApprovals: raw.typeApprovals ?? [],
    tgkGears: raw.tgkGears ?? [],
    tgkNames: raw.tgkNames ?? []
  });
}

function withProfileDefaults(profile: Partial<VehicleProfile>): VehicleProfile {
  const raw = profile.raw ?? ({} as VehicleProfile["raw"]);
  const v = profile.vehicle ?? ({} as VehicleProfile["vehicle"]);
  return {
    plate: profile.plate ?? "",
    displayPlate: profile.displayPlate ?? profile.plate ?? "",
    fromCache: Boolean(profile.fromCache),
    vehicle: {
      brand: v.brand ?? null,
      tradeName: v.tradeName ?? null,
      typeCode: v.typeCode ?? null,
      variant: v.variant ?? null,
      uitvoering: v.uitvoering ?? null,
      year: v.year ?? null,
      color: {
        primary: v.color?.primary ?? null,
        secondary: v.color?.secondary ?? null
      },
      bodyType: v.bodyType ?? null,
      doors: v.doors ?? null,
      seats: v.seats ?? null,
      axles: v.axles ?? null,
      fuelType: v.fuelType ?? null,
      co2: v.co2 ?? null,
      energyLabel: v.energyLabel ?? null,
      consumptionCombined: v.consumptionCombined ?? null,
      emissionStandard: v.emissionStandard ?? null,

      transmission: v.transmission ?? null,
      transmissionCode: v.transmissionCode ?? null,
      gears: v.gears ?? null,
      factoryModelName: v.factoryModelName ?? null,

      engine: {
        displacement: v.engine?.displacement ?? null,
        cylinders: v.engine?.cylinders ?? null,
        powerKw: v.engine?.powerKw ?? null
      },
      dimensions: {
        wheels: v.dimensions?.wheels ?? null,
        wheelbase: v.dimensions?.wheelbase ?? null,
        length: v.dimensions?.length ?? null,
        width: v.dimensions?.width ?? null,
        height: v.dimensions?.height ?? null
      },
      weight: {
        empty: v.weight?.empty ?? null,
        max: v.weight?.max ?? null,
        payload: v.weight?.payload ?? null,
        readyToDrive: v.weight?.readyToDrive ?? null,
        powerToMassRatio: v.weight?.powerToMassRatio ?? null
      },
      apkExpiryDate: v.apkExpiryDate ?? null,
      owners: { count: v.owners?.count ?? null },
      firstRegistrationNL: v.firstRegistrationNL ?? null,
      firstRegistrationWorld: v.firstRegistrationWorld ?? null,
      wok: Boolean(v.wok),
      exportIndicator: Boolean(v.exportIndicator),
      transferPossible: Boolean(v.transferPossible),
      insured: Boolean(v.insured),
      isTaxi: Boolean(v.isTaxi),
      hasOpenRecall: Boolean(v.hasOpenRecall),
      napVerdict: v.napVerdict ?? null,
      napLastYear: v.napLastYear ?? null,
      cataloguePrice: v.cataloguePrice ?? null,
      recallsCount: v.recallsCount ?? 0
    },
    inspections: profile.inspections ?? [],
    defects: profile.defects ?? raw.defects ?? [],
    defectDescriptions: profile.defectDescriptions ?? {},
    recalls: profile.recalls ?? [],
    typeApprovals: profile.typeApprovals ?? [],
    raw: {
      main: raw.main ?? [],
      fuel: raw.fuel ?? [],
      apk: raw.apk ?? [],
      defects: raw.defects ?? [],
      recalls: raw.recalls ?? [],
      body: raw.body ?? [],
      typeApprovals: raw.typeApprovals ?? [],
      tgkGears: raw.tgkGears ?? [],
      tgkNames: raw.tgkNames ?? []
    }
  };
}

export async function getRdwDatasetByPlate(
  dataset: PlateLookupDatasetKey,
  plate: string,
  options?: PlateLookupOptions
): Promise<RdwRecord[]> {
  const datasetId = DATASETS[dataset as keyof typeof DATASETS];
  if (NON_PLATE_FILTERABLE_DATASETS.has(datasetId)) {
    if (options?.returnEmptyIfNotPlateFilterable) return [];
    throw new ApiError(
      422,
      "DATASET_NOT_PLATE_FILTERABLE",
      `Dataset '${dataset}' is not directly searchable by kenteken.`
    );
  }
  return fetchRdwDataset(rdwUrl(datasetId, plate), options);
}

/**
 * Fetches recall campaigns for a plate using SoQL ($where) because the
 * af5r-44mf dataset rejects simple ?kenteken= queries with 400.
 * Returns [] on any error (recalls are best-effort).
 */
async function fetchRecallsSafe(plate: string): Promise<RdwRecord[]> {
  try {
    return await fetchRdwDataset(
      rdwSoqlUrl(DATASETS.recalls, plate),
      { allowErrorStatuses: [400, 404] }
    );
  } catch {
    return [];
  }
}

/**
 * Fetches EU type-approval data for a plate.
 * 55kv-xf7m may return 404 for some plates — treat as empty.
 */
async function fetchTypeApprovalsSafe(plate: string): Promise<RdwRecord[]> {
  try {
    return await fetchRdwDataset(
      rdwUrl(DATASETS.typeApprovals, plate),
      { allowErrorStatuses: [400, 404] }
    );
  } catch {
    return [];
  }
}

/**
 * Second-stage TGK fetch: transmission/gears (7rjk-eycs) and factory model
 * name (x5v3-sewk), keyed by typegoedkeuringsnummer (NOT kenteken).
 * Fully best-effort: any error returns empty arrays so the main profile is never broken.
 */
async function fetchTgkSafe(typeApprovalNumber: string): Promise<{
  tgkGears: RdwRecord[];
  tgkNames: RdwRecord[];
}> {
  try {
    const [tgkGears, tgkNames] = await Promise.all([
      fetchRdwDataset(rdwTgkUrl(DATASETS.tgkGears, typeApprovalNumber), {
        allowErrorStatuses: [400, 404]
      }).catch(() => []),
      fetchRdwDataset(rdwTgkUrl(DATASETS.tgkNames, typeApprovalNumber), {
        allowErrorStatuses: [400, 404]
      }).catch(() => [])
    ]);
    return { tgkGears, tgkNames };
  } catch {
    return { tgkGears: [], tgkNames: [] };
  }
}

/**
 * Fetches defect descriptions for the given unique set of defect identification codes.
 * Datasets: tbph-ct3j
 */
async function fetchDefectDescriptionsSafe(codes: string[]): Promise<Record<string, string>> {
  if (codes.length === 0) return {};
  try {
    const list = codes.map((c) => `'${c}'`).join(",");
    const data = await fetchRdwDataset(
      rdwSoqlCustomUrl(DATASETS.defectDescriptions, `gebrek_identificatie in (${list})`, 100),
      { allowErrorStatuses: [400, 404] }
    );
    const map: Record<string, string> = {};
    for (const item of data) {
      if (item.gebrek_identificatie && item.gebrek_omschrijving) {
        map[String(item.gebrek_identificatie)] = String(item.gebrek_omschrijving);
      }
    }
    return map;
  } catch (err) {
    console.warn("Failed to fetch defect descriptions", err);
    return {};
  }
}

async function fetchAndCacheLiveProfile(plate: string, now: number): Promise<VehicleProfile> {
  // --- Live fetch: 7 datasets fetched in parallel ---
  const [main, fuel, apk, defects, recalls, body, typeApprovals] = await Promise.all([
    getRdwDatasetByPlate("main", plate),
    getRdwDatasetByPlate("fuel", plate),
    getRdwDatasetByPlate("apk", plate),
    getRdwDatasetByPlate("defects", plate, { returnEmptyIfNotPlateFilterable: true }),
    fetchRecallsSafe(plate),
    getRdwDatasetByPlate("body", plate),
    fetchTypeApprovalsSafe(plate)
  ]);

  // Extract all unique defect codes to fetch their descriptions
  const defectCodes = new Set<string>();
  for (const item of apk) if (item.gebrek_identificatie) defectCodes.add(String(item.gebrek_identificatie));
  for (const item of defects) if (item.gebrek_identificatie) defectCodes.add(String(item.gebrek_identificatie));

  // Second-stage TGK lookup needs the type-approval number from the main row.
  // Only ~77% of vehicles carry an EU type-approval number; skip cleanly otherwise.
  const typeApprovalNumber = String(main[0]?.typegoedkeuringsnummer ?? "").trim();

  const [defectDescriptions, tgk] = await Promise.all([
    fetchDefectDescriptionsSafe(Array.from(defectCodes)),
    typeApprovalNumber
      ? fetchTgkSafe(typeApprovalNumber)
      : Promise.resolve({ tgkGears: [] as RdwRecord[], tgkNames: [] as RdwRecord[] })
  ]);

  const profile = toVehicleProfile({
    plate, fromCache: false,
    defectDescriptions,
    main, fuel, apk, defects, recalls, body, typeApprovals,
    tgkGears: tgk.tgkGears, tgkNames: tgk.tgkNames
  });

  // --- Cache write ---
  try {
    await connectMongo();
    await VehicleCacheModel.findByIdAndUpdate(
      plate,
      { _id: plate, data: profile, cachedAt: new Date(now), expiresAt: new Date(now + CACHE_TTL_MS) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    console.warn("Vehicle cache write skipped.", error);
  }

  return profile;
}

export async function getVehicleProfile(plate: string): Promise<VehicleProfile> {
  const now = Date.now();

  // --- Cache read ---
  try {
    await connectMongo();
    const cached = await VehicleCacheModel.findById(plate).lean<VehicleCacheDoc | null>();
    if (cached && cached.expiresAt?.getTime() > now) {
      // Trigger background revalidation with cooldown to avoid repeated retries
      // when upstream RDW has temporary 5xx instability.
      const lastRevalidate = lastRevalidateByPlate.get(plate) ?? 0;
      if (now - lastRevalidate >= REVALIDATE_COOLDOWN_MS) {
        lastRevalidateByPlate.set(plate, now);
        fetchAndCacheLiveProfile(plate, now).catch((err) => {
          console.warn(`Background revalidation skipped due to upstream failure for plate ${plate}`, err);
        });
      }

      const cachedData = cached.data as Partial<VehicleProfile>;
      const raw = cachedData.raw;
      if (raw?.main?.length) {
        return { ...rehydrateFromRaw(plate, cachedData), fromCache: true };
      }
      return { ...withProfileDefaults(cachedData), fromCache: true };
    }
  } catch (error) {
    console.warn("Vehicle cache read unavailable; falling back to live RDW fetch.", error);
  }

  // Fallback to synchronous fetching if no cache exists
  return fetchAndCacheLiveProfile(plate, now);
}
