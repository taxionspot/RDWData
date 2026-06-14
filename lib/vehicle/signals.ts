import type { VehicleProfile } from "../rdw/types";
import type { GroupId } from "./groups";

export type SignalTone = "ok" | "warn" | "danger";
export type SignalKey = "safety" | "fairPrice" | "mileage" | "apk";

export type Signal = {
  key: SignalKey;
  tone: SignalTone;
  labelNl: string;
  labelEn: string;
  subNl: string;
  subEn: string;
  group: GroupId;
  affectsPrice: boolean;
};

export type Alert = {
  key: string;
  tone: SignalTone;
  labelNl: string;
  labelEn: string;
  group: GroupId;
};

export type Verdict = {
  tone: SignalTone;
  headingNl: string;
  headingEn: string;
};

export type SignalSummary = {
  checked: number;
  needAttention: number;
  priceAffecting: number;
};

export type GroupStatus = {
  tone: SignalTone;
  labelNl: string;
  labelEn: string;
};

export type VehicleSignalReport = {
  verdict: Verdict;
  signals: Signal[];
  alerts: Alert[];
  summary: SignalSummary;
  groupStatus: Record<GroupId, GroupStatus>;
};

export type SignalInput = {
  profile: VehicleProfile;
  nowMs: number;
  hasAccess: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function worst(a: SignalTone, b: SignalTone): SignalTone {
  const rank: Record<SignalTone, number> = { ok: 0, warn: 1, danger: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/** Parse an ISO yyyy-mm-dd (or yyyy-mm-ddT...) date to epoch ms at UTC midnight; null if unparseable. */
function parseApkMs(value: string | null): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

function isImplausibleNap(napVerdict: string | null): boolean {
  return napVerdict === "Onlogisch" || napVerdict === "Implausible";
}

function isNoNapVerdict(napVerdict: string | null): boolean {
  return (
    napVerdict === null ||
    napVerdict === "Geen oordeel" ||
    napVerdict === "No verdict"
  );
}

function isPlausibleNap(napVerdict: string | null): boolean {
  return napVerdict === "Logisch" || napVerdict === "Plausible";
}

function computeSafetyTone(profile: VehicleProfile): SignalTone {
  const v = profile.vehicle;
  if (v.wok || v.transferPossible === false) return "danger";
  if (
    v.hasOpenRecall ||
    v.recallsCount > 0 ||
    v.isTaxi ||
    profile.enriched?.isImported ||
    (profile.defects?.length ?? 0) > 0
  ) {
    return "warn";
  }
  return "ok";
}

function computeMileageTone(profile: VehicleProfile): SignalTone {
  const nap = profile.vehicle.napVerdict;
  if (isImplausibleNap(nap) || profile.enriched?.mileageVerdict === "ONLOGISCH") return "danger";
  if (isNoNapVerdict(nap) || profile.enriched?.mileageVerdict === "TWIJFELACHTIG") {
    return "warn";
  }
  if (isPlausibleNap(nap)) return "ok";
  return "ok";
}

function computeApkTone(profile: VehicleProfile, nowMs: number): SignalTone {
  const v = profile.vehicle;
  const expiry = parseApkMs(v.apkExpiryDate);
  if (v.wok) return "danger";
  if (expiry !== null && expiry < nowMs) return "danger";
  if (v.apkExpiryDate === null) return "warn";
  if (expiry !== null && expiry - nowMs <= 30 * DAY_MS) return "warn";
  return "ok";
}

export function computeVehicleSignals(input: SignalInput): VehicleSignalReport {
  const { profile, nowMs, hasAccess } = input;
  const v = profile.vehicle;
  const enriched = profile.enriched;

  const safetyTone = computeSafetyTone(profile);
  const mileageTone = computeMileageTone(profile);
  const apkTone = computeApkTone(profile, nowMs);

  const signals: Signal[] = [
    {
      key: "safety",
      tone: safetyTone,
      labelNl: "Veiligheid en status",
      labelEn: "Safety and status",
      subNl: "Officiele RDW-statusvlaggen",
      subEn: "Official RDW status flags",
      group: "g3-risico",
      affectsPrice: false
    },
    {
      key: "mileage",
      tone: mileageTone,
      labelNl: "Kilometerstand (NAP)",
      labelEn: "Mileage (NAP)",
      subNl: "Nationale APK-tellerstandcontrole",
      subEn: "National odometer check",
      group: "g4-km",
      affectsPrice: true
    },
    {
      key: "apk",
      tone: apkTone,
      labelNl: "APK-geldigheid",
      labelEn: "MOT validity",
      subNl: "Geldigheid van de keuring",
      subEn: "Inspection validity",
      group: "g5-apk",
      affectsPrice: false
    }
  ];

  if (hasAccess && enriched?.estimatedValueNow != null) {
    signals.push({
      key: "fairPrice",
      tone: "ok",
      labelNl: "Marktwaarde berekend",
      labelEn: "Market value calculated",
      subNl: "vul je vraagprijs in voor een prijsoordeel",
      subEn: "enter the asking price for a price verdict",
      group: "g2-markt",
      affectsPrice: true
    });
  }

  // Alerts: risico-bij-uitzondering, only the real exceptions.
  const alerts: Alert[] = [];
  if (v.wok) {
    alerts.push({
      key: "wok",
      tone: "danger",
      labelNl: "Geen geldige APK (WOK)",
      labelEn: "No valid MOT (WOK)",
      group: "g5-apk"
    });
  }
  if (v.transferPossible === false) {
    alerts.push({
      key: "transferBlocked",
      tone: "danger",
      labelNl: "Tenaamstelling niet mogelijk",
      labelEn: "Registration transfer not possible",
      group: "g3-risico"
    });
  }
  if (v.hasOpenRecall || v.recallsCount > 0) {
    alerts.push({
      key: "openRecall",
      tone: "warn",
      labelNl: "Openstaande terugroepactie",
      labelEn: "Open recall",
      group: "g3-risico"
    });
  }
  if (enriched?.isImported) {
    alerts.push({
      key: "imported",
      tone: "warn",
      labelNl: "Geimporteerd voertuig",
      labelEn: "Imported vehicle",
      group: "g6-voertuig"
    });
  }
  if (v.isTaxi) {
    alerts.push({
      key: "taxi",
      tone: "warn",
      labelNl: "Taxiverleden",
      labelEn: "Taxi history",
      group: "g3-risico"
    });
  }
  if (isImplausibleNap(v.napVerdict) || enriched?.mileageVerdict === "ONLOGISCH") {
    alerts.push({
      key: "napImplausible",
      tone: "danger",
      labelNl: "Tellerstand onlogisch",
      labelEn: "Implausible mileage",
      group: "g4-km"
    });
  } else if (isNoNapVerdict(v.napVerdict) || enriched?.mileageVerdict === "TWIJFELACHTIG") {
    alerts.push({
      key: "napNoVerdict",
      tone: "warn",
      labelNl: "Geen NAP-oordeel",
      labelEn: "No NAP verdict",
      group: "g4-km"
    });
  }
  const apkExpiry = parseApkMs(v.apkExpiryDate);
  if (apkExpiry !== null && apkExpiry < nowMs) {
    alerts.push({
      key: "apkExpired",
      tone: "danger",
      labelNl: "APK verlopen",
      labelEn: "MOT expired",
      group: "g5-apk"
    });
  } else if (apkExpiry !== null && apkExpiry - nowMs <= 30 * DAY_MS) {
    alerts.push({
      key: "apkSoon",
      tone: "warn",
      labelNl: "APK verloopt binnenkort",
      labelEn: "MOT expires soon",
      group: "g5-apk"
    });
  }

  // Summary.
  const deterministic: SignalTone[] = [safetyTone, mileageTone, apkTone];
  const needAttention = deterministic.filter((t) => t !== "ok").length;
  // Intentional resale-impact teaser count: includes wok/import/dubious mileage.
  // This is DISTINCT from the per-signal affectsPrice flag (which drives signal-level UI).
  const priceAffecting = [
    !!enriched?.isImported,
    mileageTone !== "ok",
    v.wok
  ].filter(Boolean).length;
  const summary: SignalSummary = { checked: 3, needAttention, priceAffecting };

  // Verdict.
  const verdictTone = worst(worst(safetyTone, mileageTone), apkTone);
  let headingNl: string;
  let headingEn: string;
  if (verdictTone === "ok") {
    headingNl = "Geen alarmsignalen gevonden";
    headingEn = "No warning signals found";
  } else if (verdictTone === "warn") {
    const puntNl = needAttention === 1 ? "punt" : "punten";
    const puntEn = needAttention === 1 ? "point" : "points";
    headingNl = "Redelijke koop, let op " + needAttention + " " + puntNl;
    headingEn = "Reasonable buy, watch " + needAttention + " " + puntEn;
  } else {
    headingNl = "Pas op: serieuze aandachtspunten";
    headingEn = "Caution: serious points of attention";
  }
  const verdict: Verdict = { tone: verdictTone, headingNl, headingEn };

  // Group status (every GroupId present).
  // Use a Map keyed by signal.key so a future reorder cannot silently swap labels.
  const signalByKey = new Map(signals.map((s) => [s.key, s]));
  const safetySignal = signalByKey.get("safety")!;
  const mileageSignal = signalByKey.get("mileage")!;
  const apkSignal = signalByKey.get("apk")!;

  const safetyStatus: GroupStatus = {
    tone: safetyTone,
    labelNl: safetySignal.labelNl,
    labelEn: safetySignal.labelEn
  };
  const mileageStatus: GroupStatus = {
    tone: mileageTone,
    labelNl: mileageSignal.labelNl,
    labelEn: mileageSignal.labelEn
  };
  const apkStatus: GroupStatus = {
    tone: apkTone,
    labelNl: apkSignal.labelNl,
    labelEn: apkSignal.labelEn
  };

  const groupStatus: Record<GroupId, GroupStatus> = {
    "g1-verdict": { tone: verdictTone, labelNl: headingNl, labelEn: headingEn },
    "g2-markt": hasAccess && enriched?.estimatedValueNow != null
      ? { tone: "ok", labelNl: "Marktwaarde berekend", labelEn: "Market value calculated" }
      : {
          tone: "ok",
          labelNl: "Ontgrendel de marktwaarde-analyse",
          labelEn: "Unlock the market value analysis"
        },
    "g3-risico": safetyStatus,
    "g4-km": mileageStatus,
    "g5-apk": apkStatus,
    "g6-voertuig": enriched?.isImported
      ? {
          tone: "warn",
          labelNl: "Geimporteerd, controleer papieren",
          labelEn: "Imported, check the paperwork"
        }
      : {
          tone: "ok",
          labelNl: "RDW-voertuiggegevens compleet",
          labelEn: "RDW vehicle data complete"
        }
  };

  return { verdict, signals, alerts, summary, groupStatus };
}
