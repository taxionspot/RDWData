"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Gauge,
  UserPlus
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
// RDW verdict — never a fixed optimistic message.
function mileageVerdictCopy(
  napVerdict: string | null,
  mileageVerdict: string | null | undefined,
  locale: "nl" | "en"
): { label: string; explanation: string; ok: boolean } {
  const nap = (napVerdict ?? "").toLowerCase();
  const illogical = nap.includes("onlogisch") || nap.includes("implausible") || mileageVerdict === "ONLOGISCH";
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
  if (nap.includes("logisch") || nap.includes("plausible")) {
    return {
      label: locale === "nl" ? "Logisch" : "Plausible",
      explanation:
        locale === "nl"
          ? "Het RDW NAP-oordeel is 'Logisch': de bij keuringen geregistreerde standen lopen logisch op, geen aanwijzing voor terugdraaien."
          : "The RDW NAP verdict is 'Plausible': the readings recorded at inspections increase logically, with no sign of a rollback.",
      ok: true
    };
  }
  return {
    label: locale === "nl" ? "Geen oordeel" : "No verdict",
    explanation:
      locale === "nl"
        ? "Er is (nog) geen NAP-oordeel beschikbaar voor dit voertuig. Beoordeel de werkelijke kilometerstand zelf bij bezichtiging."
        : "No NAP verdict is available (yet) for this vehicle. Check the actual odometer yourself when viewing the car.",
    ok: true
  };
}

type TimelineEvent = {
  id: string;
  type: "apk" | "owner";
  title: string;
  date: string;
  modeledKm: number | null;
  description: string;
};

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return Math.round(value).toLocaleString("nl-NL");
}

function formatDate(value: string | null, locale: "nl" | "en") {
  if (!value) return locale === "nl" ? "Onbekend" : "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
}

function parseEventDate(record: Record<string, unknown>): string | null {
  const candidates = [
    record.datum_keuring,
    record.datum_keuring_dt,
    record.meld_datum_door_keuringsinstantie,
    record.meld_datum_door_keuringsinstantie_dt,
    record.vervaldatum_keuring_dt,
    record.datum,
    record.datum_dt
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value) return value;
    if (typeof value === "number" && value) return String(value);
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

const YEAR_MS = 1000 * 60 * 60 * 24 * 365.25;

function EventIcon({ type }: { type: TimelineEvent["type"] }) {
  if (type === "owner") return <UserPlus size={14} />;
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

  // Our formula estimate (RDW publishes no odometer history, so this is modelled
  // from age x usage; see lib/rdw/heuristics.ts).
  const est = data?.enriched?.estimatedMileageNow ?? null;
  const estMin = data?.enriched?.estimatedMileageMin ?? null;
  const estMax = data?.enriched?.estimatedMileageMax ?? null;
  const annual = data?.enriched?.mileageSlopeKmPerYear ?? null;
  const usageProfile = data?.enriched?.mileageUsageProfile ?? null;
  const usageLabel = usageProfile ? USAGE_LABELS[usageProfile]?.[locale] ?? usageProfile : null;

  const actualKmValue = useMemo(() => {
    const n = Number(actualKm.replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [actualKm]);

  // The figure the trend is anchored to today: the buyer's reading wins over our
  // estimate, so entering a value visibly changes the graph.
  const anchorKm = actualKmValue ?? est;

  const regDate = useMemo(() => {
    const raw = data?.vehicle.firstRegistrationWorld;
    if (!raw) return null;
    const d = new Date(normalizeDate(raw) ?? raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [data?.vehicle.firstRegistrationWorld]);

  const ageNow = useMemo(() => {
    if (!regDate) return null;
    return Math.max((Date.now() - regDate.getTime()) / YEAR_MS, 0.25);
  }, [regDate]);

  // RDW inspection events (dates only — RDW open data has no per-inspection km).
  const events = useMemo(() => {
    const list: TimelineEvent[] = [];
    const modeledAt = (date: Date) => {
      if (!regDate || !ageNow || anchorKm == null) return null;
      const t = Math.max((date.getTime() - regDate.getTime()) / YEAR_MS, 0);
      return Math.max(0, Math.round(anchorKm * Math.min(t / ageNow, 1)));
    };

    if (regDate) {
      list.push({
        id: "first-registration",
        type: "owner",
        title: nl ? "Eerste registratie" : "First registration",
        date: regDate.toISOString().slice(0, 10),
        modeledKm: 0,
        description: nl ? "Eerste toelating en registratie." : "Initial delivery and registration."
      });
    }

    const seen = new Set<string>();
    for (const record of data?.inspections ?? []) {
      const dateValue = normalizeDate(parseEventDate(record as Record<string, unknown>));
      if (!dateValue || seen.has(dateValue)) continue;
      seen.add(dateValue);
      const d = new Date(dateValue);
      if (Number.isNaN(d.getTime())) continue;
      list.push({
        id: `apk-${dateValue}`,
        type: "apk",
        title: nl ? "APK-keuring" : "APK inspection",
        date: dateValue,
        modeledKm: modeledAt(d),
        description: nl
          ? "Keuringsmoment uit de RDW-historie."
          : "Inspection event from the RDW history."
      });
    }

    return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data?.inspections, regDate, ageNow, anchorKm, nl]);

  const apkCount = events.filter((e) => e.type === "apk").length;

  // Model-based km trajectory: a straight line from 0 at registration to the
  // anchor (our estimate, or the buyer's reading) today, sampled per year.
  const trajectory = useMemo(() => {
    if (!regDate || !ageNow || anchorKm == null) return [] as Array<{ year: number; km: number }>;
    const startYear = regDate.getFullYear();
    const endYear = new Date().getFullYear();
    const pts: Array<{ year: number; km: number }> = [];
    for (let y = startYear; y <= endYear; y += 1) {
      const t = Math.max((new Date(y, regDate.getMonth(), regDate.getDate()).getTime() - regDate.getTime()) / YEAR_MS, 0);
      pts.push({ year: y, km: Math.max(0, Math.round(anchorKm * Math.min(t / ageNow, 1))) });
    }
    // Ensure the final sample is exactly "today = anchor".
    if (pts.length) pts[pts.length - 1] = { year: endYear, km: Math.round(anchorKm) };
    return pts;
  }, [regDate, ageNow, anchorKm]);

  const comparison: { tone: "good" | "warn" | "bad" | "neutral"; message: string } | null = useMemo(() => {
    if (actualKmValue == null || est == null) return null;
    if (estMin != null && estMax != null && actualKmValue >= estMin && actualKmValue <= estMax) {
      return {
        tone: "good",
        message: nl
          ? `Dit valt binnen onze schatting (${formatNumber(estMin)} - ${formatNumber(estMax)} km). Het kilometrage is in lijn met de leeftijd en het gebruik.`
          : `This falls within our estimate (${formatNumber(estMin)} - ${formatNumber(estMax)} km). The mileage is in line with the age and usage.`
      };
    }
    const delta = actualKmValue - est;
    const higher = delta > 0;
    return {
      tone: higher ? "warn" : "good",
      message: nl
        ? `Dit ligt ${formatNumber(Math.abs(delta))} km ${higher ? "boven" : "onder"} onze schatting (~${formatNumber(est)} km). ${
            higher
              ? "Meer kilometers betekent doorgaans een lagere marktwaarde; vraag de verkoper om onderhoudsfacturen."
              : "Minder kilometers kan de waarde verhogen, maar controleer de stand en facturen op echtheid."
          }`
        : `This is ${formatNumber(Math.abs(delta))} km ${higher ? "above" : "below"} our estimate (~${formatNumber(est)} km). ${
            higher
              ? "Higher mileage usually means a lower market value; ask the seller for service invoices."
              : "Lower mileage can raise the value, but verify the reading and invoices are genuine."
          }`
    };
  }, [actualKmValue, est, estMin, estMax, nl]);

  const comparisonStyles: Record<string, { bg: string; color: string; border: string }> = {
    good: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
    warn: { bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
    bad: { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
    neutral: { bg: "#f1f5f9", color: "#334155", border: "#e2e8f0" }
  };

  if (!isValid || isError) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingCard}>{nl ? "Voertuig niet gevonden." : "Vehicle not found."}</div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingCard}>{nl ? "Kilometerhistorie laden..." : "Loading mileage history..."}</div>
      </div>
    );
  }

  const verdict = mileageVerdictCopy(data.vehicle.napVerdict, data.enriched?.mileageVerdict, locale);
  const ageLabel = ageNow != null ? `${Math.floor(ageNow)} ${nl ? "jaar" : "yr"}` : "-";

  // Chart geometry
  const width = 800;
  const height = 300;
  const paddingLeft = 60;
  const paddingBottom = 60;
  const paddingTop = 20;
  const paddingRight = 20;
  const chartMax = Math.max(...trajectory.map((p) => p.km), estMax ?? 0, 1);
  const points = trajectory.map((point, index) => {
    const x = paddingLeft + (index / Math.max(trajectory.length - 1, 1)) * (width - paddingLeft - paddingRight);
    const y = paddingTop + (1 - point.km / chartMax) * (height - paddingTop - paddingBottom);
    return { ...point, x, y };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = points.length
    ? `M ${points[0].x} ${height - paddingBottom} ${points.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${points[points.length - 1].x} ${height - paddingBottom} Z`
    : "";
  const yLabels = [chartMax, chartMax * 0.66, chartMax * 0.33, 0];

  return (
    <div className={styles.pageContainer}>
      <div className={styles.contentContainer}>
        <VehicleNavBar plate={normalized} subtitle={nl ? "Kilometerhistorie" : "Mileage history"} />

        <PremiumLock featureName={nl ? "Kilometerhistorie" : "Mileage History"} isLocked={true} plate={normalized} sectionKey="mileageHistory">
          {/* RDW facts: NAP verdict + inspection history */}
          <div className={`${styles.heroPanel} ${styles.glassPanel}`}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow} style={verdict.ok ? undefined : { color: "#b45309" }}>
                {verdict.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {nl ? "RDW NAP-oordeel" : "RDW NAP verdict"}: {verdict.label}
              </div>
              <div className={styles.heroTitle}>{nl ? "Kilometerhistorie" : "Mileage History"}</div>
              <div className={styles.heroSubtitle}>{verdict.explanation}</div>
              <div className={styles.heroMetrics}>
                <HeroMetric label={nl ? "NAP-oordeel" : "NAP verdict"} value={verdict.label} />
                <HeroMetric label={nl ? "Leeftijd" : "Age"} value={ageLabel} />
                <HeroMetric label={nl ? "APK-keuringen" : "APK inspections"} value={`${apkCount}`} />
              </div>
            </div>
          </div>

          {/* OUR estimate — its own clearly labelled section */}
          <div className={`${styles.heroPanel} ${styles.glassPanel}`}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <Gauge size={14} />
                {nl ? "Onze kilometerschatting" : "Our mileage estimate"}
              </div>
              <div className={styles.heroTitle} style={{ fontSize: "22px" }}>
                {est != null ? `~ ${formatNumber(est)} km` : nl ? "Niet te schatten" : "Cannot estimate"}
              </div>
              <div className={styles.heroSubtitle}>
                {est != null
                  ? nl
                    ? `RDW publiceert geen kilometerhistorie. Wij schatten de huidige stand met onze formule: leeftijd x gemiddeld jaarkilometrage voor dit gebruiksprofiel${
                        data.vehicle.isTaxi ? " (dit voertuig staat als taxi geregistreerd, dus een hoog jaarkilometrage)" : ""
                      }. Vul hieronder de werkelijke stand in om te vergelijken.`
                    : `RDW publishes no odometer history. We estimate the current reading with our formula: age x the average annual mileage for this usage profile${
                        data.vehicle.isTaxi ? " (this vehicle is registered as a taxi, so a high annual mileage)" : ""
                      }. Enter the actual reading below to compare.`
                  : nl
                  ? "We kunnen de stand niet schatten (registratiedatum of catalogusgegevens ontbreken)."
                  : "We cannot estimate the reading (registration date or catalogue data missing)."}
              </div>
              <div className={styles.heroMetrics}>
                <HeroMetric label={nl ? "Schatting nu" : "Estimate now"} value={est != null ? `~${formatNumber(est)} km` : "-"} />
                <HeroMetric label={nl ? "Bandbreedte" : "Range"} value={estMin != null && estMax != null ? `${formatNumber(estMin)} - ${formatNumber(estMax)} km` : "-"} />
                <HeroMetric label={nl ? "Gem. per jaar" : "Avg. per year"} value={annual != null ? `~${formatNumber(annual)} km` : "-"} />
                <HeroMetric label={nl ? "Gebruiksprofiel" : "Usage profile"} value={usageLabel ?? "-"} />
              </div>

              <div style={{ marginTop: "16px", maxWidth: "460px" }}>
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
                  <div className={styles.chartTitle}>{nl ? "Modelmatige kilometertrend" : "Model-based mileage trend"}</div>
                  <div className={styles.chartSubtitle}>
                    {actualKmValue != null
                      ? nl
                        ? "Aangepast op jouw opgegeven kilometerstand."
                        : "Adjusted to the reading you entered."
                      : nl
                      ? "Schatting o.b.v. onze formule (leeftijd x jaarkilometrage). Vul je stand in om de grafiek aan te passen."
                      : "Estimated from our formula (age x annual mileage). Enter your reading to adjust the graph."}
                  </div>
                </div>
                <div className={styles.chartLegend}>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.legendApk}`} /> {actualKmValue != null ? (nl ? "Jouw stand" : "Your reading") : nl ? "Schatting" : "Estimate"}
                  </div>
                </div>
              </div>

              <div className={styles.chartContainer}>
                {points.length ? (
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
                    <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} className={styles.chartAxisLine} />
                    <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} className={styles.chartAxisLine} />

                    {areaPath ? <path d={areaPath} className={styles.chartArea} /> : null}
                    {linePath ? <path d={linePath} className={styles.chartDataLine} /> : null}

                    {points.map((point, index) => (
                      <g key={`${point.year}-${index}`}>
                        <circle cx={point.x} cy={point.y} r={6} className={styles.chartPoint} />
                        <circle cx={point.x} cy={point.y} r={3} className={`${styles.chartPointInner} ${styles.pointApk}`} />
                      </g>
                    ))}

                    {points.map((point, index) =>
                      index % Math.ceil(points.length / 8 || 1) === 0 || index === points.length - 1 ? (
                        <text key={`${point.year}-x-${index}`} x={point.x} y={height - paddingBottom + 25} className={styles.chartLabelX}>
                          {point.year}
                        </text>
                      ) : null
                    )}
                  </svg>
                ) : (
                  <div className={styles.loadingCard} style={{ margin: "40px auto", maxWidth: "320px", textAlign: "center" }}>
                    {nl ? "Geen registratiedatum om een trend te tekenen." : "No registration date to draw a trend."}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.timelinePanel}>
              <div className={styles.timelineHeader}>{nl ? "RDW keuringsmomenten" : "RDW inspection events"}</div>
              <div className={styles.timelineList}>
                <div className={styles.timelineLine} />
                {events.map((event) => (
                  <div key={event.id} className={styles.timelineItem}>
                    <div className={`${styles.timelineMarker} ${event.type === "owner" ? styles.markerOwner : styles.markerApk}`}>
                      <EventIcon type={event.type} />
                    </div>
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineTop}>
                        <div className={styles.timelineTitle}>{event.title}</div>
                        <div className={styles.timelineMileage}>
                          {event.modeledKm != null ? `~${formatNumber(event.modeledKm)} km` : "-"}
                        </div>
                      </div>
                      <div className={styles.timelineDate}>{formatDate(event.date, locale)}</div>
                      <div className={styles.timelineDesc}>{event.description}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 }}>
                {nl
                  ? "Bedragen met ~ zijn modelmatige schattingen; RDW registreert wel keuringsdata, maar geen kilometerstanden per keuring."
                  : "Figures with ~ are model estimates; RDW records inspection dates but not the odometer at each inspection."}
              </div>
            </div>
          </div>
        </PremiumLock>
      </div>
    </div>
  );
}
