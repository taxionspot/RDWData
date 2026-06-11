"use client";


import { AlertCircle, BarChart3, CheckCircle2, Wrench } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import { useI18n } from "@/lib/i18n/context";
import styles from "./ApkFailureIntelligenceScreen.module.css";

type Props = { plate: string; embedded?: boolean };

function toCategory(description: string): string {
  const text = description.toLowerCase();
  if (text.includes("rem") || text.includes("brake")) return "Braking System";
  if (text.includes("band") || text.includes("tyre")) return "Tyres & Alignment";
  if (text.includes("motor") || text.includes("engine") || text.includes("uitlaat")) return "Engine & Emissions";
  if (text.includes("licht") || text.includes("lamp")) return "Lighting & Electrical";
  if (text.includes("ophang") || text.includes("schok") || text.includes("susp")) return "Suspension & Chassis";
  return "General Mechanical";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

export function ApkFailureIntelligenceScreen({ plate, embedded = false }: Props) {
  const { locale } = useI18n();
  const { normalized, isValid, data, isLoading, isError } = useVehicleLookup(plate);

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
        <div className={styles.loadingCard}>{locale === "nl" ? "APK intelligence laden..." : "Loading APK intelligence..."}</div>
      </div>
    );
  }

  const enriched = data.enriched;
  const passChance = Number(enriched.apkPassChance ?? 0);
  const failChance = Math.max(0, 100 - passChance);
  const defectRows = (data.defects.length > 0 ? data.defects : data.inspections).map((row) => {
    const code = String(row.gebrek_identificatie ?? "");
    const description = String(row.gebrek_omschrijving ?? data.defectDescriptions[code] ?? (code || "Unknown"));
    return { code, description, category: toCategory(description) };
  });

  const categoryMap = new Map<string, { count: number; samples: string[] }>();
  defectRows.forEach((row) => {
    const existing = categoryMap.get(row.category) ?? { count: 0, samples: [] };
    existing.count += 1;
    if (row.description && existing.samples.length < 2 && !existing.samples.includes(row.description)) {
      existing.samples.push(row.description);
    }
    categoryMap.set(row.category, existing);
  });

  const recurringCategories = Array.from(categoryMap.entries())
    .map(([category, info]) => ({ category, ...info }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const repairBands = recurringCategories.map((item, index) => {
    const base = 180 + index * 70;
    const min = Math.round(base + item.count * 60);
    const max = Math.round(min * 1.9);
    return { category: item.category, min, max, frequency: item.count, samples: item.samples };
  });

  return (
    <div className={embedded ? undefined : styles.pageContainer}>
      <div className={embedded ? undefined : styles.contentContainer}>
        {!embedded && (
          <VehicleNavBar
            plate={normalized}
            subtitle={locale === "nl" ? "Model-Year APK Failure Intelligence" : "Model-Year APK Failure Intelligence"}
          />
        )}
        <PremiumLock
          featureName={locale === "nl" ? "APK Failure Intelligence" : "APK Failure Intelligence"}
          isLocked={true}
          plate={normalized}
          sectionKey="riskOverview"
        >
          <div className={styles.hero}>
            <h1>{locale === "nl" ? "Predictieve APK betrouwbaarheid" : "Predictive APK reliability"}</h1>
            <p>
              {locale === "nl"
                ? "Model-year-engine risico-inschatting met defectpatronen, pass/fail profiel en reparatiebanden."
                : "Model-year-engine reliability estimate with defect recurrence, pass/fail profile, and repair bands."}
            </p>
          </div>

          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><CheckCircle2 size={15} /> {locale === "nl" ? "Pass probability" : "Pass probability"}</div>
              <div className={styles.kpiValue}>{passChance.toFixed(0)}%</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><AlertCircle size={15} /> {locale === "nl" ? "Fail probability" : "Fail probability"}</div>
              <div className={styles.kpiValue}>{failChance.toFixed(0)}%</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><BarChart3 size={15} /> {locale === "nl" ? "Recurring groups" : "Recurring groups"}</div>
              <div className={styles.kpiValue}>{recurringCategories.length}</div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3>{locale === "nl" ? "Meest terugkerende defectcategorieën" : "Most recurring defect categories"}</h3>
            {recurringCategories.length === 0 ? (
              <p className={styles.empty}>{locale === "nl" ? "Geen defectpatronen gevonden." : "No defect patterns found."}</p>
            ) : (
              <>
                <div className={styles.chartWrapper}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={recurringCategories} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="category" type="category" width={140} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569' }} />
                      <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '12px', border: '1px solid #dce3ec', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={32}>
                        {recurringCategories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"][index % 5]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className={styles.list}>
                  {recurringCategories.map((item) => (
                    <div key={item.category} className={styles.item}>
                      <div className={styles.itemTitle}>{item.category}</div>
                      <div className={styles.itemMeta}>{item.count} {locale === "nl" ? "keer gezien" : "occurrences"}</div>
                      <div className={styles.itemSamples}>{item.samples.join(" | ")}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className={styles.panel}>
            <h3>{locale === "nl" ? "Geschatte reparatieband per defectgroep" : "Estimated repair band by defect group"}</h3>
            <div className={styles.repairGrid}>
              {repairBands.map((band) => (
                <div key={band.category} className={styles.repairCard}>
                  <div className={styles.repairHead}><Wrench size={14} /> {band.category}</div>
                  <div className={styles.repairValue}>{formatCurrency(band.min)} - {formatCurrency(band.max)}</div>
                  <div className={styles.repairMeta}>{band.frequency} {locale === "nl" ? "historische signalen" : "historical signals"}</div>
                </div>
              ))}
            </div>
          </div>
        </PremiumLock>
      </div>
    </div>
  );
}
