"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Pencil,
  RefreshCw,
  TrendingUp
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { formatDisplayPlate } from "@/lib/rdw/normalize";
import styles from "./MarketAnalysisScreen.module.css";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import { useI18n } from "@/lib/i18n/context";
import { computeMarketValueV3 } from "@/lib/rdw/heuristics";


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

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toLocaleString("nl-NL");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function MarketAnalysisScreen({ plate, embedded = false }: Props) {
  const { locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mileageFromQuery = useMemo(() => {
    const raw = searchParams.get("mileage");
    if (!raw || raw.trim().length === 0) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }, [searchParams]);
  const [mileageInput, setMileageInput] = useState(() => (mileageFromQuery != null ? String(mileageFromQuery) : ""));
  const mileageValue = useMemo(() => {
    if (mileageInput.trim().length === 0) return null;
    const value = Number(mileageInput);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }, [mileageInput]);
  const { normalized, isValid, data, isLoading, isError } = useVehicleLookup(plate, mileageValue);
  const [sellerPrice, setSellerPrice] = useState<string>("");
  const [appliedMileage, setAppliedMileage] = useState<number | null>(mileageValue);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const initializedMileage = useRef(false);

  useEffect(() => {
    setMileageInput(mileageFromQuery != null ? String(mileageFromQuery) : "");
  }, [mileageFromQuery]);

  useEffect(() => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    if (mileageValue == null) {
      params.delete("mileage");
    } else {
      params.set("mileage", String(mileageValue));
    }
    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [mileageValue, pathname, router, searchParams]);

  useEffect(() => {
    if (!data?.vehicle) return;
    if (!initializedMileage.current) {
      initializedMileage.current = true;
      setAppliedMileage(mileageValue);
      return;
    }
    setIsRecalculating(true);
    const timeout = setTimeout(() => {
      setAppliedMileage(mileageValue);
      setIsRecalculating(false);
    }, 500);
    return () => clearTimeout(timeout);
  }, [mileageValue, data?.vehicle]);

  const valuation = useMemo(() => {
    if (!data?.vehicle) return null;
    const first = data.vehicle.firstRegistrationWorld ? new Date(data.vehicle.firstRegistrationWorld) : null;
    const ageYears =
      first && !Number.isNaN(first.getTime())
        ? Math.max((Date.now() - first.getTime()) / (1000 * 60 * 60 * 24 * 365.25), 0)
        : null;
    return computeMarketValueV3({
      catalogPrice: data.vehicle.cataloguePrice,
      ageYears,
      brand: data.vehicle.brand,
      fuelType: data.vehicle.fuelType,
      bodyType: data.vehicle.bodyType,
      mileage: appliedMileage
    });
  }, [data?.vehicle, appliedMileage]);

  const marketValue = valuation?.value ?? data?.enriched?.estimatedValueNow ?? data?.vehicle.cataloguePrice ?? null;
  const marketValueMin = valuation?.min ?? data?.enriched?.estimatedValueMin ?? null;
  const marketValueMax = valuation?.max ?? data?.enriched?.estimatedValueMax ?? null;
  const marketConfidence = valuation?.confidence ?? data?.enriched?.marketValueConfidence ?? null;

  useEffect(() => {
    if (!sellerPrice && marketValue) {
      setSellerPrice(String(Math.round(marketValue + 900)));
    }
  }, [marketValue, sellerPrice]);

  const { verdictText, verdictTone, markerLeft } = useMemo(() => {
    if (!marketValue) {
      return {
        verdictText: locale === "nl" ? "Marktwaarde niet beschikbaar." : "Market value unavailable.",
        verdictTone: "neutral",
        markerLeft: "50%"
      };
    }

    const seller = Number(sellerPrice.replace(/[^0-9]/g, ""));
    const diff = seller - marketValue;

    const verdictTone = diff > 500 ? "warning" : diff < -500 ? "success" : "fair";
    const verdictText = diff > 500
      ? locale === "nl"
        ? `Voertuig staat EUR ${formatNumber(diff)} boven de marktwaarde.`
        : `Vehicle is priced EUR ${formatNumber(diff)} above market value.`
      : diff < -500
      ? locale === "nl"
        ? `Voertuig staat EUR ${formatNumber(Math.abs(diff))} onder de marktwaarde.`
        : `Vehicle is priced EUR ${formatNumber(Math.abs(diff))} below market value.`
      : locale === "nl"
      ? "Vraagprijs ligt in lijn met de marktwaarde."
      : "Listing price aligns with market value.";

    const marker = clamp(((diff + 3000) / 6000) * 100, 5, 95);

    return {
      verdictText,
      verdictTone,
      markerLeft: `${marker}%`
    };
  }, [marketValue, sellerPrice, locale]);

  const chartPoints = useMemo((): Array<{ label: string; value: number | null }> => {
    const year = new Date().getFullYear();
    if (!marketValue) {
      return [
        { label: String(year - 4), value: null },
        { label: String(year - 3), value: null },
        { label: String(year - 2), value: null },
        { label: String(year - 1), value: null },
        { label: locale === "nl" ? "Vandaag" : "Today", value: null }
      ];
    }
    const start = marketValue * 1.65;
    const step = (start - marketValue) / 4;
    return [
      { label: String(year - 4), value: Math.round(start) },
      { label: String(year - 3), value: Math.round(start - step) },
      { label: String(year - 2), value: Math.round(start - step * 2) },
      { label: String(year - 1), value: Math.round(start - step * 3) },
      { label: locale === "nl" ? "Vandaag" : "Today", value: Math.round(marketValue) }
    ];
  }, [marketValue, locale]);

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
        <div className={styles.loadingCard}>{locale === "nl" ? "Marktanalyse laden..." : "Loading market analysis..."}</div>
      </div>
    );
  }

  const v = data.vehicle;
  const enriched = data.enriched;
  const estimateRows = [
    { label: locale === "nl" ? "Geschatte waarde" : "Estimated value", value: formatCurrency(marketValue) },
    {
      label: locale === "nl" ? "Waardebandbreedte" : "Value range",
      value:
        marketValueMin && marketValueMax
          ? `${formatCurrency(marketValueMin)} - ${formatCurrency(marketValueMax)}`
          : "-"
    },
    { label: locale === "nl" ? "Marktbetrouwbaarheid" : "Market confidence", value: marketConfidence ?? "UNKNOWN" },
    { label: locale === "nl" ? "Marktsignaal" : "Market signal", value: enriched.mileageVerdict ?? "UNKNOWN" },
    { label: locale === "nl" ? "APK slagingskans" : "APK pass chance", value: `${enriched.apkPassChance}%` },
    {
      label: locale === "nl" ? "Wegenbelasting (per kwartaal)" : "Road tax (per quarter)",
      value:
        enriched.roadTaxEstQuarter
          ? `${formatCurrency(enriched.roadTaxEstQuarter.min)} - ${formatCurrency(enriched.roadTaxEstQuarter.max)}`
          : "-"
    },
    { label: locale === "nl" ? "Brandstofschatting / maand" : "Fuel est. / month", value: formatCurrency(enriched.fuelEstMonth) },
    { label: locale === "nl" ? "Verzekering schatting / maand" : "Insurance est. / month", value: formatCurrency(enriched.insuranceEstMonth) },
    { label: locale === "nl" ? "Onderhoudsrisico" : "Maintenance risk", value: `${enriched.maintenanceRiskScore.toFixed(1)} / 10` }
  ];
  const displayPlate = formatDisplayPlate(normalized);
  const title = [v.brand, v.tradeName, v.year].filter(Boolean).join(" ");

  return (
    <div className={embedded ? undefined : styles.pageContainer}>
      <div className={embedded ? undefined : styles.contentContainer}>
        {!embedded && (
          <VehicleNavBar plate={normalized} subtitle={`${locale === "nl" ? "Marktanalyse" : "Market analysis"} · ${displayPlate}`} />
        )}

        <PremiumLock featureName={locale === "nl" ? "Marktanalyse" : "Market Analysis"} isLocked={true} plate={normalized} sectionKey="marketAnalysis">
          <div className={styles.dashboardHeader}>
            <h1 className={styles.dashboardTitle}>{locale === "nl" ? "Marktprijsanalyse" : "Market Price Analysis"}</h1>
            <p className={styles.dashboardSubtitle}>{title || (locale === "nl" ? "Voertuigprofiel" : "Vehicle profile")}</p>
          </div>

          <div className={styles.mainGrid}>
            <div className={styles.panel}>
              <div className={styles.valueHero}>
                <div className={styles.valueLabel}>{locale === "nl" ? "Geschatte marktwaarde" : "Estimated Market Value"}</div>
                <div className={styles.valueAmount}>
                  {isRecalculating ? <RefreshCw size={30} className={styles.inlineSpinner} /> : formatCurrency(marketValue)}
                </div>
                <div className={styles.valueContext}>
                  {isRecalculating ? (
                    <>
                      <RefreshCw size={16} className={styles.inlineSpinner} />
                      {locale === "nl" ? "Marktwaarde herberekenen..." : "Recalculating market value..."}
                    </>
                  ) : (
                    <>
                      <TrendingUp size={16} />
                      {marketValue ? (locale === "nl" ? "Hoge vraag in de markt" : "High demand in current market") : locale === "nl" ? "Wacht op marktsignaal" : "Awaiting market signal"}
                    </>
                  )}
                </div>
                <div className={styles.valueRange}>
                  {marketValueMin != null && marketValueMax != null
                    ? `80% ${locale === "nl" ? "bandbreedte" : "range"}: ${formatCurrency(marketValueMin)} - ${formatCurrency(marketValueMax)}`
                    : locale === "nl"
                    ? "80% bandbreedte niet beschikbaar"
                    : "80% range unavailable"}
                  {marketConfidence ? (
                    <span className={styles.valueConfidence}>{locale === "nl" ? "Betrouwbaarheid" : "Confidence"}: {marketConfidence}</span>
                  ) : null}
                </div>
              </div>

              <div className={styles.chartContainer}>
                <div className={styles.chartHeader}>
                  <div className={styles.chartTitle}>{locale === "nl" ? "Waardetrend over tijd" : "Value trend over time"}</div>
                  <div className={styles.chartNote}>{locale === "nl" ? "Gebaseerd op vergelijkbare advertenties" : "Based on similar listings"}</div>
                </div>

                <div className={styles.chartInteractive}>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={chartPoints} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `€${v}`} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} labelStyle={{ color: '#0f172a' }} itemStyle={{ color: '#2563eb', fontWeight: 'bold' }} />
                      <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className={`${styles.panel} ${styles.calcPanel}`}>
              <div className={styles.calcHeader}>
                <div className={styles.calcTitle}>{locale === "nl" ? "Controleer vraagprijs" : "Check a listing price"}</div>
                <div className={styles.calcSubtitle}>{locale === "nl" ? "Vergelijk de prijs van de verkoper met onze marktdata" : "Compare seller's price against our market data"}</div>
              </div>

              <div className={styles.inputGroup}>
                <div className={styles.inputLabel}>{locale === "nl" ? "Kilometerstand voor nauwkeurige waardering (optioneel)" : "Mileage for more accurate valuation (optional)"}</div>
                <input
                  className={styles.textInput}
                  inputMode="numeric"
                  value={mileageInput}
                  onChange={(event) => setMileageInput(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder={locale === "nl" ? "Bijv. 142000" : "E.g. 142000"}
                />
                <div className={styles.inputHint}>
                  {locale === "nl"
                    ? "Voer kilometerstand in voor een preciezere marktwaarde. Deze waarde wordt ook meegenomen in AI-analyse en PDF-rapport."
                    : "Enter mileage for a more precise market value. This will also be used in AI analysis and the PDF report."}
                </div>
              </div>

              <div className={styles.inputGroup}>
                <div className={styles.inputLabel}>{locale === "nl" ? "Vraagprijs verkoper" : "Seller asking price"}</div>
                <div className={styles.inputMock}>
                  <span className={styles.inputMockText}>EUR</span>
                  <input
                    className={styles.priceInput}
                    inputMode="numeric"
                    value={sellerPrice}
                    onChange={(event) => setSellerPrice(event.target.value)}
                    placeholder="14000"
                  />
                  <span className={styles.inputMockIcon}>
                    <Pencil size={20} />
                  </span>
                </div>
              </div>

              <div className={styles.meterSection}>
                <div className={styles.meterTrack}>
                  <div className={styles.meterMarker} style={{ left: markerLeft }} />
                </div>
                <div className={styles.meterLabels}>
                  <span className={styles.meterCheap}>{locale === "nl" ? "Goedkoop" : "Cheap"}</span>
                  <span className={styles.meterFair}>{locale === "nl" ? "Redelijk" : "Fair"}</span>
                  <span className={styles.meterOverpriced}>{locale === "nl" ? "Te duur" : "Overpriced"}</span>
                </div>
              </div>

              <div className={`${styles.verdictBox} ${styles[verdictTone] ?? ""}`}>
                <div className={styles.verdictHeader}>
                  <div className={styles.verdictIcon}>
                    <AlertCircle size={14} />
                  </div>
                  <div className={styles.verdictTitle}>{locale === "nl" ? "Prijsadvies" : "Price Verdict"}</div>
                </div>
                <div className={styles.verdictText}>{verdictText}</div>
              </div>
            </div>
          </div>

          <div className={styles.estimatesSection}>
            <div className={styles.estimatesHeader}>
              <div>
                <h3 className={styles.estimatesTitle}>{locale === "nl" ? "Schattingen & financien" : "Estimates & finances"}</h3>
                <p className={styles.estimatesNote}>{locale === "nl" ? "Marktwaarde, belasting en onderhoudssignaal." : "Market value, tax and the service signal."}</p>
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
        </PremiumLock>

      </div>
    </div>
  );
}

