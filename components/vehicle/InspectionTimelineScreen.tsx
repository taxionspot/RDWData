"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Repeat,
  ShieldCheck,
  TriangleAlert,
  XCircle
} from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import styles from "./InspectionTimelineScreen.module.css";
import { VehicleNavBar } from "./VehicleNavBar";
import { useI18n } from "@/lib/i18n/context";
import { PremiumLock } from "../ui/PremiumLock";

type Props = {
  plate: string;
};

type InspectionEvent = {
  id: string;
  date: string;
  mileage: number | null;
  result: "pass" | "advisory" | "fail";
  notes: string;
  defects: Array<{ code: string; description: string; recurring: boolean }>;
};

function formatDate(value: string | null, locale: "nl" | "en") {
  if (!value) return locale === "nl" ? "Onbekend" : "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
}

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toLocaleString("nl-NL");
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
    record.datum_dt
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function parseResult(record: Record<string, unknown>): "pass" | "advisory" | "fail" {
  const raw = String(
    record.keuringsresultaat ??
      record.keuringsoordeel ??
      record.oordeel ??
      record.resultaat ??
      ""
  ).toLowerCase();
  if (raw.includes("afkeur") || raw.includes("fail") || raw.includes("reject")) return "fail";
  if (raw.includes("advies") || raw.includes("advis")) return "advisory";
  if (raw.includes("goedgekeurd")) return "pass";
  if (raw.includes("goed")) return "pass";
  if (raw.includes("herkeur") || raw.includes("retest")) return "advisory";
  if (raw.includes("advies") || raw.includes("advis")) return "advisory";
  return "pass";
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (value.includes("T")) return value.split("T")[0];
  return value;
}

function parseDefectCode(record: Record<string, unknown>): string | null {
  const value = record.gebrek_identificatie ?? record.gebrek_identificatienummer ?? record.gebrek_code;
  if (!value) return null;
  return String(value);
}

function nodeIcon(result: InspectionEvent["result"]) {
  if (result === "fail") return <XCircle size={24} />;
  if (result === "advisory") return <TriangleAlert size={24} />;
  return <CheckCheck size={24} />;
}

function statusBadge(result: InspectionEvent["result"], locale: "nl" | "en") {
  if (result === "fail") return { label: locale === "nl" ? "Afgekeurd" : "Fail", className: "badgeFail" };
  // RDW's open data lists the defects found at a keuring, not a clean pass/fail
  // outcome, so we label these factually as "defect(s) found" rather than implying
  // the car passed.
  if (result === "advisory") return { label: locale === "nl" ? "Gebrek geconstateerd" : "Defect noted", className: "badgeAdvisory" };
  return { label: locale === "nl" ? "Geen gebreken" : "No defects", className: "badgePass" };
}

export function InspectionTimelineScreen({ plate }: Props) {
  const { locale } = useI18n();
  const { isValid, data, isLoading, isError } = useVehicleLookup(plate);
  const [filter, setFilter] = useState<"all" | "pass" | "advisory" | "fail">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const events = useMemo(() => {
    if (!data?.inspections) return [] as InspectionEvent[];

    const inspectionByDate = new Map<string, { date: string; mileage: number | null; results: Set<InspectionEvent["result"]> }>();
    for (const record of data.inspections) {
      const rawDate = parseDate(record);
      const date = normalizeDate(rawDate);
      if (!date) continue;
      const mileage = parseMileage(record);
      const result = parseResult(record);

      if (!inspectionByDate.has(date)) {
        inspectionByDate.set(date, { date, mileage, results: new Set() });
      }
      const entry = inspectionByDate.get(date)!;
      entry.results.add(result);
      if (entry.mileage === null && mileage !== null) entry.mileage = mileage;
    }

    const defectsByDate = new Map<string, Map<string, number>>();
    // Defects now derive from the APK rows (data.defects is a subset of
    // data.inspections), so use the inspection rows directly to avoid double
    // counting the same defect.
    const defectSources = data.inspections ?? [];
    for (const record of defectSources) {
      const rawDate = parseDate(record);
      const date = normalizeDate(rawDate);
      const code = parseDefectCode(record);
      if (!date || !code) continue;
      const count = Number(record.aantal_gebreken_geconstateerd ?? 1);
      if (!defectsByDate.has(date)) defectsByDate.set(date, new Map<string, number>());
      const byCode = defectsByDate.get(date)!;
      byCode.set(code, (byCode.get(code) ?? 0) + (Number.isFinite(count) ? count : 1));
    }

    const defectCounts: Record<string, number> = {};
    for (const byCode of defectsByDate.values()) {
      for (const [code] of byCode) {
        defectCounts[code] = (defectCounts[code] ?? 0) + 1;
      }
    }

    const mapped = Array.from(inspectionByDate.values()).map((entry, index) => {
      const defects = Array.from(defectsByDate.get(entry.date)?.entries() ?? []).map(([code]) => ({
        code,
        description: data.defectDescriptions[code] ?? (locale === "nl" ? "Defect vastgelegd" : "Defect recorded"),
        recurring: (defectCounts[code] ?? 0) > 1
      }));

      // RDW rarely exposes a clean pass/fail flag per keuring, so derive the outcome
      // from the real signals: an explicit rejection stays "fail", and any keuring
      // with recorded defects is surfaced as "advisory" (findings noted) instead of
      // a clean pass. Only a keuring with no defects at all is a clean pass.
      const result: InspectionEvent["result"] = entry.results.has("fail")
        ? "fail"
        : defects.length > 0 || entry.results.has("advisory")
        ? "advisory"
        : "pass";

      const notes = result === "fail"
        ? locale === "nl"
          ? "Deze keuring is afgekeurd en vraagt om extra controle."
          : "This inspection failed and should be reviewed carefully."
        : result === "advisory"
        ? defects.length > 0
          ? locale === "nl"
            ? "Bij deze keuring zijn defecten gemeld; controleer of ze inmiddels zijn verholpen."
            : "Defects were reported at this inspection; check whether they have since been fixed."
          : locale === "nl"
          ? "Goedgekeurd met adviespunten; controleer terugkerende issues."
          : "Passed with advisories; review recurring issues."
        : locale === "nl"
        ? "Goedgekeurd zonder gemelde defecten of adviespunten."
        : "Clean pass with no listed defects or advisories.";

      return {
        id: `inspection-${index}`,
        date: entry.date,
        mileage: entry.mileage,
        result,
        notes,
        defects
      };
    });

    return mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data, locale]);

  const filteredEvents = events.filter((event) => (filter === "all" ? true : event.result === filter));
  const latestEvent = events[0];

  const recurringDefect = events
    .flatMap((event) => event.defects)
    .find((defect) => defect.recurring)?.description;

  // APK validity drives the status card (this dataset only contains keuringen
  // where defects were found, so a "clean pass rate" would be structurally ~0).
  const apkExpiry = data?.vehicle?.apkExpiryDate ?? null;
  const apkExpired = !!apkExpiry && new Date(apkExpiry).getTime() < Date.now();

  const knownIssues = data?.enriched?.knownIssues ?? [];

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
        <div className={styles.loadingCard}>{locale === "nl" ? "Inspectietijdlijn laden..." : "Loading inspection timeline..."}</div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.contentContainer}>
        <VehicleNavBar plate={plate} subtitle={locale === "nl" ? "Inspectietijdlijn" : "Inspection timeline"} />

        <PremiumLock
          featureName={locale === "nl" ? "Inspectietijdlijn" : "Inspection timeline"}
          isLocked={true}
          plate={plate}
          sectionKey="inspectionTimeline"
        >
        <div className={`${styles.heroPanel} ${styles.surfacePanel}`}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <ShieldCheck size={14} /> {locale === "nl" ? "Inspectie-activiteit" : "Inspection activity timeline"}
              </div>
              <div className={styles.heroTitle}>{locale === "nl" ? "APK-historie met terugkerende defecten" : "APK inspection history with recurring defect tracking"}</div>
              <div className={styles.heroSubtitle}>
                {locale === "nl"
                  ? "De keuringen waarbij de RDW gebreken heeft vastgelegd, met datum en omschrijving. Zo zie je welke gebreken eenmalig waren en welke terugkeren. RDW publiceert wel de geconstateerde gebreken, maar geen aparte geslaagd/afgekeurd-uitslag."
                  : "The inspections where RDW recorded defects, with date and description, so you can see which were one-off and which keep coming back. RDW publishes the observed defects but not a separate pass/fail outcome."}
              </div>
              <div className={styles.heroStatRow}>
                <div className={styles.heroStat}>
                  <div className={styles.heroStatLabel}>{locale === "nl" ? "Laatste inspectie" : "Latest inspection"}</div>
                  <div className={styles.heroStatValue}>{latestEvent ? formatDate(latestEvent.date, locale) : "-"}</div>
                </div>
                <div className={styles.heroStat}>
                  <div className={styles.heroStatLabel}>{locale === "nl" ? "Gemelde gebreken" : "Reported defects"}</div>
                  <div className={styles.heroStatValue}>{data.defects.length}</div>
                </div>
                <div className={styles.heroStat}>
                  <div className={styles.heroStatLabel}>{locale === "nl" ? "NAP-oordeel" : "NAP verdict"}</div>
                  <div className={styles.heroStatValue}>{data.vehicle.napVerdict ?? (locale === "nl" ? "Geen oordeel" : "No verdict")}</div>
                </div>
              </div>
            </div>
            <div className={styles.statusCard}>
              <div className={styles.statusCardTop}>
                <div>
                  <div className={styles.statusLabel}>{locale === "nl" ? "Inspectiestatus" : "Inspection status"}</div>
                  <div className={styles.statusValue}>
                    {data.vehicle.apkExpiryDate ? `${locale === "nl" ? "Geldig tot" : "Valid until"} ${formatDate(data.vehicle.apkExpiryDate, locale)}` : locale === "nl" ? "Onbekend" : "Unknown"}
                  </div>
                </div>
                <div className={styles.statusChip}>
                  <BadgeCheck size={14} /> {locale === "nl" ? "Actief" : "Active"}
                </div>
              </div>
              <div className={styles.statusProgress}>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: apkExpired ? "30%" : "100%" }} />
                </div>
                <div className={styles.statusMeta}>
                  <span>{locale === "nl" ? "APK-status" : "MOT status"}</span>
                  <span>{apkExpired ? (locale === "nl" ? "Verlopen" : "Expired") : (locale === "nl" ? "Geldig" : "Valid")}</span>
                </div>
              </div>
              <div className={styles.badgeRow}>
                <div className={styles.miniChip}>{events.length} {locale === "nl" ? "keuringen met gebreken" : "inspections with defects"}</div>
                <div className={styles.miniChip}>
                  {recurringDefect ? (locale === "nl" ? "1 terugkerend issue" : "1 recurring issue") : locale === "nl" ? "Geen terugkerende issues" : "No recurring issues"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${styles.controlsGrid} ${styles.surfacePanel}`}>
          <div className={styles.filterGroup}>
            <button
              className={`${styles.filterPill} ${filter === "all" ? styles.filterActive : ""}`}
              type="button"
              onClick={() => setFilter("all")}
            >
              {locale === "nl" ? "Alle events" : "All events"}
            </button>
            <button
              className={`${styles.filterPill} ${filter === "pass" ? styles.filterActive : ""}`}
              type="button"
              onClick={() => setFilter("pass")}
            >
              {locale === "nl" ? "Goedgekeurd" : "Passed"}
            </button>
            <button
              className={`${styles.filterPill} ${filter === "advisory" ? styles.filterActive : ""}`}
              type="button"
              onClick={() => setFilter("advisory")}
            >
              {locale === "nl" ? "Adviezen" : "Advisories"}
            </button>
            <button
              className={`${styles.filterPill} ${filter === "fail" ? styles.filterActive : ""}`}
              type="button"
              onClick={() => setFilter("fail")}
            >
              {locale === "nl" ? "Afgekeurd" : "Failed"}
            </button>
          </div>
          <div className={styles.summaryNote}>
            <Repeat size={14} />
            {recurringDefect ? `${recurringDefect} ${locale === "nl" ? "komt vaker voor" : "appears more than once"}` : locale === "nl" ? "Geen terugkerende defecten" : "No recurring defects"}
          </div>
        </div>

        <div className={styles.timelineShell}>
          <div className={`${styles.insightPanel} ${styles.surfacePanel}`}>
            <div className={styles.insightTitle}>{locale === "nl" ? "Inspectie-inzichten" : "Inspection insights"}</div>
            <div className={styles.insightCopy}>
              {locale === "nl"
                ? "Korte risicosamenvatting op basis van uitslagen, km-consistentie en terugkerende defecten."
                : "A quick risk summary based on outcomes, mileage consistency, and repeated defect themes across the visible record."}
            </div>
            <div className={styles.signalCard}>
              <div className={styles.signalLabel}>{locale === "nl" ? "Keuringen met gebreken" : "Inspections with defects"}</div>
              <div className={styles.signalValue}>{events.length}</div>
            </div>
            <div className={styles.signalCard}>
              <div className={styles.signalLabel}>{locale === "nl" ? "Terugkerende defecten" : "Recurring defects"}</div>
              <div className={styles.signalValue}>{recurringDefect ?? (locale === "nl" ? "Geen gedetecteerd" : "None detected")}</div>
            </div>
            <div className={styles.signalCard}>
              <div className={styles.signalLabel}>{locale === "nl" ? "Meest zorgwekkend event" : "Highest concern event"}</div>
              <div className={styles.signalValue}>
                {(() => {
                  const concern = events.find((event) => event.result !== "pass");
                  return concern
                    ? formatDate(concern.date, locale)
                    : locale === "nl"
                    ? "Geen defecten gemeld"
                    : "No defects reported";
                })()}
              </div>
            </div>
          </div>

          <div className={`${styles.timelinePanel} ${styles.surfacePanel}`}>
            <div className={styles.timelineHeaderRow}>
              <div>
                <div className={styles.timelineTitle}>{locale === "nl" ? "Inspectie-events" : "Inspection event timeline"}</div>
                <div className={styles.timelineSubtitle}>
                  {locale === "nl"
                    ? "Open elk event voor details. Advies- en afkeur-events springen visueel naar voren."
                    : "Each marker opens the detailed history view. Events with advisories or failures are visually elevated so recurring defects stand out faster."}
                </div>
              </div>
              <div className={styles.badgeRow}>
                <div className={styles.miniChip}>{locale === "nl" ? "Klikbare markers" : "Clickable markers"}</div>
                <div className={styles.miniChip}>{locale === "nl" ? "Uitklapbare defectlijsten" : "Expanded defect lists"}</div>
              </div>
            </div>

            <div className={styles.timelineList}>
              {filteredEvents.length === 0 ? (
                <div className={styles.emptyState}>
                  <AlertCircle size={18} /> {locale === "nl" ? "Geen inspectie-events voor dit filter." : "No inspection events match this filter."}
                </div>
              ) : (
                filteredEvents.map((event) => {
                  const badge = statusBadge(event.result, locale);
                  const highlight = event.result === "fail" ? styles.highlightDestructive : event.result === "advisory" ? styles.highlightWarning : "";
                  const nodeClass = event.result === "fail" ? styles.nodeDestructive : event.result === "advisory" ? styles.nodeWarning : styles.nodeSuccess;
                  const isExpanded = expanded[event.id] ?? true;
                  return (
                    <div key={event.id} className={styles.timelineItem}>
                      <div className={styles.timelineMeta}>
                        <div className={styles.timelineDate}>{formatDate(event.date, locale)}</div>
                        <div className={styles.timelineMileage}>
                          {event.mileage ? `${formatNumber(event.mileage)} km` : "-"}
                        </div>
                      </div>
                      <div className={`${styles.timelineNode} ${nodeClass}`}>
                        {nodeIcon(event.result)}
                      </div>
                      <div className={`${styles.timelineCard} ${highlight}`}>
                        <div className={styles.cardTop}>
                          <div className={styles.cardTitleBlock}>
                            <div className={styles.inspectionTitle}>{locale === "nl" ? "Reguliere inspectie" : "Routine inspection"}</div>
                            <div className={styles.inspectionNote}>{event.notes}</div>
                          </div>
                          <div className={styles.badgeRow}>
                            <div className={`${styles.statusBadge} ${styles[badge.className]}`}>{badge.label}</div>
                            <div className={styles.miniChip}>{event.defects.length} {locale === "nl" ? "item" : "item"}</div>
                          </div>
                        </div>

                        {event.defects.length === 0 ? (
                          <div className={styles.emptyState}>
                            <AlertCircle size={18} /> {locale === "nl" ? "Geen defecten gemeld voor deze inspectie." : "No defects reported for this inspection."}
                          </div>
                        ) : (
                          <div className={styles.defectStack}>
                            <div className={styles.defectToolbar}>
                              <div className={styles.defectTitle}>{locale === "nl" ? "Uitklapbare defectlijst" : "Expandable defect list"}</div>
                              <button
                                className={styles.expandLink}
                                type="button"
                                onClick={() =>
                                  setExpanded((prev) => ({ ...prev, [event.id]: !isExpanded }))
                                }
                              >
                                {isExpanded
                                  ? locale === "nl"
                                    ? "Details inklappen"
                                    : "Collapse details"
                                  : locale === "nl"
                                  ? "Details uitklappen"
                                  : "Expand details"}
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </div>
                            {isExpanded ? (
                              <div className={styles.defectGrid}>
                                {event.defects.map((defect) => (
                                  <div key={defect.code} className={styles.defectItem}>
                                    <div className={`${styles.defectIcon} ${nodeClass}`}>
                                      <TriangleAlert size={18} />
                                    </div>
                                    <div className={styles.defectCopy}>
                                      <div className={styles.defectName}>{locale === "nl" ? "Defect" : "Defect"} {defect.code}</div>
                                      <div className={styles.defectDesc}>{defect.description}</div>
                                      {defect.recurring ? (
                                        <div className={styles.recurringTag}>
                                          <Repeat size={12} /> {locale === "nl" ? "Terugkerend defect" : "Recurring defect"}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className={styles.repairDeck}>
          <div className={styles.repairCard}>
            <div className={styles.repairHeader}>{locale === "nl" ? "Bekende issues" : "Known issues"}</div>
            {knownIssues.length ? (
              <div className={styles.repairList}>
                {knownIssues.map((issue) => (
                  <div key={issue.title} className={styles.repairRow}>
                    <div>
                      <div className={styles.repairTitle}>{issue.title}</div>
                      <div className={styles.repairMeta}>{issue.target} - {issue.severity}</div>
                    </div>
                    <div className={styles.issueAdvice}>{issue.advice}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.repairEmpty}>{locale === "nl" ? "Geen bekende issues opgeslagen." : "No known issues stored."}</div>
            )}
          </div>
        </div>
        </PremiumLock>
      </div>
    </div>
  );
}

