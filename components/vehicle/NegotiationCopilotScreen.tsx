"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, BadgeEuro, HandCoins, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import { useI18n } from "@/lib/i18n/context";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import styles from "./NegotiationCopilotScreen.module.css";

type Props = { plate: string };
type CopilotAi = {
  script: string;
  offerStrategy: string;
  walkAwayReason: string;
  repairReserveAdvice: string;
  talkingPoints: string[];
};
type CopilotPricing = {
  offerMin: number;
  offerMax: number;
  walkAway: number;
  reserveMin: number;
  reserveMax: number;
};

function formatCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

function roundTo50(value: number): number {
  return Math.round(value / 50) * 50;
}

export function NegotiationCopilotScreen({ plate }: Props) {
  const { locale } = useI18n();
  const searchParams = useSearchParams();
  const mileageInput = useMemo(() => {
    const raw = searchParams.get("mileage");
    if (!raw || raw.trim().length === 0) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }, [searchParams]);
  const { normalized, isValid, data, isLoading, isError } = useVehicleLookup(plate, mileageInput);

  const [aiAdvice, setAiAdvice] = useState<CopilotAi | null>(null);
  const [aiPricing, setAiPricing] = useState<CopilotPricing | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const v = data?.vehicle;
  const e = data?.enriched as Record<string, unknown> | undefined;
  const marketNow = Number(e?.estimatedValueNow ?? 0);
  const marketMin = Number(e?.estimatedValueMin ?? marketNow * 0.9);
  const marketMax = Number(e?.estimatedValueMax ?? marketNow * 1.1);
  const riskScore = Number(e?.maintenanceRiskScore ?? 6);
  const defects = data?.defects.length ?? 0;
  const recalls = data?.recalls.length ?? 0;
  const mileagePlausible = e?.userMileagePlausible === null || e?.userMileagePlausible === undefined ? null : Boolean(e.userMileagePlausible);
  const mileageDelta = Number(e?.userMileageDelta ?? 0);

  const riskPenalty =
    defects * 0.015 + recalls * 0.02 + Math.max(0, riskScore - 5) * 0.02 + (mileagePlausible === false ? 0.03 : 0);

  const offerMin = roundTo50(Math.max(500, marketMin * (1 - riskPenalty)));
  const offerMax = roundTo50(Math.max(offerMin + 150, marketNow * (1 - riskPenalty * 0.35)));
  const walkAway = roundTo50(Math.max(offerMax + 200, marketMax * (1 + riskPenalty * 0.15)));
  const reserveMin = roundTo50(Math.max(400, marketNow * 0.04 + defects * 150 + recalls * 250));
  const reserveMax = roundTo50(Math.max(reserveMin + 150, marketNow * 0.08 + defects * 260 + recalls * 450));

  useEffect(() => {
    if (isLoading || isError || !normalized || !data?.enriched) return;
    let active = true;
    setAiLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/vehicle/${encodeURIComponent(normalized)}/negotiation-copilot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lang: locale,
            mileage: mileageInput,
            context: { offerMin, offerMax, walkAway, reserveMin, reserveMax }
          })
        });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as { ai?: CopilotAi; pricing?: CopilotPricing };
        if (active && payload.ai) setAiAdvice(payload.ai);
        if (active && payload.pricing) setAiPricing(payload.pricing);
      } finally {
        if (active) setAiLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [locale, mileageInput, normalized, offerMax, offerMin, reserveMax, reserveMin, walkAway, isLoading, isError, data]);

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
        <div className={styles.loadingCard}>{locale === "nl" ? "Onderhandelcoach laden..." : "Loading negotiation copilot..."}</div>
      </div>
    );
  }

  const talkingPoints = [
    defects > 0
      ? locale === "nl"
        ? `${defects} defectrecord(s) in APK-historie: vraag om facturen en gebruik dit voor prijsdruk.`
        : `${defects} defect record(s) in inspection history: ask for invoices and use this for price pressure.`
      : locale === "nl"
      ? "Geen defecthistorie zichtbaar: benadruk als positief punt maar vraag alsnog om onderhoudsbewijs."
      : "No defect history visible: use as a positive point but still request maintenance proof.",
    riskScore >= 7
      ? locale === "nl"
        ? `Onderhoudsrisico ${riskScore.toFixed(1)}/10: onderhandel extra reserve in de deal.`
        : `Maintenance risk ${riskScore.toFixed(1)}/10: negotiate extra reserve into the deal.`
      : locale === "nl"
      ? `Onderhoudsrisico ${riskScore.toFixed(1)}/10: focus op snelle deal tegen onderkant biedrange.`
      : `Maintenance risk ${riskScore.toFixed(1)}/10: push for quick close near lower offer range.`,
    mileagePlausible === false
      ? locale === "nl"
        ? `Opgegeven kilometerstand wijkt af (delta ${Math.abs(mileageDelta).toLocaleString("nl-NL")} km): eis onafhankelijke controle.`
        : `Entered mileage deviates (delta ${Math.abs(mileageDelta).toLocaleString("nl-NL")} km): require independent verification.`
      : locale === "nl"
      ? "Kilometerbeeld oogt plausibel op basis van trend; gebruik dit alleen als ondersteunend argument."
      : "Mileage profile looks plausible from trend; use as supporting argument only.",
    recalls > 0
      ? locale === "nl"
        ? `${recalls} recall(s) gevonden: laat deze eerst oplossen of vraag directe prijsverlaging.`
        : `${recalls} recall(s) found: require completion first or request direct price reduction.`
      : locale === "nl"
      ? "Geen open recalls zichtbaar: sterk punt in je onderhandeling."
      : "No open recalls visible: strong negotiation point."
  ];

  return (
    <div className={styles.pageContainer}>
      <div className={styles.contentContainer}>
        <VehicleNavBar plate={normalized} subtitle={locale === "nl" ? "Onderhandelcoach" : "Negotiation Copilot"} />
        <PremiumLock
          featureName={locale === "nl" ? "Onderhandelcoach" : "Negotiation Copilot"}
          isLocked={true}
          plate={normalized}
          sectionKey="marketAnalysis"
        >
          <div className={styles.hero}>
            <h1>{locale === "nl" ? "Onderhandelcoach" : "Negotiation Copilot"}</h1>
            <p>
              {locale === "nl"
                ? "Beslis sneller met concrete biedstrategie op basis van marktwaarde, risico en conditiesignalen."
                : "Decide faster with a concrete offer strategy based on market value, risk, and condition signals."}
            </p>
          </div>

          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardTitle}><HandCoins size={16} /> {locale === "nl" ? "Aanbevolen biedrange" : "Recommended offer range"}</div>
              <div className={styles.bigValue}>{formatCurrency(aiPricing?.offerMin ?? offerMin)} - {formatCurrency(aiPricing?.offerMax ?? offerMax)}</div>
              <div className={styles.note}>
                {locale === "nl"
                  ? "Start bij onderkant, sluit idealiter binnen deze band."
                  : "Start near the lower bound and close within this band."}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}><ShieldAlert size={16} /> {locale === "nl" ? "Walk-away grens" : "Walk-away threshold"}</div>
              <div className={styles.bigValue}>{formatCurrency(aiPricing?.walkAway ?? walkAway)}</div>
              <div className={styles.note}>
                {locale === "nl"
                  ? "Boven deze prijs neemt je downside toe versus risico en markt."
                  : "Above this price your downside increases against risk and market."}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}><Wrench size={16} /> {locale === "nl" ? "Reparatiereserve" : "Repair reserve suggestion"}</div>
              <div className={styles.bigValue}>{formatCurrency(aiPricing?.reserveMin ?? reserveMin)} - {formatCurrency(aiPricing?.reserveMax ?? reserveMax)}</div>
              <div className={styles.note}>
                {locale === "nl"
                  ? "Reserveer dit budget voor verrassingskosten in jaar 1."
                  : "Keep this budget for surprise costs in year 1."}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}><BadgeEuro size={16} /> {locale === "nl" ? "Referentiewaarde" : "Reference value"}</div>
              <div className={styles.bigValue}>{formatCurrency(marketNow)}</div>
              <div className={styles.note}>
                {formatCurrency(marketMin)} - {formatCurrency(marketMax)} ({data.enriched.marketValueConfidence ?? "LOW"})
              </div>
            </div>
          </div>

          <p style={{ margin: "0 0 4px", fontSize: 13, lineHeight: 1.5, color: "#64748b" }}>
            {locale === "nl"
              ? "Hoe berekend: de biedrange komt uit onze marktwaarde (onder- en bovengrens), bijgesteld voor risicosignalen zoals defecten, recalls, onderhoudsrisico en een afwijkende kilometerstand. De reparatiereserve schaalt mee met die signalen."
              : "How this is calculated: the offer range comes from our market value (lower and upper bound), adjusted for risk signals such as defects, recalls, maintenance risk, and any mileage mismatch. The repair reserve scales with those signals."}
          </p>

          <div className={styles.interactiveChartCard}>
            <h3>{locale === "nl" ? "Visuele biedstrategie" : "Visual offer strategy"}</h3>
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[
                  { name: locale === "nl" ? "Startbod" : "Start Offer", value: aiPricing?.offerMin ?? offerMin, fill: "#3b82f6" },
                  { name: locale === "nl" ? "Doelprijs" : "Target Price", value: aiPricing?.offerMax ?? offerMax, fill: "#10b981" },
                  { name: locale === "nl" ? "Marktwaarde" : "Market Value", value: marketNow, fill: "#64748b" },
                  { name: locale === "nl" ? "Walk Away" : "Walk Away", value: aiPricing?.walkAway ?? walkAway, fill: "#ef4444" }
                ]} layout="vertical" margin={{ left: 24, right: 24, top: 12, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.4} />
                  <XAxis type="number" domain={['dataMin - 1000', 'dataMax + 1000']} tickFormatter={(v) => `€${v}`} />
                  <YAxis dataKey="name" type="category" width={90} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} cursor={{fill: 'transparent'}} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={32}>
                    {
                      [0,1,2,3].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={["#3b82f6", "#10b981", "#64748b", "#ef4444"][index]} />
                      ))
                    }
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.talkTrack}>
            <h3>{locale === "nl" ? "Praatpunten met bewijs" : "Evidence-backed talking points"}</h3>
            <div className={styles.aiScriptBox}>
              <div className={styles.aiScriptTitle}>{locale === "nl" ? "Claude onderhandelingsscript" : "Claude negotiation script"}</div>
              <div className={styles.aiScriptText}>
                {aiLoading
                  ? (
                    <span className={styles.inlineLoading}>
                      <RefreshCw size={14} className={styles.inlineSpinner} />
                      {locale === "nl" ? "Claude script wordt gegenereerd..." : "Generating Claude script..."}
                    </span>
                  )
                  : aiAdvice?.script ??
                    (locale === "nl"
                      ? "AI-script tijdelijk niet beschikbaar."
                      : "AI script temporarily unavailable.")}
              </div>
              {aiAdvice ? (
                <div className={styles.aiHints}>
                  <div>{aiAdvice.offerStrategy}</div>
                  <div>{aiAdvice.walkAwayReason}</div>
                  <div>{aiAdvice.repairReserveAdvice}</div>
                </div>
              ) : null}
            </div>
            <ul>
              {(aiAdvice?.talkingPoints?.length ? aiAdvice.talkingPoints : talkingPoints).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className={styles.footerNote}>
              {locale === "nl"
                ? `Profiel: ${v?.brand ?? "-"} ${v?.tradeName ?? ""} · Onderhoudsrisico ${riskScore.toFixed(1)}/10 · Defecten ${defects}`
                : `Profile: ${v?.brand ?? "-"} ${v?.tradeName ?? ""} · Maintenance risk ${riskScore.toFixed(1)}/10 · Defects ${defects}`}
            </div>
          </div>
        </PremiumLock>
      </div>
    </div>
  );
}
