"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Download,
  Share2,
  Shield,
  Sparkles
} from "lucide-react";
import styles from "./DamageHistoryScreen.module.css";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import { useI18n } from "@/lib/i18n/context";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";


type Props = {
  plate?: string;
};


function buildPlateHref(plate: string | undefined, suffix = "") {
  if (!plate) return suffix || "/";
  return `/search/${plate}${suffix}`;
}

function SeverityChip({ tone, label }: { tone: "warning" | "low"; label: string }) {
  return (
    <span className={`${styles.severityChip} ${tone === "low" ? styles.severityChipLow : ""}`}>
      {label}
    </span>
  );
}

function formatDateLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  if (/^\d{8}$/.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6)) - 1;
    const d = Number(raw.slice(6, 8));
    const date = new Date(y, m, d);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("nl-NL");
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("nl-NL");
  return raw;
}

export function DamageHistoryScreen({ plate }: Props) {
  const { locale } = useI18n();
  const isNl = locale === "nl";
  const backHref = buildPlateHref(plate);
  const { isValid, data, isLoading, isError } = useVehicleLookup(plate ?? "");

  const defects = useMemo(() => (data?.defects ?? []) as Array<Record<string, unknown>>, [data]);
  const recalls = useMemo(() => (data?.recalls ?? []) as Array<Record<string, unknown>>, [data]);
  const defectDescriptions = useMemo(
    () => ((data?.defectDescriptions ?? {}) as Record<string, string>),
    [data]
  );

  // Group the real APK defect records by defect code so this screen shows WHICH
  // problems the car has and how often they recur — a synthesis, deliberately
  // different from the chronological per-keuring list on the inspection tab (so
  // it is "extra", not a duplicate). Each a34c-vvps row is one observed defect.
  const damageEvents = useMemo(() => {
    const byCode = new Map<
      string,
      { code: string; title: string; occurrences: number; lastDateValue: number; lastDate: string; recognition: string }
    >();
    for (const row of defects) {
      const code = String(row.gebrek_identificatie ?? row.gebrek_identificatienummer ?? "").trim();
      if (!code) continue;
      const title = defectDescriptions[code] || code || (isNl ? "Gebrek" : "Defect");
      const dateRaw =
        row.meld_datum_door_keuringsinstantie_dt ??
        row.meld_datum_door_keuringsinstantie ??
        row.datum ??
        row.date ??
        "";
      const dateLabel = formatDateLabel(dateRaw);
      const dateValue = new Date(formatDateLabel(dateRaw).split("-").reverse().join("-")).getTime();
      const recognition = String(row.soort_erkenning_omschrijving ?? row.soort_erkenning_keuringsinstantie ?? "-");
      const existing = byCode.get(code);
      if (existing) {
        existing.occurrences += 1;
        if (Number.isFinite(dateValue) && dateValue > existing.lastDateValue) {
          existing.lastDateValue = dateValue;
          existing.lastDate = dateLabel;
        }
      } else {
        byCode.set(code, {
          code,
          title,
          occurrences: 1,
          lastDateValue: Number.isFinite(dateValue) ? dateValue : 0,
          lastDate: dateLabel,
          recognition
        });
      }
    }
    return Array.from(byCode.values())
      .map((entry, index) => ({ id: `${entry.code}-${index}`, ...entry }))
      .sort((a, b) => b.occurrences - a.occurrences || b.lastDateValue - a.lastDateValue);
  }, [defects, defectDescriptions, isNl]);

  // Number of distinct keuringen on which defects were recorded.
  const keuringDates = useMemo(() => {
    const set = new Set<string>();
    for (const row of defects) {
      const d = row.meld_datum_door_keuringsinstantie_dt ?? row.meld_datum_door_keuringsinstantie ?? "";
      if (d) set.add(String(d));
    }
    return set.size;
  }, [defects]);

  const legendItems = [
    { id: "unique", label: isNl ? "Unieke gebreken" : "Unique defects", count: String(damageEvents.length) },
    { id: "panel", label: isNl ? "Keuringen met gebreken" : "Inspections with defects", count: String(keuringDates) },
    { id: "paint", label: isNl ? "Recalls" : "Recalls", count: String(recalls.length) }
  ];

  const latestEvent = damageEvents[0];

  if (!isValid || isError) {
    return <div className={styles.page}><div className={styles.shell}>{isNl ? "Voertuig niet gevonden." : "Vehicle not found."}</div></div>;
  }
  if (isLoading || !data) {
    return <div className={styles.page}><div className={styles.shell}>{isNl ? "Schadehistorie laden..." : "Loading damage history..."}</div></div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        {plate ? (
          <VehicleNavBar plate={plate} subtitle={isNl ? "Schadehistorie" : "Damage history"} />
        ) : (
          <div className={`${styles.topbar} ${styles.surface}`}>
            <div className={styles.brand}>
              <Link href={backHref} className={styles.backBtn} aria-label={isNl ? "Terug" : "Back"}>
                <ArrowLeft size={18} />
              </Link>
              <div className={styles.brandCopy}>
                <div className={styles.brandTitle}>{isNl ? "Schadehistorie" : "Damage history"}</div>
                <div className={styles.brandSubtitle}>{isNl ? "Gemelde defecten uit RDW- en APK-historie" : "Reported defects from RDW and APK history"}</div>
              </div>
            </div>
            <div className={styles.topActions}>
              <button className={styles.pillBtn} type="button">
                <Shield size={16} /> {isNl ? "Schadescore" : "Damage score"}
              </button>
              <button className={styles.pillBtn} type="button">
                <Share2 size={16} /> {isNl ? "Delen" : "Share"}
              </button>
              <button className={`${styles.pillBtn} ${styles.pillPrimary}`} type="button">
                <Download size={16} /> {isNl ? "Historie exporteren" : "Export history"}
              </button>
            </div>
          </div>
        )}

        <PremiumLock featureName={isNl ? "Schadehistorie" : "Damage History"} isLocked={true} plate={plate} sectionKey="damageHistory">
          <div className={styles.hero}>
            <div className={`${styles.heroMain} ${styles.surface}`}>
              <div className={styles.eyebrow}>
                <Sparkles size={14} /> {isNl ? "Defecthistorie" : "Defect history"}
              </div>
              <div className={styles.headlineBlock}>
                <div className={styles.headline}>
                  {isNl
                    ? "De gemelde defecten en keuringssignalen uit de RDW- en APK-historie in één overzicht."
                    : "The reported defects and inspection signals from the RDW and APK history in one overview."}
                </div>
                <div className={styles.subhead}>
                  {isNl
                    ? "RDW kent geen apart schaderegister of schadelocaties. Dit zijn de bij de APK geconstateerde gebreken, gegroepeerd per gebrek met hoe vaak ze voorkwamen. Het volledige verloop per keuring staat op het tabblad Inspectie."
                    : "RDW has no separate damage register or body locations. These are the defects observed at the APK, grouped per defect with how often they occurred. The full per-inspection history is on the Inspection tab."}
                </div>
              </div>
                <div className={styles.heroStats}>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>{isNl ? "Unieke gebreken" : "Unique defects"}</div>
                    <div className={styles.statValue}>{damageEvents.length}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>{isNl ? "Keuringen met gebreken" : "Inspections with defects"}</div>
                    <div className={styles.statValue}>{keuringDates}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>{isNl ? "Laatst gemeld" : "Last reported"}</div>
                    <div className={styles.statValue}>{latestEvent?.lastDate ?? "-"}</div>
                  </div>
                </div>
              </div>

            <div className={`${styles.heroSide} ${styles.surface}`}>
              <div className={styles.summaryTitle}>{isNl ? "Schadesamenvatting" : "Damage summary"}</div>
              <div className={styles.summaryCard}>
                <div className={`${styles.statusPill} ${styles.statusSuccess}`}>
                  <BadgeCheck size={12} /> {isNl ? "Gebaseerd op RDW/APK-data" : "Based on RDW/APK data"}
                </div>
                <div className={styles.summaryValue}>{damageEvents.length === 0 ? (isNl ? "Geen events" : "No events") : (isNl ? "Events gevonden" : "Events found")}</div>
                <div className={styles.summaryCopy}>
                  {isNl
                    ? "Deze samenvatting komt direct uit de beschikbare inspectie-, defect- en recallrecords."
                    : "This summary is mapped directly from available inspection, defect, and recall records."}
                </div>
                <div className={styles.summaryBar}>
                  <div className={styles.summaryFill} />
                </div>
              </div>
              <div className={styles.summaryCard}>
                <div className={`${styles.statusPill} ${styles.statusWarning}`}>
                  <AlertCircle size={12} /> {isNl ? "Laatste gemelde event" : "Latest reported event"}
                </div>
                <div className={styles.summaryCopy}>
                  {latestEvent
                    ? `${latestEvent.lastDate} · ${latestEvent.title}`
                    : isNl
                    ? "Geen gebreken beschikbaar in de dataset."
                    : "No defects available in the dataset."}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.contentGrid}>
            <div className={`${styles.diagramPanel} ${styles.surface}`}>
              <div className={styles.panelHead}>
                <div className={styles.panelTitleGroup}>
                  <div className={styles.panelTitle}>{isNl ? "Defectoverzicht" : "Defect overview"}</div>
                  <div className={styles.panelCopy}>
                    {isNl ? "Aantallen uit de RDW- en APK-historie." : "Counts from the RDW and APK history."}
                  </div>
                </div>
              </div>

              <div className={styles.diagramStage}>
                <div className={styles.legendCard}>
                  <div className={styles.legendTitle}>{isNl ? "Legenda" : "Legend"}</div>
                  <div className={styles.legendList}>
                    {legendItems.map((item) => (
                      <div className={styles.legendItem} key={item.id}>
                        <div className={styles.legendLeft}>
                          <span
                            className={`${styles.legendDot} ${item.id === "panel" ? styles.dotPrimary : styles.dotWarning}`}
                          />
                          <span className={styles.legendName}>{item.label}</span>
                        </div>
                        <span className={styles.legendValue}>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.detailColumn}>
              <div className={styles.cleanCard}>
                <div className={styles.cleanTop}>
                  <div className={styles.cleanIcon}>
                    <BadgeCheck size={18} />
                  </div>
                  <div>
                    <div className={styles.cleanTitle}>
                      {defects.length === 0
                        ? isNl ? "Geen gebreken gevonden" : "No defects found"
                        : isNl ? `${defects.length} defectrecords` : `${defects.length} defect records`}
                    </div>
                    <div className={styles.cleanCopy}>
                      {defects.length === 0
                        ? isNl
                          ? "In de beschikbare RDW- en APK-historie zijn geen gebreken gemeld."
                          : "No defects are reported in the available RDW and APK history."
                        : isNl
                        ? "Gebaseerd op de gemelde gebreken in de RDW- en APK-historie; zie de details hieronder."
                        : "Based on the defects reported in the RDW and APK history; see the details below."}
                    </div>
                  </div>
                </div>
              </div>

              {damageEvents.map((card, index) => (
                <div className={styles.detailCard} key={card.id}>
                  <div className={styles.detailHead}>
                    <div className={styles.detailTitleWrap}>
                      <div className={styles.detailKicker}>{isNl ? "Gebrek" : "Defect"} {index + 1}</div>
                      <div className={styles.detailTitle}>{card.title}</div>
                    </div>
                    <SeverityChip tone={card.occurrences > 1 ? "warning" : "low"} label={card.occurrences > 1 ? (isNl ? "Terugkerend" : "Recurring") : (isNl ? "Eenmalig" : "One-off")} />
                  </div>
                  <div className={styles.detailGrid}>
                    <div className={styles.infoBox}>
                      <div className={styles.infoLabel}>{isNl ? "Laatst gemeld" : "Last reported"}</div>
                      <div className={styles.infoValue}>{card.lastDate}</div>
                    </div>
                    <div className={styles.infoBox}>
                      <div className={styles.infoLabel}>{isNl ? "Defectcode" : "Defect code"}</div>
                      <div className={styles.infoValue}>{card.code}</div>
                    </div>
                    <div className={styles.infoBox}>
                      <div className={styles.infoLabel}>{isNl ? "Erkenning" : "Recognition"}</div>
                      <div className={styles.infoValue}>{card.recognition}</div>
                    </div>
                    <div className={styles.infoBox}>
                      <div className={styles.infoLabel}>{isNl ? "Aantal keuringen" : "Times seen"}</div>
                      <div className={styles.infoValue}>{card.occurrences}×</div>
                    </div>
                  </div>
                  <div className={styles.detailCopy}>
                    {isNl
                      ? "Inhoud komt direct uit RDW/APK records. Controleer details met documentatie van verkoper."
                      : "Content is mapped directly from RDW/APK records. Validate details with seller documentation."}
                  </div>
                  <div className={styles.detailFooter}>
                    <div className={styles.tagRow}>
                      <span className={styles.miniTag}>{card.code}</span>
                      <span className={styles.miniTag}>{card.recognition}</span>
                    </div>
                    <span className={styles.linkBtn}>{isNl ? "RDW record" : "RDW record"}</span>
                  </div>
                </div>
              ))}
              {damageEvents.length === 0 ? (
                <div className={styles.detailCard}>
                  <div className={styles.detailTitle}>{isNl ? "Geen schade-events in dataset" : "No damage events in dataset"}</div>
                </div>
              ) : null}
            </div>
          </div>
        </PremiumLock>

      </div>
    </div>
  );
}

