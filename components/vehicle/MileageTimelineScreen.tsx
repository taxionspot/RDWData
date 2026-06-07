"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  UserPlus,
  Wrench
} from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import styles from "./MileageTimelineScreen.module.css";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import { useI18n } from "@/lib/i18n/context";


type Props = {
  plate: string;
};

const USAGE_LABELS: Record<string, { nl: string; en: string }> = {
  Recreational: { nl: "Weinig gebruikt", en: "Recreational" },
  Average: { nl: "Gemiddeld gebruik", en: "Average" },
  "Above average": { nl: "Bovengemiddeld", en: "Above average" },
  Intensive: { nl: "Intensief (zakelijk)", en: "Intensive" },
  "Very intensive": { nl: "Zeer intensief (taxi/koerier)", en: "Very intensive (taxi/courier)" }
};

// Plain-language explanation of the mileage/NAP verdict, driven by the REAL
// RDW verdict (and our APK-based verdict) — never a fixed optimistic message.
function mileageVerdictCopy(
  napVerdict: string | null,
  mileageVerdict: string | null | undefined,
  locale: "nl" | "en"
): { label: string; explanation: string; ok: boolean } {
  const nap = (napVerdict ?? "").toLowerCase();
  const illogical = nap.includes("onlogisch") || mileageVerdict === "ONLOGISCH";
  const doubtful = nap.includes("twijfel") || mileageVerdict === "TWIJFELACHTIG";
  if (illogical) {
    return {
      label: locale === "nl" ? "Onlogisch" : "Illogical",
      explanation:
        locale === "nl"
          ? "Let op: de geregistreerde kilometerstand lijkt teruggedraaid of onlogisch. Koop niet zonder onafhankelijke controle."
          : "Warning: the recorded odometer appears rolled back or illogical. Do not buy without an independent inspection.",
      ok: false
    };
  }
  if (doubtful) {
    return {
      label: locale === "nl" ? "Twijfelachtig" : "Doubtful",
      explanation:
        locale === "nl"
          ? "De kilometerhistorie vertoont onregelmatigheden. Vraag de verkoper om onderbouwing (facturen, onderhoudsboekje)."
          : "The mileage history shows irregularities. Ask the seller for documentation (invoices, service book).",
      ok: false
    };
  }
  if (nap.includes("logisch")) {
    return {
      label: locale === "nl" ? "Logisch" : "Logical",
      explanation:
        locale === "nl"
          ? "De geregistreerde kilometerstanden lopen logisch op; geen aanwijzing voor terugdraaien (RDW NAP-controle)."
          : "Recorded odometer readings increase logically; no sign of a rollback (RDW NAP check).",
      ok: true
    };
  }
  return {
    label: locale === "nl" ? "Geen oordeel" : "No verdict",
    explanation:
      locale === "nl"
        ? "Er is (nog) geen NAP-oordeel beschikbaar voor dit voertuig. Beoordeel de kilometerstanden hieronder zelf."
        : "No NAP verdict is available (yet) for this vehicle. Review the odometer readings below yourself.",
    ok: true
  };
}

type TimelineEvent = {
  id: string;
  type: "apk" | "workshop" | "owner";
  title: string;
  date: string;
  mileage: number | null;
  description: string;
};

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toLocaleString("nl-NL");
}

function formatDate(value: string | null, locale: "nl" | "en") {
  if (!value) return locale === "nl" ? "Onbekend" : "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
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

function parseDate(record: Record<string, unknown>): string | null {
  const candidates = [
    record.datum_keuring,
    record.datum_keuring_dt,
    record.meld_datum_door_keuringsinstantie,
    record.datum,
    record.datum_dt,
    record.datum_eerste_toelating
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (value.includes("T")) return value.split("T")[0];
  return value;
}

function parseEventType(record: Record<string, unknown>): "apk" | "workshop" | "owner" {
  const raw = String(record.soort_keuring ?? record.soort_keuring_omschrijving ?? "").toLowerCase();
  if (raw.includes("apk") || raw.includes("keuring")) return "apk";
  if (raw.includes("werkplaats") || raw.includes("workshop")) return "workshop";
  return "apk";
}

function EventIcon({ type }: { type: TimelineEvent["type"] }) {
  if (type === "owner") return <UserPlus size={14} />;
  if (type === "workshop") return <Wrench size={14} />;
  return <FileCheck2 size={14} />;
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metricChip}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
    </div>
  );
}

export function MileageTimelineScreen({ plate }: Props) {
  const { locale } = useI18n();
  const { normalized, isValid, data, isLoading, isError } = useVehicleLookup(plate);
  const [actualKm, setActualKm] = useState("");
  const nl = locale === "nl";

  const events = useMemo(() => {
    if (!data?.inspections) return [] as TimelineEvent[];

    const grouped = new Map<string, { date: string; mileage: number | null; type: TimelineEvent["type"] }>();

    for (const record of data.inspections) {
      const rawDate = parseDate(record);
      const dateValue = normalizeDate(rawDate);
      if (!dateValue) continue;
      const mileage = parseMileage(record);
      const type = parseEventType(record);

      if (!grouped.has(dateValue)) {
        grouped.set(dateValue, { date: dateValue, mileage, type });
      } else if (grouped.get(dateValue)!.mileage === null && mileage !== null) {
        grouped.get(dateValue)!.mileage = mileage;
      }
    }

    const list: TimelineEvent[] = Array.from(grouped.values()).map((entry, index) => ({
      id: `${entry.date}-${index}`,
      type: entry.type,
      title: entry.type === "workshop" ? (locale === "nl" ? "Werkplaatsrecord" : "Workshop Record") : locale === "nl" ? "APK-keuring" : "APK Inspection",
      date: entry.date,
      mileage: entry.mileage,
      description: entry.type === "workshop"
        ? locale === "nl"
          ? "Onderhouds- en service-interval."
          : "Maintenance and service interval."
        : locale === "nl"
        ? "Kilometerstand geregistreerd tijdens keuring."
        : "Mileage recorded during inspection."
    }));

    if (data.vehicle.firstRegistrationWorld) {
      list.push({
        id: "first-registration",
        type: "owner",
        title: locale === "nl" ? "Eerste registratie" : "First Registration",
        date: data.vehicle.firstRegistrationWorld,
        mileage: null,
        description: locale === "nl" ? "Eerste toelating en registratie." : "Initial delivery and registration."
      });
    }

    return list
      .filter((event) => event.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, locale]);

  const latestMileage = events.length ? events[events.length - 1].mileage : null;
  const firstDate = events.length ? new Date(events[0].date).getTime() : null;
  const lastDate = events.length ? new Date(events[events.length - 1].date).getTime() : null;
  const avgAnnual = useMemo(() => {
    if (!firstDate || !lastDate || !latestMileage) return null;
    const years = Math.max((lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365.25), 1);
    return Math.round(latestMileage / years);
  }, [firstDate, lastDate, latestMileage]);

  const chartPoints = useMemo(() => {
    if (!events.length) return [];
    return events.map((event) => ({
      date: event.date,
      mileage: event.mileage ?? 0,
      type: event.type
    }));
  }, [events]);

  if (!isValid || isError) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingCard}>{locale === "nl" ? "Voertuig niet gevonden." : "Vehicle not found."}</div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingCard}>{locale === "nl" ? "Kilometertijdlijn laden..." : "Loading mileage timeline..."}</div>
      </div>
    );
  }


  const width = 800;
  const height = 300;
  const paddingLeft = 60;
  const paddingBottom = 60;
  const paddingTop = 20;
  const paddingRight = 20;

  const chartMileageMax = Math.max(...chartPoints.map((p) => p.mileage), 1);

  const points = chartPoints.map((point, index) => {
    const x =
      paddingLeft +
      (index / Math.max(chartPoints.length - 1, 1)) * (width - paddingLeft - paddingRight);
    const y =
      paddingTop +
      (1 - point.mileage / chartMileageMax) * (height - paddingTop - paddingBottom);
    return { ...point, x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const areaPath = points.length
    ? `M ${points[0].x} ${height - paddingBottom} ${points
        .map((point) => `L ${point.x} ${point.y}`)
        .join(" ")} L ${points[points.length - 1].x} ${height - paddingBottom} Z`
    : "";

  const yLabels = [chartMileageMax, chartMileageMax * 0.66, chartMileageMax * 0.33, 0];

  const verdict = mileageVerdictCopy(data.vehicle.napVerdict, data.enriched?.mileageVerdict, locale);

  // Our extrapolated current-mileage estimate (from the weighted-regression model)
  // plus an optional comparison against the reading the buyer enters.
  const est = data.enriched?.estimatedMileageNow ?? null;
  const estMin = data.enriched?.estimatedMileageMin ?? null;
  const estMax = data.enriched?.estimatedMileageMax ?? null;
  const usageProfile = data.enriched?.mileageUsageProfile ?? null;
  const usageLabel = usageProfile ? USAGE_LABELS[usageProfile]?.[locale] ?? usageProfile : null;

  const actualKmValue = (() => {
    const n = Number(actualKm.replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const comparison: { tone: "good" | "warn" | "bad" | "neutral"; message: string } | null = (() => {
    if (actualKmValue == null) return null;
    if (latestMileage != null && actualKmValue < latestMileage) {
      return {
        tone: "bad",
        message: nl
          ? `Let op: ${formatNumber(actualKmValue)} km is lager dan de laatst geregistreerde stand (${formatNumber(latestMileage)} km). Dit kan wijzen op een teruggedraaide teller.`
          : `Warning: ${formatNumber(actualKmValue)} km is lower than the last recorded reading (${formatNumber(latestMileage)} km). This may indicate a rolled-back odometer.`
      };
    }
    if (est == null) {
      return {
        tone: "neutral",
        message: nl
          ? "We hebben te weinig keuringsdata om je opgave betrouwbaar te vergelijken."
          : "We have too little inspection data to compare your reading reliably."
      };
    }
    if (estMin != null && estMax != null && actualKmValue >= estMin && actualKmValue <= estMax) {
      return {
        tone: "good",
        message: nl
          ? `Dit komt overeen met onze schatting (~${formatNumber(est)} km). Geen opvallende afwijking.`
          : `This matches our estimate (~${formatNumber(est)} km). No notable deviation.`
      };
    }
    const delta = actualKmValue - est;
    return {
      tone: "warn",
      message: nl
        ? `Dit ligt ${formatNumber(Math.abs(delta))} km ${delta > 0 ? "hoger" : "lager"} dan onze schatting (~${formatNumber(est)} km). Vraag de verkoper om uitleg en facturen.`
        : `This is ${formatNumber(Math.abs(delta))} km ${delta > 0 ? "above" : "below"} our estimate (~${formatNumber(est)} km). Ask the seller for an explanation and invoices.`
    };
  })();

  const comparisonStyles: Record<string, { bg: string; color: string; border: string }> = {
    good: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
    warn: { bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
    bad: { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
    neutral: { bg: "#f1f5f9", color: "#334155", border: "#e2e8f0" }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.contentContainer}>
        <VehicleNavBar plate={normalized} subtitle={locale === "nl" ? "Kilometerhistorie" : "Mileage history"} />

        <PremiumLock featureName={locale === "nl" ? "Kilometerhistorie" : "Mileage History"} isLocked={true} plate={normalized} sectionKey="mileageHistory">
          <div className={`${styles.heroPanel} ${styles.glassPanel}`}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                {verdict.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {locale === "nl" ? "Status" : "Status"}: {verdict.label}
              </div>
              <div className={styles.heroTitle}>{locale === "nl" ? "Kilometerhistorie" : "Mileage History"}</div>
              <div className={styles.heroSubtitle}>{verdict.explanation}</div>
              <div className={styles.heroMetrics}>
                <HeroMetric label={locale === "nl" ? "Laatste meting" : "Latest Reading"} value={latestMileage ? `${formatNumber(latestMileage)} km` : "-"} />
                <HeroMetric label={locale === "nl" ? "Gem. per jaar" : "Avg. Annual"} value={avgAnnual ? `~${formatNumber(avgAnnual)} km` : "-"} />
                <HeroMetric label={locale === "nl" ? "Datapunten" : "Data Points"} value={`${events.length} ${locale === "nl" ? "records" : "records"}`} />
              </div>
            </div>
          </div>

          <div className={`${styles.heroPanel} ${styles.glassPanel}`}>
            <div className={styles.heroCopy}>
              <div className={styles.heroTitle} style={{ fontSize: "20px" }}>
                {nl ? "Geschatte stand nu + jouw controle" : "Estimated mileage now + your check"}
              </div>
              <div className={styles.heroSubtitle}>
                {est != null
                  ? nl
                    ? `Op basis van onze formule (gewogen trend op de APK-historie) schatten we de huidige stand op ongeveer ${formatNumber(est)} km. De RDW-historie blijft leidend; vul hieronder de werkelijke stand in om te vergelijken.`
                    : `Based on our formula (weighted trend on the APK history) we estimate the current reading at about ${formatNumber(est)} km. The RDW history stays leading; enter the actual reading below to compare.`
                  : nl
                  ? "Er is te weinig keuringsdata voor een betrouwbare schatting van de huidige stand. Vul hieronder zelf de werkelijke stand in."
                  : "There is too little inspection data for a reliable current-mileage estimate. Enter the actual reading below."}
              </div>
              <div className={styles.heroMetrics}>
                <HeroMetric label={nl ? "Onze schatting nu" : "Our estimate now"} value={est != null ? `~${formatNumber(est)} km` : "-"} />
                <HeroMetric label={nl ? "Bandbreedte" : "Range"} value={estMin != null && estMax != null ? `${formatNumber(estMin)} - ${formatNumber(estMax)}` : "-"} />
                <HeroMetric label={nl ? "Gebruiksprofiel" : "Usage profile"} value={usageLabel ?? "-"} />
              </div>
              <div style={{ marginTop: "16px", maxWidth: "440px" }}>
                <label htmlFor="actual-km" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  {nl ? "Werkelijke kilometerstand (van de teller of advertentie)" : "Actual odometer reading (from the dashboard or listing)"}
                </label>
                <input
                  id="actual-km"
                  value={actualKm}
                  onChange={(event) => setActualKm(event.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  placeholder={nl ? "bijv. 142000" : "e.g. 142000"}
                  style={{ width: "100%", height: "46px", borderRadius: "10px", border: "1px solid #cbd5e1", padding: "0 14px", fontSize: "16px", fontWeight: 600, outline: "none" }}
                />
                {comparison ? (
                  <div
                    style={{
                      marginTop: "10px",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      fontSize: "14px",
                      lineHeight: 1.5,
                      background: comparisonStyles[comparison.tone].bg,
                      color: comparisonStyles[comparison.tone].color,
                      border: `1px solid ${comparisonStyles[comparison.tone].border}`
                    }}
                  >
                    {comparison.message}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={styles.dashboardGrid}>
            <div className={styles.chartPanel}>
              <div className={styles.chartHeader}>
                <div className={styles.chartTitleArea}>
                  <div className={styles.chartTitle}>{locale === "nl" ? "Kilometertrend" : "Mileage Growth Trend"}</div>
                  <div className={styles.chartSubtitle}>{locale === "nl" ? "Visuele controle van consistentie door de tijd" : "Visual verification of reading consistency over time"}</div>
                </div>
                <div className={styles.chartLegend}>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.legendApk}`} /> {locale === "nl" ? "APK-keuring" : "APK Inspection"}
                  </div>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.legendWorkshop}`} /> {locale === "nl" ? "Werkplaats" : "Workshop"}
                  </div>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.legendOwner}`} /> {locale === "nl" ? "Overdracht" : "Transfer"}
                  </div>
                </div>
              </div>

              <div className={styles.chartContainer}>
                <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                  {yLabels.map((label, index) => {
                    const y = paddingTop + (index / (yLabels.length - 1)) * (height - paddingTop - paddingBottom);
                    return (
                      <g key={String(label)}>
                        <text x={paddingLeft - 10} y={y + 4} className={styles.chartLabelY}>
                          {Math.round(label / 1000)}k
                        </text>
                        <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} className={styles.chartGridLine} />
                      </g>
                    );
                  })}
                  <line
                    x1={paddingLeft}
                    y1={paddingTop}
                    x2={paddingLeft}
                    y2={height - paddingBottom}
                    className={styles.chartAxisLine}
                  />
                  <line
                    x1={paddingLeft}
                    y1={height - paddingBottom}
                    x2={width - paddingRight}
                    y2={height - paddingBottom}
                    className={styles.chartAxisLine}
                  />

                  {areaPath ? <path d={areaPath} className={styles.chartArea} /> : null}
                  {linePath ? <path d={linePath} className={styles.chartDataLine} /> : null}

                  {points.map((point, index) => {
                    const dotClass =
                      point.type === "workshop"
                        ? styles.pointWorkshop
                        : point.type === "owner"
                        ? styles.pointOwner
                        : styles.pointApk;
                    return (
                      <g key={`${point.date}-${index}`}>
                        <circle cx={point.x} cy={point.y} r={6} className={styles.chartPoint} />
                        <circle cx={point.x} cy={point.y} r={3} className={`${styles.chartPointInner} ${dotClass}`} />
                      </g>
                    );
                  })}

                  {points.map((point, index) => (
                    <text key={`${point.date}-x-${index}`} x={point.x} y={height - paddingBottom + 25} className={styles.chartLabelX}>
                      {new Date(point.date).getFullYear()}
                    </text>
                  ))}
                </svg>
              </div>
            </div>

            <div className={styles.timelinePanel}>
              <div className={styles.timelineHeader}>{locale === "nl" ? "Geregistreerde events" : "Recorded Events"}</div>
              <div className={styles.timelineList}>
                <div className={styles.timelineLine} />
                {events.map((event) => (
                  <div key={event.id} className={styles.timelineItem}>
                    <div
                      className={`${styles.timelineMarker} ${
                        event.type === "owner"
                          ? styles.markerOwner
                          : event.type === "workshop"
                          ? styles.markerWorkshop
                          : styles.markerApk
                      }`}
                    >
                      <EventIcon type={event.type} />
                    </div>
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineTop}>
                        <div className={styles.timelineTitle}>{event.title}</div>
                        <div className={styles.timelineMileage}>
                          {event.mileage ? `${formatNumber(event.mileage)} km` : "-"}
                        </div>
                      </div>
                      <div className={styles.timelineDate}>{formatDate(event.date, locale)}</div>
                      <div className={styles.timelineDesc}>{event.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PremiumLock>
      </div>
    </div>

  );
}

