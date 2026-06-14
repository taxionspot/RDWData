"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { PremiumLock } from "../ui/PremiumLock";
import { NegotiationBlock } from "./NegotiationBlock";
import styles from "./EstimateRisksScreen.module.css";

type Props = {
  plate: string;
  embedded?: boolean;
};

function formatCurrency(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Schatting & risico: cost/estimate cards + NegotiationBlock risk band.
 * Extracted from MarketAnalysisScreen into its own section (g5-schatting).
 * Self-fetches via useVehicleLookup; locked behind marketAnalysis PremiumLock.
 */
export function EstimateRisksScreen({ plate, embedded = false }: Props) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const searchParams = useSearchParams();

  const mileageValue = useMemo(() => {
    const raw = searchParams?.get("mileage");
    if (!raw || raw.trim().length === 0) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }, [searchParams]);

  const { isValid, data, isLoading } = useVehicleLookup(plate, mileageValue);

  void embedded;

  if (!isValid || isLoading || !data || !data.enriched) {
    return null;
  }

  const enriched = data.enriched;
  const marketValue = enriched.estimatedValueNow ?? null;
  const marketValueMin = enriched.estimatedValueMin ?? null;
  const marketValueMax = enriched.estimatedValueMax ?? null;
  const marketConfidence = enriched.marketValueConfidence ?? null;

  const confidenceLabel =
    marketConfidence === "HIGH"
      ? nl ? "Hoog" : "High"
      : marketConfidence === "MEDIUM"
      ? nl ? "Gemiddeld" : "Medium"
      : marketConfidence === "LOW"
      ? nl ? "Laag" : "Low"
      : null;

  const mileageSignalLabel =
    enriched.mileageVerdict === "LOGISCH"
      ? nl ? "Kilometerstand logisch" : "Mileage plausible"
      : enriched.mileageVerdict === "TWIJFELACHTIG"
      ? nl ? "Kilometerstand twijfelachtig" : "Mileage questionable"
      : enriched.mileageVerdict === "ONLOGISCH"
      ? nl ? "Kilometerstand onlogisch" : "Mileage implausible"
      : enriched.estimatedMileageNow
      ? nl ? "Schatting via formule" : "Formula estimate"
      : null;

  const estimateRows = [
    { label: nl ? "Geschatte waarde" : "Estimated value", value: formatCurrency(marketValue) },
    {
      label: nl ? "Verwachte prijsrange" : "Expected price range",
      value:
        marketValueMin && marketValueMax
          ? `${formatCurrency(marketValueMin)} - ${formatCurrency(marketValueMax)}`
          : null
    },
    { label: nl ? "Betrouwbaarheid schatting" : "Estimate confidence", value: confidenceLabel },
    {
      label: nl ? "Geschatte kilometerstand" : "Estimated mileage",
      value: enriched.estimatedMileageNow ? `${enriched.estimatedMileageNow.toLocaleString("nl-NL")} km` : null
    },
    { label: nl ? "Kilometersignaal" : "Mileage signal", value: mileageSignalLabel },
    { label: nl ? "APK slagingskans" : "APK pass chance", value: enriched.apkPassChance != null ? `${enriched.apkPassChance}%` : null },
    {
      label: nl ? "Wegenbelasting (per kwartaal)" : "Road tax (per quarter)",
      value:
        enriched.roadTaxEstQuarter
          ? `${formatCurrency(enriched.roadTaxEstQuarter.min)} - ${formatCurrency(enriched.roadTaxEstQuarter.max)}`
          : null
    },
    { label: nl ? "Brandstofschatting / maand" : "Fuel est. / month", value: formatCurrency(enriched.fuelEstMonth) },
    { label: nl ? "Verzekering schatting / maand" : "Insurance est. / month", value: formatCurrency(enriched.insuranceEstMonth) },
    { label: nl ? "Onderhoudsrisico" : "Maintenance risk", value: enriched.maintenanceRiskScore != null ? `${enriched.maintenanceRiskScore.toFixed(1)} / 10` : null }
  ].filter((row) => row.value && row.value !== "-");

  return (
    <PremiumLock featureName={nl ? "Schatting & risico" : "Estimate & risk"} isLocked={true} plate={plate} sectionKey="marketAnalysis">
      <div className={styles.estimatesSection}>
        <div className={styles.estimatesHeader}>
          <div>
            <h3 className={styles.estimatesTitle}>{nl ? "Schattingen & financien" : "Estimates & finances"}</h3>
            <p className={styles.estimatesNote}>{nl ? "Marktwaarde, belasting en onderhoudssignaal." : "Market value, tax and the service signal."}</p>
          </div>
        </div>
        <div className={styles.estimatesGrid}>
          {estimateRows.map((row) => (
            <div key={row.label} className={styles.estimatesItem}>
              <div className={styles.estimatesLabel}>{row.label}</div>
              <div className={styles.estimatesValue}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      <NegotiationBlock
        locale={locale === "nl" ? "nl" : "en"}
        marketNow={marketValue}
        marketMin={marketValueMin}
        marketMax={marketValueMax}
        defects={data.defects?.length ?? 0}
        recalls={data.recalls?.length ?? 0}
        riskScore={Number(enriched.maintenanceRiskScore ?? 6)}
        mileagePlausible={enriched.userMileagePlausible ?? null}
      />
    </PremiumLock>
  );
}
