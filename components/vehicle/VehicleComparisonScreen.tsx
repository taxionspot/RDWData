"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Scale, Download } from "lucide-react";
import Image from "next/image";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { formatDisplayPlate, normalizePlate, validateDutchPlate } from "@/lib/rdw/normalize";
import { getVehicleImageUrl } from "@/lib/utils/imagin";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import { useI18n } from "@/lib/i18n/context";
import styles from "./VehicleComparisonScreen.module.css";

type Props = { plate: string };

type Suggestion = {
  plate: string;
  label: string;
  year: number | null;
};

type CompareResponse = {
  ai: {
    verdict: "BASE" | "COMPARE" | "TIE";
    summary: string;
    basePros: string[];
    comparePros: string[];
    keyRisks: string[];
    recommendation: string;
  } | null;
};

function toMileage(value: string | null): number | null {
  if (!value || value.trim().length === 0) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

function metricRows(locale: "nl" | "en", data: Record<string, unknown> | null) {
  if (!data) return [];
  const vehicle = (data.vehicle ?? {}) as Record<string, unknown>;
  const engine = (vehicle.engine ?? {}) as Record<string, unknown>;
  const weight = (vehicle.weight ?? {}) as Record<string, unknown>;
  const owners = (vehicle.owners ?? {}) as Record<string, unknown>;
  const enriched = (data.enriched ?? {}) as Record<string, unknown>;
  const defects = Array.isArray(data.defects) ? data.defects.length : 0;
  const recalls = Array.isArray(data.recalls) ? data.recalls.length : 0;
  return [
    { label: locale === "nl" ? "Merk / Model" : "Brand / Model", value: `${vehicle.brand ?? "-"} ${vehicle.tradeName ?? ""}`.trim() || "-" },
    { label: locale === "nl" ? "Bouwjaar" : "Year", value: String(vehicle.year ?? "-") },
    { label: locale === "nl" ? "Brandstof" : "Fuel", value: String(vehicle.fuelType ?? "-") },
    { label: locale === "nl" ? "Carrosserie" : "Body", value: String(vehicle.bodyType ?? "-") },
    { label: locale === "nl" ? "Vermogen (kW)" : "Power (kW)", value: String(engine.powerKw ?? "-") },
    { label: locale === "nl" ? "Deuren" : "Doors", value: String(vehicle.doors ?? "-") },
    { label: locale === "nl" ? "Zitplaatsen" : "Seats", value: String(vehicle.seats ?? "-") },
    { label: locale === "nl" ? "Leeggewicht" : "Empty weight", value: `${weight.empty ?? "-"} kg` },
    { label: locale === "nl" ? "Catalogusprijs" : "Catalogue price", value: Number.isFinite(Number(vehicle.cataloguePrice)) ? `EUR ${Math.round(Number(vehicle.cataloguePrice)).toLocaleString("nl-NL")}` : "-" },
    { label: locale === "nl" ? "CO2 uitstoot" : "CO2 emission", value: `${vehicle.co2 ?? "-"} g/km` },
    { label: locale === "nl" ? "Emissienorm" : "Emission standard", value: String(vehicle.emissionStandard ?? "-") },
    { label: locale === "nl" ? "Eigenaren" : "Owners", value: String(owners.count ?? "-") },
    { label: locale === "nl" ? "APK vervaldatum" : "APK expiry", value: String(vehicle.apkExpiryDate ?? "-") },
    { label: locale === "nl" ? "NAP oordeel" : "NAP verdict", value: String(vehicle.napVerdict ?? "-") },
    { label: locale === "nl" ? "Import/Export" : "Import/Export", value: `${vehicle.firstRegistrationNL ?? "-"} / ${vehicle.exportIndicator ? "Yes" : "No"}` },
    { label: locale === "nl" ? "WOK / Overdraagbaar" : "WOK / Transfer", value: `${vehicle.wok ? "Yes" : "No"} / ${vehicle.transferPossible ? "Yes" : "No"}` },
    { label: locale === "nl" ? "Defecten" : "Defects", value: String(defects) },
    { label: locale === "nl" ? "Recalls" : "Recalls", value: String(recalls) },
    { label: locale === "nl" ? "Onderhoudsrisico" : "Maintenance risk", value: String(enriched.maintenanceRiskScore ?? "-") },
    { label: locale === "nl" ? "APK kans %" : "APK chance %", value: String(enriched.apkPassChance ?? "-") },
    { label: locale === "nl" ? "Geschatte km nu" : "Estimated mileage now", value: Number.isFinite(Number(enriched.estimatedMileageNow)) ? `${Math.round(Number(enriched.estimatedMileageNow)).toLocaleString("nl-NL")} km` : "-" },
    { label: locale === "nl" ? "Km-trend/jaar" : "Mileage slope/year", value: Number.isFinite(Number(enriched.mileageSlopeKmPerYear)) ? `${Math.round(Number(enriched.mileageSlopeKmPerYear)).toLocaleString("nl-NL")} km` : "-" },
    {
      label: locale === "nl" ? "Marktwaarde" : "Market value",
      value: Number.isFinite(Number(enriched.estimatedValueNow))
        ? `EUR ${Math.round(Number(enriched.estimatedValueNow)).toLocaleString("nl-NL")}`
        : "-"
    },
    { label: locale === "nl" ? "Waarderange" : "Value range", value: Number.isFinite(Number(enriched.estimatedValueMin)) && Number.isFinite(Number(enriched.estimatedValueMax)) ? `EUR ${Math.round(Number(enriched.estimatedValueMin)).toLocaleString("nl-NL")} - EUR ${Math.round(Number(enriched.estimatedValueMax)).toLocaleString("nl-NL")}` : "-" },
    { label: locale === "nl" ? "Road tax (kw)" : "Road tax (qtr)", value: Number.isFinite(Number((enriched.roadTaxEstQuarter as Record<string, unknown> | undefined)?.min)) ? `EUR ${Math.round(Number((enriched.roadTaxEstQuarter as Record<string, unknown>).min)).toLocaleString("nl-NL")} - EUR ${Math.round(Number((enriched.roadTaxEstQuarter as Record<string, unknown>).max)).toLocaleString("nl-NL")}` : "-" },
    { label: locale === "nl" ? "Verzekering/mnd" : "Insurance/month", value: Number.isFinite(Number(enriched.insuranceEstMonth)) ? `EUR ${Math.round(Number(enriched.insuranceEstMonth)).toLocaleString("nl-NL")}` : "-" },
    { label: locale === "nl" ? "Brandstof/mnd" : "Fuel/month", value: Number.isFinite(Number(enriched.fuelEstMonth)) ? `EUR ${Math.round(Number(enriched.fuelEstMonth)).toLocaleString("nl-NL")}` : "-" }
  ];
}


type ScoreInput = {
  defects: number;
  recalls: number;
  riskScore: number;
  apkPassChance: number;
  wok: boolean;
  napOnlogisch: boolean;
};

/** Gewogen betrouwbaarheidsscore 0-10 voor de vergelijking. */
function weightedComparisonScore(input: ScoreInput): number {
  let score = 10;
  score -= Math.min(input.defects * 0.6, 3.5);
  score -= Math.min(input.recalls * 0.8, 1.6);
  score -= Math.min(Math.max(input.riskScore - 4, 0) * 0.35, 2);
  score += (input.apkPassChance - 75) / 25;
  if (input.napOnlogisch) score -= 2.5;
  if (input.wok) score = Math.min(score, 2.5);
  return Math.max(0.5, Math.min(10, Math.round(score * 10) / 10));
}

function scoreInputFrom(data: Record<string, unknown> | null | undefined): ScoreInput | null {
  if (!data) return null;
  const vehicle = (data.vehicle ?? {}) as Record<string, unknown>;
  const enriched = (data.enriched ?? {}) as Record<string, unknown>;
  const defects = Array.isArray(data.defects) ? data.defects.length : 0;
  const recalls = Array.isArray(data.recalls) ? data.recalls.length : 0;
  return {
    defects,
    recalls,
    riskScore: Number(enriched.maintenanceRiskScore ?? 5),
    apkPassChance: Number(enriched.apkPassChance ?? 75),
    wok: Boolean(vehicle.wok),
    napOnlogisch: String(vehicle.napVerdict ?? "").toLowerCase().includes("onlogisch")
  };
}

export function VehicleComparisonScreen({ plate }: Props) {
  const { locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const primaryMileage = useMemo(() => toMileage(searchParams.get("mileage")), [searchParams]);
  const compareQueryRaw = searchParams.get("compare") ?? "";
  const compareMileage = useMemo(() => toMileage(searchParams.get("compareMileage")), [searchParams]);
  const compareNormalized = useMemo(() => normalizePlate(compareQueryRaw), [compareQueryRaw]);

  const [compareInput, setCompareInput] = useState(compareQueryRaw);
  const [compareMileageInput, setCompareMileageInput] = useState(searchParams.get("compareMileage") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const baseLookup = useVehicleLookup(plate, primaryMileage);
  const compareLookup = useVehicleLookup(compareNormalized, compareMileage);
  const isCompareValid = validateDutchPlate(compareNormalized) && compareNormalized !== baseLookup.normalized;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [ai, setAi] = useState<CompareResponse["ai"]>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setCompareInput(compareQueryRaw);
  }, [compareQueryRaw]);

  useEffect(() => {
    setCompareMileageInput(searchParams.get("compareMileage") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (!baseLookup.data?.vehicle || !baseLookup.normalized) return;
    const v = baseLookup.data.vehicle;
    const url = `/api/vehicle/suggestions?plate=${encodeURIComponent(baseLookup.normalized)}&brand=${encodeURIComponent(v.brand ?? "")}&tradeName=${encodeURIComponent(v.tradeName ?? "")}&fuelType=${encodeURIComponent(v.fuelType ?? "")}&year=${encodeURIComponent(String(v.year ?? ""))}`;
    void (async () => {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as { items?: Suggestion[] };
      setSuggestions(Array.isArray(payload.items) ? payload.items : []);
    })();
  }, [baseLookup.data, baseLookup.normalized]);

  useEffect(() => {
    if (!baseLookup.normalized || !isCompareValid) {
      setAi(null);
      return;
    }
    let active = true;
    setAiLoading(true);
    void (async () => {
      const query = new URLSearchParams({
        base: baseLookup.normalized,
        compare: compareNormalized,
        lang: locale,
        include_ai: "1"
      });
      if (primaryMileage != null) query.set("mileage", String(primaryMileage));
      if (compareMileage != null) query.set("compareMileage", String(compareMileage));
      const res = await fetch(`/api/vehicle/compare?${query.toString()}`, { cache: "no-store" });
      if (!res.ok || !active) return;
      const payload = (await res.json()) as CompareResponse;
      if (active) setAi(payload.ai ?? null);
      if (active) setAiLoading(false);
    })().finally(() => {
      if (active) setAiLoading(false);
    });
    return () => {
      active = false;
    };
  }, [baseLookup.normalized, compareNormalized, isCompareValid, locale, primaryMileage, compareMileage]);

  const updateQuery = (nextCompare: string, nextCompareMileage: string) => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    const normalized = normalizePlate(nextCompare);
    if (validateDutchPlate(normalized) && normalized !== baseLookup.normalized) params.set("compare", normalized);
    else params.delete("compare");

    const m = toMileage(nextCompareMileage);
    if (m != null) params.set("compareMileage", String(m));
    else params.delete("compareMileage");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const onCompare = () => {
    const normalized = normalizePlate(compareInput);
    if (!validateDutchPlate(normalized)) {
      setError(locale === "nl" ? "Ongeldig kenteken voor vergelijking." : "Invalid comparison plate.");
      return;
    }
    if (normalized === baseLookup.normalized) {
      setError(locale === "nl" ? "Kies een ander voertuig dan het hoofdvoertuig." : "Choose a different vehicle than the base car.");
      return;
    }
    setError(null);
    updateQuery(normalized, compareMileageInput);
  };

  const onDownload = async () => {
    if (!baseLookup.normalized || !isCompareValid || isDownloading) return;
    setIsDownloading(true);
    try {
      const query = new URLSearchParams({
        base: baseLookup.normalized,
        compare: compareNormalized,
        lang: locale,
        include_ai: "1",
        download: "1"
      });
      if (primaryMileage != null) query.set("mileage", String(primaryMileage));
      if (compareMileage != null) query.set("compareMileage", String(compareMileage));
      const res = await fetch(`/api/vehicle/compare?${query.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Comparison PDF download failed.");
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `vehicle-comparison-${baseLookup.normalized}-${compareNormalized}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Comparison PDF download failed.");
    } finally {
      setIsDownloading(false);
    }
  };

  if (!baseLookup.isValid || baseLookup.isError) {
    return <div className={styles.loading}>{locale === "nl" ? "Voertuig niet gevonden." : "Vehicle not found."}</div>;
  }

  const baseRows = metricRows(locale, (baseLookup.data ?? null) as Record<string, unknown> | null);
  const compareRows = metricRows(locale, (compareLookup.data ?? null) as Record<string, unknown> | null);
  const baseVehicle = (baseLookup.data?.vehicle ?? {}) as Record<string, unknown>;
  const compareVehicle = (compareLookup.data?.vehicle ?? {}) as Record<string, unknown>;
  const baseImage = getVehicleImageUrl((baseVehicle.brand as string) ?? null, (baseVehicle.tradeName as string) ?? null, {
    angle: "01",
    zoomtype: "relative",
    color: ((baseVehicle.color as Record<string, unknown> | undefined)?.primary as string) ?? null
  });
  const compareImage = getVehicleImageUrl((compareVehicle.brand as string) ?? null, (compareVehicle.tradeName as string) ?? null, {
    angle: "01",
    zoomtype: "relative",
    color: ((compareVehicle.color as Record<string, unknown> | undefined)?.primary as string) ?? null
  });

  return (
    <div className={styles.pageContainer}>
      <div className={styles.contentContainer}>
        <VehicleNavBar plate={baseLookup.normalized || plate} subtitle={locale === "nl" ? "Voertuigvergelijking" : "Vehicle comparison"} />
        <PremiumLock featureName={locale === "nl" ? "Voertuigvergelijking" : "Vehicle Comparison"} isLocked={true} plate={baseLookup.normalized} sectionKey="vehicleComparison">
          <div className={styles.header}>
            <h1>{locale === "nl" ? "Voertuigvergelijking" : "Vehicle Comparison"}</h1>
            <p>{locale === "nl" ? "Vergelijk direct twee voertuigen side-by-side met markt- en risicosignalen." : "Compare two vehicles side-by-side with market and risk signals."}</p>
          </div>

          <div className={styles.controls}>
            <input
              className={styles.input}
              value={compareInput}
              onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
              placeholder={locale === "nl" ? "Vergelijk kenteken (bijv. 16-RSL-9)" : "Comparison plate (e.g. 16-RSL-9)"}
            />
            <input
              className={styles.input}
              inputMode="numeric"
              value={compareMileageInput}
              onChange={(e) => setCompareMileageInput(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={locale === "nl" ? "Kilometerstand (optioneel)" : "Mileage (optional)"}
            />
            <button className={styles.btn} type="button" onClick={onCompare}>
              <Scale size={16} /> {locale === "nl" ? "Vergelijk" : "Compare"}
            </button>
            <button className={styles.btnSecondary} type="button" onClick={onDownload} disabled={!isCompareValid || isDownloading}>
              {isDownloading ? <RefreshCw size={16} className={styles.spin} /> : <Download size={16} />}
              {locale === "nl" ? "PDF downloaden" : "Download PDF"}
            </button>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.suggestions}>
            {suggestions.map((s) => (
              <button
                key={s.plate}
                className={styles.suggestion}
                type="button"
                onClick={() => {
                  setCompareInput(formatDisplayPlate(s.plate));
                  updateQuery(s.plate, compareMileageInput);
                }}
              >
                <span>{formatDisplayPlate(s.plate)}</span>
                <small>{s.label}{s.year ? ` (${s.year})` : ""}</small>
              </button>
            ))}
          </div>

          <div className={styles.heroGrid}>
            <div className={styles.heroCard}>
              <div className={styles.heroTitle}>{locale === "nl" ? "Voertuig A" : "Vehicle A"} · {formatDisplayPlate(baseLookup.normalized || plate)}</div>
              <div className={styles.heroImageWrap}>
                <Image src={baseImage} alt="Base vehicle" width={520} height={260} className={styles.heroImage} unoptimized />
              </div>
              <div className={styles.heroMeta}>{String(baseVehicle.brand ?? "-")} {String(baseVehicle.tradeName ?? "")} {baseVehicle.year ? `(${String(baseVehicle.year)})` : ""}</div>
            </div>
            <div className={styles.heroCard}>
              <div className={styles.heroTitle}>{locale === "nl" ? "Voertuig B" : "Vehicle B"} · {isCompareValid ? formatDisplayPlate(compareNormalized) : "-"}</div>
              <div className={styles.heroImageWrap}>
                {isCompareValid ? <Image src={compareImage} alt="Comparison vehicle" width={520} height={260} className={styles.heroImage} unoptimized /> : <div className={styles.placeholder}>{locale === "nl" ? "Selecteer voertuig" : "Select vehicle"}</div>}
              </div>
              <div className={styles.heroMeta}>{String(compareVehicle.brand ?? "-")} {String(compareVehicle.tradeName ?? "")} {compareVehicle.year ? `(${String(compareVehicle.year)})` : ""}</div>
            </div>
          </div>

          {(() => {
            const baseInput = scoreInputFrom(baseLookup.data as unknown as Record<string, unknown>);
            const compareInput = isCompareValid ? scoreInputFrom(compareLookup.data as unknown as Record<string, unknown>) : null;
            if (!baseInput || !compareInput) return null;
            const baseScore = weightedComparisonScore(baseInput);
            const compareScore = weightedComparisonScore(compareInput);
            const tie = Math.abs(baseScore - compareScore) < 0.3;
            const winner = tie ? null : baseScore > compareScore ? "A" : "B";
            return (
              <div className={styles.scorecard}>
                <div className={styles.scorecardCol}>
                  <span className={styles.scorecardLabel}>{locale === "nl" ? "Voertuig A" : "Vehicle A"}</span>
                  <span className={`${styles.scorecardValue} ${winner === "A" ? styles.scorecardWin : ""}`}>{baseScore.toFixed(1)}</span>
                </div>
                <div className={styles.scorecardMid}>
                  <span className={styles.scorecardTitle}>{locale === "nl" ? "Gewogen betrouwbaarheidsscore" : "Weighted reliability score"}</span>
                  <span className={styles.scorecardVerdict}>
                    {tie
                      ? locale === "nl" ? "Vrijwel gelijkwaardig" : "Nearly equal"
                      : winner === "A"
                      ? locale === "nl" ? "Voertuig A scoort beter" : "Vehicle A scores better"
                      : locale === "nl" ? "Voertuig B scoort beter" : "Vehicle B scores better"}
                  </span>
                  <span className={styles.scorecardNote}>
                    {locale === "nl"
                      ? "Weging: gebreken, terugroepacties, onderhoudsrisico, APK-kans, NAP en WOK."
                      : "Weighting: defects, recalls, maintenance risk, APK chance, NAP and WOK."}
                  </span>
                </div>
                <div className={styles.scorecardCol}>
                  <span className={styles.scorecardLabel}>{locale === "nl" ? "Voertuig B" : "Vehicle B"}</span>
                  <span className={`${styles.scorecardValue} ${winner === "B" ? styles.scorecardWin : ""}`}>{compareScore.toFixed(1)}</span>
                </div>
              </div>
            );
          })()}

          <div className={styles.table}>
            <div className={styles.colHeader}>
              <strong>{locale === "nl" ? "Gezocht voertuig" : "Searched vehicle"}</strong>
              <span>{formatDisplayPlate(baseLookup.normalized || plate)}</span>
            </div>
            <div className={styles.colHeader}>
              <strong>{locale === "nl" ? "Vergelijkingsvoertuig" : "Comparison vehicle"}</strong>
              <span>{isCompareValid ? formatDisplayPlate(compareNormalized) : (locale === "nl" ? "Niet geselecteerd" : "Not selected")}</span>
            </div>

            {baseRows.map((row, idx) => (
              <div className={styles.row} key={row.label}>
                <div className={styles.metric}>{row.label}</div>
                <div>{row.value}</div>
                <div>{compareRows[idx]?.value ?? "-"}</div>
              </div>
            ))}
          </div>

          <div className={styles.aiCard}>
            <h3>{locale === "nl" ? "Vergelijkingsinzichten" : "Comparison insights"}</h3>
            {aiLoading ? (
              <div className={styles.loadingInline}><RefreshCw size={14} className={styles.spin} /> {locale === "nl" ? "Analyse wordt opgesteld..." : "Preparing analysis..."}</div>
            ) : ai ? (
              <>
                <p><strong>{locale === "nl" ? "Verdict" : "Verdict"}:</strong> {ai.verdict}</p>
                <p>{ai.summary}</p>
                <p><strong>{locale === "nl" ? "Aanbeveling" : "Recommendation"}:</strong> {ai.recommendation}</p>
                <div className={styles.aiLists}>
                  <div>
                    <h4>{locale === "nl" ? "Sterke punten voertuig A" : "Vehicle A strengths"}</h4>
                    <ul>{ai.basePros.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                  <div>
                    <h4>{locale === "nl" ? "Sterke punten voertuig B" : "Vehicle B strengths"}</h4>
                    <ul>{ai.comparePros.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
                <div>
                  <h4>{locale === "nl" ? "Belangrijkste risico's" : "Key risks"}</h4>
                  <ul>{ai.keyRisks.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </>
            ) : (
              <p>{locale === "nl" ? "Selecteer een tweede voertuig om de vergelijking te zien." : "Select another vehicle to see the comparison."}</p>
            )}
          </div>
        </PremiumLock>
      </div>
    </div>
  );
}
