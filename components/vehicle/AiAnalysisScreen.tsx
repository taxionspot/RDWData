"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, BadgeEuro, CheckCircle2, Lightbulb, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useAiReport } from "@/hooks/useAiReport";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { PremiumLock } from "../ui/PremiumLock";
import styles from "./AiAnalysisScreen.module.css";

type Props = { plate: string; embedded?: boolean };

function formatCurrency(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

/**
 * Claude-analyse van het volledige voertuigprofiel: samenvatting in gewone
 * taal, sterke punten, aandachtspunten en een onderbouwde waardering.
 */
export function AiAnalysisScreen({ plate }: Props) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const searchParams = useSearchParams();
  const mileageInput = useMemo(() => {
    const raw = searchParams?.get("mileage");
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }, [searchParams]);

  const { normalized, isValid } = useVehicleLookup(plate);
  const { insights, valuation, loading } = useAiReport(isValid ? normalized : "", mileageInput);

  if (!isValid) return null;

  const levelClass =
    insights?.riskLevel === "LOW" ? styles.levelLow : insights?.riskLevel === "HIGH" ? styles.levelHigh : styles.levelMedium;
  const levelLabel =
    insights?.riskLevel === "LOW"
      ? nl ? "Laag aandachtsniveau" : "Low attention level"
      : insights?.riskLevel === "HIGH"
      ? nl ? "Hoog aandachtsniveau" : "High attention level"
      : nl ? "Gemiddeld aandachtsniveau" : "Medium attention level";

  const valueNow = formatCurrency(valuation?.estimatedValueNow);
  const valueMin = formatCurrency(valuation?.estimatedValueMin);
  const valueMax = formatCurrency(valuation?.estimatedValueMax);

  return (
    <PremiumLock featureName={nl ? "AI-analyse" : "AI analysis"} isLocked={true} plate={normalized} sectionKey="riskOverview">
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.eyebrow}>
              <Sparkles size={13} />
              {nl ? "AI-analyse op basis van officiële data" : "AI analysis based on official data"}
            </span>
            <div className={styles.title}>
              {nl ? "Wat betekent dit rapport voor jou?" : "What does this report mean for you?"}
            </div>
          </div>
          {insights ? <span className={`${styles.levelChip} ${levelClass}`}>{levelLabel}</span> : null}
        </div>

        {loading && !insights ? (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            {nl ? "Claude analyseert het volledige voertuigprofiel..." : "Claude is analysing the full vehicle profile..."}
          </div>
        ) : null}

        {insights?.summary ? <p className={styles.summary}>{insights.summary}</p> : null}

        {insights && (insights.positives.length > 0 || insights.risks.length > 0) ? (
          <div className={styles.columns}>
            {insights.positives.length > 0 ? (
              <div className={styles.column}>
                <div className={styles.columnTitle}>
                  <CheckCircle2 size={16} className={styles.positiveIcon} />
                  {nl ? "Sterke punten" : "Strengths"}
                </div>
                {insights.positives.map((item) => (
                  <div key={item} className={styles.item}>
                    <CheckCircle2 size={14} className={styles.positiveIcon} />
                    {item}
                  </div>
                ))}
              </div>
            ) : null}
            {insights.risks.length > 0 ? (
              <div className={styles.column}>
                <div className={styles.columnTitle}>
                  <AlertTriangle size={16} className={styles.riskIcon} />
                  {nl ? "Aandachtspunten" : "Watch-outs"}
                </div>
                {insights.risks.map((item) => (
                  <div key={item} className={styles.item}>
                    <AlertTriangle size={14} className={styles.riskIcon} />
                    {item}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {valueNow ? (
          <div className={styles.valuationRow}>
            <BadgeEuro size={26} color="#1d4ed8" />
            <div className={styles.valuationMeta}>
              <span className={styles.valuationLabel}>{nl ? "Geschatte marktwaarde" : "Estimated market value"}</span>
              <span className={styles.valuationValue}>{valueNow}</span>
            </div>
            {valueMin && valueMax ? (
              <div className={styles.valuationMeta}>
                <span className={styles.valuationLabel}>{nl ? "Verwachte prijsrange" : "Expected price range"}</span>
                <span className={styles.valuationRange}>
                  {valueMin} - {valueMax}
                </span>
              </div>
            ) : null}
            {valuation?.explanation ? <p className={styles.valuationExplanation}>{valuation.explanation}</p> : null}
          </div>
        ) : null}

        {insights?.recommendation ? (
          <div className={styles.recommendation}>
            <Lightbulb size={18} />
            {insights.recommendation}
          </div>
        ) : null}

        <p className={styles.disclaimer}>
          {nl
            ? "Automatische analyse op basis van officiële RDW-data en onze rekenmodellen. Dit is informatie, geen aankoopadvies. Laat bij twijfel altijd een aankoopkeuring uitvoeren."
            : "Automated analysis based on official RDW data and our models. This is information, not purchase advice. When in doubt, get a professional inspection."}
        </p>
      </div>
    </PremiumLock>
  );
}
