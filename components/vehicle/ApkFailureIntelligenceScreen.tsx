"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BarChart3, CheckCircle2, Wrench } from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import { useI18n } from "@/lib/i18n/context";
import styles from "./ApkFailureIntelligenceScreen.module.css";

type Props = { plate: string; embedded?: boolean };

type ModelStats = {
  brand: string;
  tradeName: string;
  year: number;
  sampleSize: number;
  vehiclesWithDefects: number;
  totalDefects: number;
  topDefects: { code: string; description: string; count: number; pctOfVehicles: number }[];
};

export function ApkFailureIntelligenceScreen({ plate, embedded = false }: Props) {
  const { locale } = useI18n();
  const { normalized, isValid, data, isLoading, isError } = useVehicleLookup(plate);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!isValid) {
      setStatsLoading(false);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    setStats(null);
    fetch(`/api/vehicle/${encodeURIComponent(normalized)}/model-stats`)
      .then((response) => (response.ok ? response.json() : { stats: null }))
      .then((json: { stats: ModelStats | null }) => {
        if (cancelled) return;
        setStats(json?.stats ?? null);
        setStatsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStats(null);
        setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isValid, normalized]);

  if (!isValid || isError) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingCard}>
          <AlertCircle size={18} /> {locale === "nl" ? "Voertuig niet gevonden." : "Vehicle not found."}
        </div>
      </div>
    );
  }

  if (isLoading || !data || !data.enriched) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingCard}>{locale === "nl" ? "APK-statistieken laden..." : "Loading APK statistics..."}</div>
      </div>
    );
  }

  const passChance = Number(data.enriched.apkPassChance ?? 0);
  const ownDefectCount = data.defects.length;
  const passClass = passChance >= 75 ? styles.valueGood : passChance >= 50 ? styles.valueWarn : styles.valueBad;
  const defectClass = ownDefectCount === 0 ? styles.valueGood : ownDefectCount <= 3 ? styles.valueWarn : styles.valueBad;

  const brandLabel = [data.vehicle.brand, data.vehicle.tradeName].filter(Boolean).join(" ");
  const cohortLabel = [brandLabel || normalized, data.vehicle.year ? `(${data.vehicle.year})` : ""]
    .filter(Boolean)
    .join(" ");
  const cohortDefectPct = stats && stats.sampleSize > 0
    ? Math.round((stats.vehiclesWithDefects / stats.sampleSize) * 100)
    : 0;

  return (
    <div className={embedded ? undefined : styles.pageContainer}>
      <div className={embedded ? undefined : styles.contentContainer}>
        {!embedded && (
          <VehicleNavBar
            plate={normalized}
            subtitle={locale === "nl" ? "APK-faalstatistieken" : "APK failure statistics"}
          />
        )}
        <PremiumLock
          featureName={locale === "nl" ? "APK-faalstatistieken" : "APK failure statistics"}
          isLocked={true}
          plate={normalized}
          sectionKey="riskOverview"
        >
          <div className={styles.hero}>
            <h1>{locale === "nl" ? "APK-faalstatistieken uit RDW-data" : "APK failure statistics from RDW data"}</h1>
            <p>
              {locale === "nl"
                ? "Geconstateerde gebreken van vergelijkbare voertuigen, berekend uit officiele RDW keuringsdata."
                : "Recorded defects across comparable vehicles, computed from official RDW inspection data."}
            </p>
          </div>

          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>
                <CheckCircle2 size={15} /> {locale === "nl" ? "Geschatte APK-slaagkans" : "Estimated APK pass chance"}
              </div>
              <div className={`${styles.kpiValue} ${passClass}`}>{passChance.toFixed(0)}%</div>
              <div className={styles.kpiMeta}>{locale === "nl" ? "Dit voertuig" : "This vehicle"}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>
                <Wrench size={15} /> {locale === "nl" ? "Eigen geconstateerde gebreken" : "Own recorded defects"}
              </div>
              <div className={`${styles.kpiValue} ${defectClass}`}>{ownDefectCount}</div>
              <div className={styles.kpiMeta}>
                {locale === "nl" ? "Uit de keuringshistorie van dit kenteken" : "From this plate's inspection history"}
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3>
              <BarChart3 size={16} /> {locale === "nl" ? "Modelstatistieken" : "Model statistics"}
            </h3>
            {statsLoading ? (
              <p className={styles.statsLoading}>
                {locale === "nl" ? "Statistieken berekenen uit RDW-data..." : "Computing statistics from RDW data..."}
              </p>
            ) : stats ? (
              <>
                <p className={styles.statsSummary}>
                  {locale === "nl"
                    ? `Van ${stats.sampleSize} vergelijkbare ${cohortLabel} had ${cohortDefectPct}% geconstateerde gebreken bij keuringen.`
                    : `Out of ${stats.sampleSize} comparable ${cohortLabel} vehicles, ${cohortDefectPct}% had defects recorded during inspections.`}
                </p>
                {stats.topDefects.length === 0 ? (
                  <p className={styles.empty}>
                    {locale === "nl"
                      ? "Geen geconstateerde gebreken gevonden in de steekproef."
                      : "No recorded defects found in the sample."}
                  </p>
                ) : (
                  <div className={styles.defectList}>
                    {stats.topDefects.map((defect) => (
                      <div key={defect.code} className={styles.defectRow}>
                        <div className={styles.defectHead}>
                          <span className={styles.defectName}>{defect.description}</span>
                          <span className={styles.defectPct}>
                            {defect.pctOfVehicles.toLocaleString(locale === "nl" ? "nl-NL" : "en-GB")}%
                          </span>
                        </div>
                        <div className={styles.barTrack}>
                          <div
                            className={styles.barFill}
                            style={{ width: `${Math.min(100, Math.max(2, defect.pctOfVehicles))}%` }}
                          />
                        </div>
                        <div className={styles.defectMeta}>
                          {locale === "nl"
                            ? `Code ${defect.code}: bij ${defect.count} van ${stats.sampleSize} voertuigen geconstateerd`
                            : `Code ${defect.code}: recorded on ${defect.count} of ${stats.sampleSize} vehicles`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className={styles.sourceNote}>
                  {locale === "nl"
                    ? "Bron: RDW open data (keuringsmeldingen en gebrekomschrijvingen)."
                    : "Source: RDW open data (inspection findings and defect descriptions)."}
                </p>
              </>
            ) : (
              <p className={styles.empty}>
                {locale === "nl"
                  ? "Onvoldoende vergelijkbare voertuigen gevonden voor modelstatistieken."
                  : "Not enough comparable vehicles found for model statistics."}
              </p>
            )}
          </div>
        </PremiumLock>
      </div>
    </div>
  );
}
