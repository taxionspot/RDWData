"use client";

import { useMemo } from "react";
import {
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
  embedded?: boolean;
};

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

export function MileageTimelineScreen({ plate, embedded = false }: Props) {
  const { locale } = useI18n();
  const { normalized, isValid, data, isLoading, isError } = useVehicleLookup(plate);

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

  const enrichedMileage = data?.enriched ?? null;
  const realKmEvents = useMemo(
    () => events.filter((event) => event.mileage != null && event.mileage > 0),
    [events]
  );
  const hasRealKm = realKmEvents.length >= 2;
  // RDW open data bevat geen tellerstanden; zonder echte meetpunten tonen we
  // de schatting van onze eigen formule (leeftijd x verwacht jaarkilometrage).
  const isFormulaEstimate = !hasRealKm && Boolean(enrichedMileage?.estimatedMileageNow);

  const latestMileage = hasRealKm
    ? realKmEvents[realKmEvents.length - 1].mileage
    : enrichedMileage?.estimatedMileageNow ?? null;

  const avgAnnual = useMemo(() => {
    if (hasRealKm) {
      const first = new Date(realKmEvents[0].date).getTime();
      const last = new Date(realKmEvents[realKmEvents.length - 1].date).getTime();
      const km = realKmEvents[realKmEvents.length - 1].mileage ?? 0;
      const years = Math.max((last - first) / (1000 * 60 * 60 * 24 * 365.25), 1);
      return Math.round(km / years);
    }
    return enrichedMileage?.mileageSlopeKmPerYear ?? null;
  }, [hasRealKm, realKmEvents, enrichedMileage]);

  const chartPoints = useMemo(() => {
    if (hasRealKm) {
      return realKmEvents.map((event) => ({
        date: event.date,
        mileage: event.mileage ?? 0,
        type: event.type
      }));
    }
    const first = data?.vehicle.firstRegistrationWorld;
    const slope = enrichedMileage?.mileageSlopeKmPerYear;
    const now = enrichedMileage?.estimatedMileageNow;
    if (!first || !slope || !now) return [];
    const start = new Date(first);
    if (Number.isNaN(start.getTime())) return [];
    const totalYears = Math.max((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25), 1);
    const steps = Math.min(7, Math.max(2, Math.floor(totalYears)));
    const synthetic: Array<{ date: string; mileage: number; type: TimelineEvent["type"] }> = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = (totalYears * i) / steps;
      const date = new Date(start.getTime() + t * 365.25 * 24 * 60 * 60 * 1000);
      synthetic.push({
        date: date.toISOString(),
        mileage: i === steps ? now : Math.round(slope * t),
        type: "apk"
      });
    }
    return synthetic;
  }, [hasRealKm, realKmEvents, enrichedMileage, data]);

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

  return (
    <div className={embedded ? undefined : styles.pageContainer}>
      <div className={embedded ? undefined : styles.contentContainer}>
        {!embedded && <VehicleNavBar plate={normalized} subtitle={locale === "nl" ? "Kilometerhistorie" : "Mileage history"} />}

        <PremiumLock featureName={locale === "nl" ? "Kilometerhistorie" : "Mileage History"} isLocked={true} plate={normalized} sectionKey="mileageHistory">
          <div className={`${styles.heroPanel} ${styles.glassPanel}`}>
            <div className={styles.heroCopy}>
              {/* This eyebrow restates the raw napVerdict as detail. The group
                  status line (ReportGroup, g4-km) shows the tone+label derived
                  from the SAME field, so the two agree by construction. Do not
                  add a second status chip here that could diverge. */}
              <div className={styles.eyebrow}>
                <CheckCircle2 size={14} />
                {data.vehicle.napVerdict
                  ? `${locale === "nl" ? "NAP-tellerstandoordeel" : "NAP odometer verdict"}: ${data.vehicle.napVerdict}`
                  : locale === "nl"
                  ? "Geen NAP-oordeel beschikbaar"
                  : "No NAP verdict available"}
              </div>
              <div className={styles.heroTitle}>{locale === "nl" ? "Kilometerstand" : "Mileage"}</div>
              <div className={styles.heroSubtitle}>
                {isFormulaEstimate
                  ? locale === "nl"
                    ? "De RDW publiceert geen tellerstanden. Deze schatting komt uit onze eigen formule: leeftijd maal verwacht jaarkilometrage op basis van brandstof, carrosserie en gebruiksprofiel. Vraag de verkoper om het gratis RDW-tellerrapport voor de exacte standen."
                    : "The RDW does not publish odometer readings. This estimate comes from our own formula: age times expected annual mileage based on fuel, body type and usage profile. Ask the seller for the free RDW odometer report for exact readings."
                  : locale === "nl"
                  ? "Geregistreerde kilometerstanden uit officiële metingen, getoetst op terugdraaiing en afwijkende patronen."
                  : "Recorded odometer readings from official measurements, checked for rollback and unusual patterns."}
              </div>
              <div className={styles.heroMetrics}>
                <HeroMetric
                  label={
                    isFormulaEstimate
                      ? locale === "nl" ? "Geschatte stand (formule)" : "Estimated reading (formula)"
                      : locale === "nl" ? "Laatste meting" : "Latest reading"
                  }
                  value={latestMileage ? `${formatNumber(latestMileage)} km` : "-"}
                />
                {isFormulaEstimate && enrichedMileage?.estimatedMileageMin && enrichedMileage?.estimatedMileageMax ? (
                  <HeroMetric
                    label={locale === "nl" ? "Bandbreedte" : "Range"}
                    value={`${formatNumber(enrichedMileage.estimatedMileageMin)} - ${formatNumber(enrichedMileage.estimatedMileageMax)} km`}
                  />
                ) : null}
                <HeroMetric label={locale === "nl" ? "Per jaar" : "Per year"} value={avgAnnual ? `~${formatNumber(avgAnnual)} km` : "-"} />
                <HeroMetric
                  label={locale === "nl" ? "Gebruiksprofiel" : "Usage profile"}
                  value={enrichedMileage?.mileageUsageProfile ?? (locale === "nl" ? "Gemiddeld" : "Average")}
                />
              </div>
            </div>
          </div>

          {enrichedMileage?.mileageAnomalies && enrichedMileage.mileageAnomalies.length > 0 ? (
            <div className={styles.anomalyList}>
              {enrichedMileage.mileageAnomalies.map((anomaly) => (
                <div
                  key={`${anomaly.type}-${anomaly.message}`}
                  className={`${styles.anomalyItem} ${anomaly.severity === "HIGH" ? styles.anomalyHigh : styles.anomalyMedium}`}
                >
                  <strong>
                    {anomaly.type === "ROLLBACK"
                      ? locale === "nl" ? "Mogelijke terugdraaiing" : "Possible rollback"
                      : anomaly.type === "LOW_USAGE"
                      ? locale === "nl" ? "Opvallend laag gebruik" : "Unusually low usage"
                      : anomaly.type === "HIGH_USAGE"
                      ? locale === "nl" ? "Opvallend hoog gebruik" : "Unusually high usage"
                      : locale === "nl" ? "Afwijkende meting" : "Outlier reading"}
                  </strong>
                  <span>
                    {locale === "nl"
                      ? "Controleer dit met het RDW-tellerrapport van de verkoper voordat je koopt."
                      : "Verify this with the seller's RDW odometer report before buying."}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.dashboardGrid}>
            <div className={styles.chartPanel}>
              <div className={styles.chartHeader}>
                <div className={styles.chartTitleArea}>
                  <div className={styles.chartTitle}>
                    {isFormulaEstimate
                      ? locale === "nl" ? "Geschat kilometerverloop" : "Estimated mileage progression"
                      : locale === "nl" ? "Kilometertrend" : "Mileage trend"}
                  </div>
                  <div className={styles.chartSubtitle}>
                    {isFormulaEstimate
                      ? locale === "nl" ? "Berekend met onze formule, geen officiële metingen" : "Calculated with our formula, no official readings"
                      : locale === "nl" ? "Visuele controle van consistentie door de tijd" : "Visual verification of reading consistency over time"}
                  </div>
                </div>
                <div className={styles.chartLegend}>
                  {isFormulaEstimate ? (
                    <div className={styles.legendItem}>
                      <span className={`${styles.legendDot} ${styles.legendApk}`} /> {locale === "nl" ? "Formule-schatting" : "Formula estimate"}
                    </div>
                  ) : (
                    <>
                      <div className={styles.legendItem}>
                        <span className={`${styles.legendDot} ${styles.legendApk}`} /> {locale === "nl" ? "APK-keuring" : "APK Inspection"}
                      </div>
                      <div className={styles.legendItem}>
                        <span className={`${styles.legendDot} ${styles.legendWorkshop}`} /> {locale === "nl" ? "Werkplaats" : "Workshop"}
                      </div>
                      <div className={styles.legendItem}>
                        <span className={`${styles.legendDot} ${styles.legendOwner}`} /> {locale === "nl" ? "Overdracht" : "Transfer"}
                      </div>
                    </>
                  )}
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
                        {event.mileage ? (
                          <div className={styles.timelineMileage}>{formatNumber(event.mileage)} km</div>
                        ) : null}
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

