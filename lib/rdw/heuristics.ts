import { VehicleProfile } from "@/lib/rdw/types";
import { parseISO, differenceInMonths, differenceInYears } from "date-fns";

export type MarketValueConfidence = "HIGH" | "MEDIUM" | "LOW";
export type MileageVerdict = "LOGISCH" | "TWIJFELACHTIG" | "ONLOGISCH" | "UNKNOWN";

export type MileageAnomaly = {
  type: "ROLLBACK" | "LOW_USAGE" | "HIGH_USAGE" | "OUTLIER";
  severity: "HIGH" | "MEDIUM" | "LOW";
  message: string;
};

export type EnrichedData = {
  ageInMonths: number | null;
  ageString: string | null;
  isImported: boolean;
  maintenanceRiskScore: number; // 1.0 to 10.0

  estimatedValueNow: number | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  estimatedValueNextYear: number | null;
  marketValueConfidence: MarketValueConfidence | null;
  marketValueSe: number | null;
  marketValueCondition: MarketValueCondition | null;

  estimatedMileageNow: number | null;
  estimatedMileageMin: number | null;
  estimatedMileageMax: number | null;
  mileageVerdict: MileageVerdict;
  mileageUsageProfile: string | null;
  mileageSlopeKmPerYear: number | null;
  mileageAnomalies: MileageAnomaly[];

  apkPassChance: number; // Percentage 0-100
  repairChances: { name: string; chance: number; estMin: number; estMax: number }[];
  roadTaxEstQuarter: { min: number; max: number } | null;
  insuranceEstMonth: number | null;
  fuelEstMonth: number | null;
  knownIssues: { title: string; severity: string; target: string; advice: string }[];
};

type MileagePoint = { date: Date; t: number; km: number };

export type MarketValueResult = {
  value: number | null;
  min: number | null;
  max: number | null;
  se: number | null;
  confidence: MarketValueConfidence | null;
};

// Condition/history discount derived from free RDW signals (odometer integrity,
// WOK, import, owners, APK, recalls). Computed once from the raw (untranslated)
// vehicle data so it can be applied consistently wherever the value is (re)computed.
export type MarketValueCondition = {
  factor: number;              // multiplicative adjustment to the value (<= 1)
  extraSe: number;             // extra standard error from condition uncertainty
  forceLowConfidence: boolean; // hard-cap confidence to LOW (e.g. odometer fraud)
  reasons: string[];           // why the value was adjusted
};

const BRAND_OFFSETS: Record<string, number> = {
  FERRARI: 0.20,
  BENTLEY: 0.10,
  "ASTON MARTIN": 0.08,
  LAMBORGHINI: 0.18,
  "ROLLS ROYCE": 0.10,
  MORGAN: 0.08,
  PORSCHE: 0.14,
  MCLAREN: 0.12,
  LOTUS: 0.06,
  CATERHAM: 0.05,
  MASERATI: -0.05,
  TOYOTA: 0.09,
  HONDA: 0.04,
  NISSAN: -0.05,
  LEXUS: 0.08,
  SUBARU: 0.04,
  MITSUBISHI: -0.06,
  MAZDA: 0.05,
  SUZUKI: 0.04,
  INFINITI: -0.04,
  DAIHATSU: -0.04,
  ISUZU: -0.06,
  GENESIS: 0.03,
  KIA: 0.02,
  HYUNDAI: 0.01,
  SSANGYONG: -0.08,
  BMW: 0.02,
  VOLKSWAGEN: 0.01,
  VW: 0.01,
  SEAT: -0.04,
  "MERCEDES BENZ": 0.02,
  MERCEDES: 0.02,
  MINI: 0.01,
  OPEL: -0.05,
  AUDI: 0.01,
  CUPRA: -0.02,
  SMART: -0.06,
  SKODA: 0.00,
  ALPINE: 0.04,
  DACIA: -0.03,
  CITROEN: -0.05,
  DS: -0.02,
  RENAULT: -0.04,
  PEUGEOT: -0.03,
  "ALFA ROMEO": -0.08,
  FIAT: -0.07,
  LANCIA: -0.10,
  ABARTH: -0.04,
  JAGUAR: 0.02,
  "LAND ROVER": 0.05,
  MG: -0.10,
  ROVER: -0.10,
  VOLVO: 0.03,
  POLESTAR: -0.05,
  SAAB: -0.06,
  TESLA: 0.06,
  JEEP: -0.06,
  CADILLAC: -0.08,
  FORD: -0.02,
  CHRYSLER: -0.12,
  LINCOLN: -0.10,
  LUCID: -0.04,
  DODGE: -0.08,
  FISKER: -0.25,
  RIVIAN: -0.05,
  CHEVROLET: -0.06,
  "LYNK AND CO": -0.08,
  LEAPMOTOR: -0.15,
  ZEEKR: -0.08,
  NIO: -0.12,
  DONGFENG: -0.15,
  BYD: -0.07,
  XPENG: -0.12,
  AIWAYS: -0.18,
  "ORA GWM": -0.12,
  SERES: -0.20,
  MAXUS: -0.12
};

function normalizeBrand(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[./]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBrandOffset(brand: string | null | undefined) {
  const normalized = normalizeBrand(brand);
  if (!normalized) return { offset: 0, known: false };
  if (BRAND_OFFSETS[normalized] != null) return { offset: BRAND_OFFSETS[normalized], known: true };
  const fallback = normalized
    .replace(/\bAUTO\b/g, "")
    .replace(/\bMOTORS?\b/g, "")
    .replace(/\bGROUP\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (BRAND_OFFSETS[fallback] != null) return { offset: BRAND_OFFSETS[fallback], known: true };
  if (fallback.startsWith("MERCEDES")) return { offset: BRAND_OFFSETS["MERCEDES BENZ"], known: true };
  if (fallback.includes("VOLKSWAGEN")) return { offset: BRAND_OFFSETS.VOLKSWAGEN, known: true };
  if (fallback === "VW") return { offset: BRAND_OFFSETS.VW, known: true };
  if (fallback.includes("LANDROVER")) return { offset: BRAND_OFFSETS["LAND ROVER"], known: true };
  if (fallback.includes("ALFAROMEO")) return { offset: BRAND_OFFSETS["ALFA ROMEO"], known: true };
  if (fallback.includes("LYNK")) return { offset: BRAND_OFFSETS["LYNK AND CO"], known: true };
  if (fallback.includes("ORA")) return { offset: BRAND_OFFSETS["ORA GWM"], known: true };
  return { offset: 0, known: false };
}

function normalizeDateString(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (value.includes("T")) return value.split("T")[0];
  return value;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const normalized = normalizeDateString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMileage(record: Record<string, unknown>): number | null {
  const candidates = [
    record.tellerstand,
    record.km_stand,
    record.kilometerstand,
    record.mileage,
    record.odo_reading
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function parseInspectionDate(record: Record<string, unknown>): Date | null {
  const candidates = [
    record.datum_keuring,
    record.datum_keuring_dt,
    record.meld_datum_door_keuringsinstantie,
    record.datum,
    record.datum_dt
  ];
  for (const value of candidates) {
    const parsed = parseDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function toYears(date: Date, origin: Date): number {
  return Math.max((date.getTime() - origin.getTime()) / (1000 * 60 * 60 * 24 * 365.25), 0);
}

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getMileagePoints(profile: VehicleProfile, registrationDate: Date | null): MileagePoint[] {
  const points: MileagePoint[] = [];
  if (!registrationDate) return points;

  for (const record of profile.inspections ?? []) {
    const km = parseMileage(record);
    const date = parseInspectionDate(record);
    if (!date || km == null) continue;
    const t = toYears(date, registrationDate);
    if (t < 0) continue;
    points.push({ date, t, km });
  }

  points.sort((a, b) => a.date.getTime() - b.date.getTime());
  return points;
}

function estimateMileage(profile: VehicleProfile, registrationDate: Date | null) {
  const anomalies: MileageAnomaly[] = [];
  const points = getMileagePoints(profile, registrationDate);

  const basePoints = registrationDate ? [{ date: registrationDate, t: 0, km: 0 }] : [];
  const dataPoints = [...basePoints, ...points];

  if (dataPoints.length < 2) {
    const latest = points.length ? points[points.length - 1].km : null;
    return {
      estimatedMileageNow: latest,
      estimatedMileageMin: null,
      estimatedMileageMax: null,
      mileageVerdict: "UNKNOWN" as MileageVerdict,
      mileageUsageProfile: null,
      mileageSlopeKmPerYear: null,
      mileageAnomalies: [] as MileageAnomaly[],
      latestMileage: latest
    };
  }

  const tmax = Math.max(...dataPoints.map((p) => p.t));
  const L = 0.15;

  let Sw = 0;
  let Swt = 0;
  let Swt2 = 0;
  let Swk = 0;
  let Swtk = 0;

  for (const point of dataPoints) {
    const w = Math.exp(-L * (tmax - point.t));
    Sw += w;
    Swt += w * point.t;
    Swt2 += w * point.t * point.t;
    Swk += w * point.km;
    Swtk += w * point.t * point.km;
  }

  const denominator = Sw * Swt2 - Swt * Swt;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-6) {
    const latest = points.length ? points[points.length - 1].km : null;
    return {
      estimatedMileageNow: latest,
      estimatedMileageMin: null,
      estimatedMileageMax: null,
      mileageVerdict: "UNKNOWN" as MileageVerdict,
      mileageUsageProfile: null,
      mileageSlopeKmPerYear: null,
      mileageAnomalies: [] as MileageAnomaly[],
      latestMileage: latest
    };
  }

  const b = (Sw * Swtk - Swt * Swk) / denominator;
  const a = (Swk * Swt2 - Swtk * Swt) / denominator;

  const today = new Date();
  const ttoday = registrationDate ? toYears(today, registrationDate) : tmax;
  const rawEst = a + b * ttoday;
  const estimatedMileageNow = Math.max(0, roundTo(rawEst, 500));

  let rmse = null as number | null;
  if (Sw > 2) {
    let weightedResidual = 0;
    for (const point of dataPoints) {
      const w = Math.exp(-L * (tmax - point.t));
      const predicted = a + b * point.t;
      const resid = point.km - predicted;
      weightedResidual += w * resid * resid;
    }
    rmse = Math.sqrt(weightedResidual / (Sw - 2));
  }

  let estimatedMileageMin = null as number | null;
  let estimatedMileageMax = null as number | null;
  if (rmse != null && Number.isFinite(rmse)) {
    const n = dataPoints.length;
    const tmean = Swt / Sw;
    const Stt = dataPoints.reduce((sum, point) => {
      const w = Math.exp(-L * (tmax - point.t));
      return sum + w * Math.pow(point.t - tmean, 2);
    }, 0);

    if (Stt > 0) {
      let sePred = rmse * Math.sqrt(1 + 1 / n + Math.pow(ttoday - tmean, 2) / Stt);
      const extrap = ttoday - tmax;
      if (extrap > 2) {
        sePred *= 1 + 0.1 * (extrap - 2);
      }
      estimatedMileageMin = Math.max(0, roundTo(estimatedMileageNow - 1.28 * sePred, 500));
      estimatedMileageMax = Math.max(0, roundTo(estimatedMileageNow + 1.28 * sePred, 500));
    }
  }

  const sortedPoints = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (let i = 1; i < sortedPoints.length; i += 1) {
    const prev = sortedPoints[i - 1];
    const current = sortedPoints[i];
    if (current.km < prev.km) {
      anomalies.push({
        type: "ROLLBACK",
        severity: "HIGH",
        message: "Mileage decreased between inspections."
      });
      break;
    }
  }

  for (let i = 1; i < sortedPoints.length; i += 1) {
    const prev = sortedPoints[i - 1];
    const current = sortedPoints[i];
    const years = Math.max((current.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60 * 24 * 365.25), 0);
    if (years < 0.5) continue;
    const slope = (current.km - prev.km) / years;
    if (slope < 3000) {
      anomalies.push({
        type: "LOW_USAGE",
        severity: "MEDIUM",
        message: "Usage below 3,000 km/year for more than 6 months."
      });
      break;
    }
    if (slope > 60000) {
      anomalies.push({
        type: "HIGH_USAGE",
        severity: "MEDIUM",
        message: "Usage above 60,000 km/year for more than 6 months."
      });
      break;
    }
  }

  if (rmse != null && Number.isFinite(rmse)) {
    for (const point of dataPoints) {
      const predicted = a + b * point.t;
      const resid = point.km - predicted;
      if (Math.abs(resid) > 2.5 * rmse) {
        anomalies.push({
          type: "OUTLIER",
          severity: "LOW",
          message: "One inspection reading is a statistical outlier."
        });
        break;
      }
    }
  }

  let mileageVerdict: MileageVerdict = "LOGISCH";
  if (anomalies.some((a) => a.type === "ROLLBACK")) {
    mileageVerdict = "ONLOGISCH";
  } else if (anomalies.some((a) => a.severity === "MEDIUM")) {
    mileageVerdict = "TWIJFELACHTIG";
  }

  let mileageUsageProfile: string | null = null;
  if (Number.isFinite(b)) {
    if (b < 8000) mileageUsageProfile = "Recreational";
    else if (b < 15000) mileageUsageProfile = "Average";
    else if (b < 25000) mileageUsageProfile = "Above average";
    else if (b < 45000) mileageUsageProfile = "Intensive";
    else mileageUsageProfile = "Very intensive";
  }

  const latestMileage = points.length ? points[points.length - 1].km : null;

  return {
    estimatedMileageNow,
    estimatedMileageMin,
    estimatedMileageMax,
    mileageVerdict,
    mileageUsageProfile,
    mileageSlopeKmPerYear: Number.isFinite(b) ? Math.round(b) : null,
    mileageAnomalies: anomalies,
    latestMileage
  };
}

export type FuelKind = {
  isPetrol: boolean;
  isDiesel: boolean;
  isElectric: boolean;
  isHybrid: boolean;
  isLpg: boolean;
  isCng: boolean;
  isHydrogen: boolean;
};

/**
 * Robustly classify a fuel-type string. Uses substring matching (not exact
 * equality) so it works for localized values AND combined multi-fuel strings
 * like "Benzine / Elektriciteit" (plug-in hybrids), where exact === checks
 * previously failed silently.
 */
export function classifyFuel(fuelType: string | null | undefined): FuelKind {
  const f = (fuelType ?? "").toLowerCase();
  const isElectric = f.includes("elektr") || f.includes("electric");
  const isPetrol = f.includes("benz") || f.includes("petrol");
  const isDiesel = f.includes("diesel");
  const isLpg = f.includes("lpg");
  const isCng = f.includes("cng") || f.includes("aardgas");
  const isHydrogen = f.includes("waterstof") || f.includes("hydrogen");
  const isHybrid = f.includes("hybr") || f.includes("plug") || (isElectric && (isPetrol || isDiesel));
  return { isPetrol, isDiesel, isElectric, isHybrid, isLpg, isCng, isHydrogen };
}

function fuelOffset({ fuelType, bodyType, ageYears }: { fuelType: string | null; bodyType: string | null; ageYears: number }) {
  const { isDiesel, isPetrol, isElectric, isHybrid, isLpg, isCng, isHydrogen } = classifyFuel(fuelType);
  const body = (bodyType ?? "").toLowerCase();
  const isVan = body.includes("bestel") || body.includes("van") || body.includes("mpv");

  if (isElectric && !isHybrid && !isDiesel && !isPetrol) {
    let offset = 0.06;
    if (ageYears > 4) offset += -0.02 * (ageYears - 4);
    return Math.max(offset, -0.15);
  }

  if (isHybrid) {
    const isPlugIn = isElectric && (isPetrol || isDiesel);
    return isPlugIn ? 0.02 : 0.03;
  }

  if (isDiesel) return isVan ? -0.04 : -0.08;
  if (isLpg) return -0.15;
  if (isCng) return -0.12;
  if (isHydrogen) return -0.05;
  if (isPetrol) return 0.0;
  return 0.0;
}

/**
 * Rough indication of the quarterly motorrijtuigenbelasting (MRB / road tax),
 * derived from the RDW empty weight + fuel type.
 *
 * This is NOT the official amount. The real MRB uses the Belastingdienst weight
 * brackets, fuel surcharges (brandstoftoeslag) and PER-PROVINCE opcenten — and
 * the province depends on the owner, which RDW does not expose. The model below
 * is calibrated to public reference points (notably a ~EUR 100/quarter diesel
 * surcharge around 1200 kg and an average provincial opcenten level) and is
 * returned as a RANGE to reflect the province-to-province spread. Always verify
 * the exact figure with the official calculator at belastingdienst.nl.
 */
export function estimateRoadTaxQuarter(
  emptyWeightKg: number | null | undefined,
  fuelType: string | null | undefined
): { min: number; max: number } | null {
  if (!emptyWeightKg || emptyWeightKg <= 0) return null;
  const w = emptyWeightKg;
  const fuel = classifyFuel(fuelType);

  // Pure EV: heavily reduced (the MRB exemption is being phased out), keep a low
  // indication rather than zero so buyers still see a ballpark.
  if (fuel.isElectric && !fuel.isPetrol && !fuel.isDiesel) {
    const ev = w * 0.035;
    return { min: Math.max(0, Math.round((ev * 0.6) / 5) * 5), max: Math.round((ev * 1.1) / 5) * 5 };
  }

  // Petrol baseline per kg/quarter incl. average provincial opcenten, plus a
  // fuel surcharge for diesel / LPG / CNG.
  let point = w * 0.135 - 25;
  if (fuel.isDiesel) point += w * 0.085;
  else if (fuel.isLpg) point += w * 0.04;
  else if (fuel.isCng) point += w * 0.02;
  point = Math.max(0, point);

  const min = Math.max(0, Math.round((point * 0.85) / 5) * 5);
  const max = Math.round((point * 1.18) / 5) * 5;
  return max > 0 ? { min, max } : null;
}

/**
 * Derive a condition/history adjustment from free RDW signals. Each signal that
 * destroys value (odometer fraud, registration block, import, many owners,
 * expired APK, open recall) lowers the multiplicative `factor` and/or widens the
 * uncertainty. Calibrated conservatively; the combined factor is floored at 0.40
 * so signals never stack into an implausible near-zero value.
 */
export function computeConditionAdjustment(input: {
  napVerdict: string | null;
  mileageVerdict: MileageVerdict;
  wok: boolean;
  isImported: boolean;
  ownersCount: number | null;
  apkExpiryDate: string | null;
  hasOpenRecall: boolean;
}): MarketValueCondition {
  let factor = 1;
  let extraSe = 0;
  let forceLowConfidence = false;
  const reasons: string[] = [];

  // Odometer integrity — worst of RDW's official NAP verdict and our APK-based verdict.
  const nap = (input.napVerdict ?? "").toLowerCase();
  const napIllogical = nap.includes("onlogisch") || nap.includes("illogical");
  const napNoVerdict = nap.includes("geen oordeel") || nap.includes("no verdict");
  if (napIllogical || input.mileageVerdict === "ONLOGISCH") {
    factor *= 0.62;
    extraSe += 0.12;
    forceLowConfidence = true;
    reasons.push("Odometer reading illogical (rollback risk)");
  } else if (input.mileageVerdict === "TWIJFELACHTIG") {
    factor *= 0.9;
    extraSe += 0.05;
    reasons.push("Odometer history doubtful");
  } else if (napNoVerdict) {
    extraSe += 0.04;
    reasons.push("No NAP verdict available");
  }

  // WOK — registration block; not road-legal until re-inspected.
  if (input.wok) {
    factor *= 0.7;
    extraSe += 0.08;
    forceLowConfidence = true;
    reasons.push("Registration block (WOK)");
  }

  // Imported vehicle — typically a lower / harder-to-realise NL market value.
  if (input.isImported) {
    factor *= 0.95;
    extraSe += 0.03;
    reasons.push("Imported vehicle");
  }

  // Number of previous owners.
  if (input.ownersCount != null) {
    if (input.ownersCount >= 7) {
      factor *= 0.95;
      reasons.push("Many previous owners");
    } else if (input.ownersCount >= 5) {
      factor *= 0.975;
      reasons.push("Several previous owners");
    }
  }

  // Expired APK — buyer must budget inspection plus likely repairs.
  if (input.apkExpiryDate) {
    const d = new Date(input.apkExpiryDate);
    if (!Number.isNaN(d.getTime()) && d.getTime() < Date.now()) {
      factor *= 0.96;
      reasons.push("APK expired");
    }
  }

  // Open recall.
  if (input.hasOpenRecall) {
    factor *= 0.98;
    reasons.push("Open recall");
  }

  return {
    factor: clamp(factor, 0.4, 1),
    extraSe: clamp(extraSe, 0, 0.3),
    forceLowConfidence,
    reasons
  };
}

export function computeMarketValueV3(params: {
  catalogPrice: number | null;
  ageYears: number | null;
  brand: string | null;
  fuelType: string | null;
  bodyType: string | null;
  mileage: number | null;
  condition?: MarketValueCondition;
}): MarketValueResult {
  const { catalogPrice, ageYears, brand, fuelType, bodyType, mileage, condition } = params;
  if (!catalogPrice || ageYears == null || ageYears < 0) {
    return { value: null, min: null, max: null, se: null, confidence: null };
  }

  const t = ageYears;
  const f = -0.15 * Math.sqrt(t) - 0.040 * t;

  let r = 0;
  let g = 0;
  let h = 0;
  const hasMileage = mileage != null && mileage > 0;

  if (hasMileage) {
    const mu = 13500 * Math.max(t, 0.5);
    r = Math.log(Math.max(mileage, 1) / mu);
    if (r >= 0) {
      g = -(0.45 * r + 0.25 * r * r + 0.08 * r * r * r);
    } else {
      g = 0.12 * Math.pow(Math.abs(r), 0.6);
    }
    g = clamp(g, -3.0, 0.20);

    const sigmoid = 1 / (1 + Math.exp(-0.6 * (t - 5)));
    h = -0.08 * Math.max(r, 0) * sigmoid * Math.sqrt(t);
    h = Math.max(h, -1.0);
  }

  const brandOffset = getBrandOffset(brand).offset;
  const lnP = Math.log(catalogPrice) + f + g + h + fuelOffset({ fuelType, bodyType, ageYears: t }) + brandOffset;

  let se = 0.14;
  if (!hasMileage) se += 0.10;
  if (t > 15) se += 0.06;
  if (hasMileage && Math.abs(r) > 1.0) se += 0.04;
  const brandKnown = getBrandOffset(brand).known;
  if (!brandKnown) se += 0.03;
  if (condition) se += condition.extraSe;

  let estimated = roundTo(Math.exp(lnP), 50);
  let minimum = roundTo(Math.exp(lnP - 1.28 * se), 50);
  let maximum = roundTo(Math.exp(lnP + 1.28 * se), 50);

  // A used car can't be worth more than its original catalogue price (except
  // >25y classics, which can appreciate); cap before applying any condition discount.
  if (t < 25) {
    estimated = Math.min(estimated, catalogPrice);
    minimum = Math.min(minimum, catalogPrice);
    maximum = Math.min(maximum, catalogPrice);
  }

  // Condition/history discount from RDW signals (odometer integrity, WOK, import,
  // owners, APK, recalls), applied to the depreciation-based value.
  if (condition) {
    estimated = roundTo(estimated * condition.factor, 50);
    minimum = roundTo(minimum * condition.factor, 50);
    maximum = roundTo(maximum * condition.factor, 50);
  }

  const minFloor = 250;
  estimated = Math.max(estimated, minFloor);
  minimum = Math.max(minimum, minFloor);
  maximum = Math.max(maximum, minFloor);

  let confidence: MarketValueConfidence = "LOW";
  if (se <= 0.16) confidence = "HIGH";
  else if (se <= 0.22) confidence = "MEDIUM";
  if (condition?.forceLowConfidence) confidence = "LOW";

  return {
    value: estimated,
    min: minimum,
    max: maximum,
    se,
    confidence
  };
}

export function enrichVehicleData(profile: VehicleProfile): EnrichedData {
  const v = profile.vehicle;

  // 1. Age Calculation
  let ageInMonths = null as number | null;
  let ageString = null as string | null;
  let ageYears = null as number | null;

  if (v.firstRegistrationWorld) {
    const d = parseISO(v.firstRegistrationWorld);
    const now = new Date();
    ageInMonths = differenceInMonths(now, d);
    const years = differenceInYears(now, d);
    const months = ageInMonths % 12;
    ageString = `${years} years and ${months} months`;
    ageYears = Math.max((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25), 0);
  }

  // 2. Import Risk
  const isImported =
    !!v.firstRegistrationNL &&
    !!v.firstRegistrationWorld &&
    v.firstRegistrationNL !== v.firstRegistrationWorld;

  // 3. Maintenance Risk Score (Heuristic: Age + Empty Weight)
  let riskScore = 4.0; // Base score
  if (ageInMonths) {
    riskScore += ageInMonths / 60; // +1 point every 5 years
  }
  if (v.weight?.empty && v.weight.empty > 1500) {
    riskScore += 1.0; // Heavier = more wear (brakes, suspension)
  }
  if (classifyFuel(v.fuelType).isDiesel) riskScore += 0.5;
  riskScore = Math.min(Math.max(riskScore, 1.0), 9.9);

  const registrationDate = v.firstRegistrationWorld ? parseDate(v.firstRegistrationWorld) : null;
  const mileageEst = estimateMileage(profile, registrationDate);

  // Condition/history discount from free RDW signals — computed once from the raw
  // (untranslated) data so it applies consistently here and in any later override.
  const valuationCondition = computeConditionAdjustment({
    napVerdict: v.napVerdict,
    mileageVerdict: mileageEst.mileageVerdict,
    wok: v.wok,
    isImported,
    ownersCount: v.owners?.count ?? null,
    apkExpiryDate: v.apkExpiryDate,
    hasOpenRecall: v.hasOpenRecall
  });

  const marketValue = computeMarketValueV3({
    catalogPrice: v.cataloguePrice,
    ageYears,
    brand: v.brand,
    fuelType: v.fuelType,
    bodyType: v.bodyType,
    mileage: mileageEst.latestMileage ?? mileageEst.estimatedMileageNow,
    condition: valuationCondition
  });

  let estimatedValueNextYear: number | null = null;
  if (v.cataloguePrice && ageYears != null && marketValue.value != null) {
    const nextAge = ageYears + 1;
    const projectedMileage = mileageEst.estimatedMileageNow != null && mileageEst.mileageSlopeKmPerYear != null
      ? mileageEst.estimatedMileageNow + mileageEst.mileageSlopeKmPerYear
      : mileageEst.estimatedMileageNow ?? mileageEst.latestMileage;

    const nextValue = computeMarketValueV3({
      catalogPrice: v.cataloguePrice,
      ageYears: nextAge,
      brand: v.brand,
      fuelType: v.fuelType,
      bodyType: v.bodyType,
      mileage: projectedMileage ?? null,
      condition: valuationCondition
    });
    estimatedValueNextYear = nextValue.value;
  }

  // 5. APK Pass Chance (Heuristic)
  let passChance = 85;
  if (ageInMonths && ageInMonths > 120) passChance -= 15;
  if (isImported) passChance -= 5;

  // 6. Repair Chances (Mocked for UI testing, would need B2B data for real)
  const repairChances = [] as { name: string; chance: number; estMin: number; estMax: number }[];
  if (ageInMonths && ageInMonths > 80) {
    repairChances.push({ name: "Brakes (discs/pads)", chance: 75, estMin: 350, estMax: 600 });
    repairChances.push({ name: "Battery replacement", chance: 40, estMin: 100, estMax: 250 });
  }
  if (ageInMonths && ageInMonths > 140) {
    repairChances.push({ name: "Timing belt/chain", chance: 65, estMin: 400, estMax: 800 });
    repairChances.push({ name: "Shock absorbers", chance: 55, estMin: 300, estMax: 500 });
  }

  // 7. Road Tax (MRB) — indication from RDW empty weight + fuel type. Returned
  //    as a range (province opcenten vary); clearly labelled as an estimate and
  //    pointed at the official calculator in the report.
  const fuelKind = classifyFuel(v.fuelType);
  const tax = estimateRoadTaxQuarter(v.weight?.empty ?? null, v.fuelType);

  // 8. Insurance: no defensible data-only estimate exists (it depends on driver
  //    profile, claims history, coverage). Previously a fabricated formula —
  //    now reported as unavailable rather than misleading.
  const insuranceEst: number | null = null;

  // 9. Fuel Cost Estimate — grounded in the vehicle's REAL combined consumption
  //    from RDW when available (l/100km, or kWh/100km for EVs); falls back to a
  //    weight-based default only when RDW has no consumption figure.
  //    Assumes ~1000 km/month.
  const MONTHLY_KM = 1000;
  let fuelEst: number | null = null;
  const realConsumption =
    v.consumptionCombined != null && v.consumptionCombined > 0 ? v.consumptionCombined : null;
  if (v.fuelType && (v.weight?.empty || realConsumption)) {
    if (fuelKind.isElectric && !fuelKind.isPetrol && !fuelKind.isDiesel) {
      const kwhPer100 = realConsumption ?? 18; // kWh/100km
      fuelEst = Math.round((MONTHLY_KM / 100) * kwhPer100 * 0.4); // EUR/kWh
    } else {
      let litersPer100 = realConsumption;
      if (litersPer100 == null && v.weight?.empty) {
        if (v.weight.empty > 2000) litersPer100 = 11.0;
        else if (v.weight.empty > 1500) litersPer100 = 8.5;
        else if (v.weight.empty < 1000) litersPer100 = 5.5;
        else litersPer100 = 7.0;
      }
      if (litersPer100 != null) {
        const pricePerLiter = fuelKind.isDiesel ? 1.95 : fuelKind.isLpg ? 0.95 : 2.1;
        fuelEst = Math.round((MONTHLY_KM / 100) * litersPer100 * pricePerLiter);
      }
    }
  }

  // 10. Known Issues (Mocked heuristics)
  const knownIssues = [] as { title: string; severity: string; target: string; advice: string }[];
  const brand = (v.brand || "").toUpperCase();
  if (ageInMonths && ageInMonths > (10 * 12)) {
    if (brand.includes("TOYOTA")) {
      knownIssues.push({
        title: "Timing chain wear", severity: "Moderate", target: "Older VVT-i engines", advice: "Check for rattling noises during cold start."
      });
    }
    if (brand.includes("VOLKSWAGEN") || brand.includes("AUDI")) {
      knownIssues.push({
        title: "Oil consumption TFSI", severity: "High", target: "1.8 and 2.0 engines (2008-2012)", advice: "Ask for oil consumption history."
      });
    }
    knownIssues.push({
      title: "Clutch issues", severity: "Common", target: "All years", advice: "Check for wear during test drive."
    });
  }

  return {
    ageInMonths,
    ageString,
    isImported,
    maintenanceRiskScore: Number(riskScore.toFixed(1)),

    estimatedValueNow: marketValue.value,
    estimatedValueMin: marketValue.min,
    estimatedValueMax: marketValue.max,
    estimatedValueNextYear: estimatedValueNextYear,
    marketValueConfidence: marketValue.confidence,
    marketValueSe: marketValue.se,
    marketValueCondition: valuationCondition,

    estimatedMileageNow: mileageEst.estimatedMileageNow,
    estimatedMileageMin: mileageEst.estimatedMileageMin,
    estimatedMileageMax: mileageEst.estimatedMileageMax,
    mileageVerdict: mileageEst.mileageVerdict,
    mileageUsageProfile: mileageEst.mileageUsageProfile,
    mileageSlopeKmPerYear: mileageEst.mileageSlopeKmPerYear,
    mileageAnomalies: mileageEst.mileageAnomalies,

    apkPassChance: passChance,
    repairChances,
    roadTaxEstQuarter: tax,
    insuranceEstMonth: insuranceEst,
    fuelEstMonth: fuelEst,
    knownIssues
  };
}
