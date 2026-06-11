"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, ShieldAlert } from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { useI18n } from "@/lib/i18n/context";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import styles from "./DamageHistoryScreen.module.css";

type Props = {
  plate?: string;
  embedded?: boolean;
};

function formatDateLabel(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(6, 8)}-${value.slice(4, 6)}-${value.slice(0, 4)}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
  }
  return value;
}

/**
 * Eerlijke schadesignalen: uitsluitend wat in officiële registraties staat
 * (WOK-status, geconstateerde APK-gebreken, terugroepacties). Geen verzonnen
 * diagrammen of markers — geen data betekent: niets te zien, en dat zeggen we.
 */
export function DamageHistoryScreen({ plate, embedded = false }: Props) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const { isValid, data, isLoading, isError } = useVehicleLookup(plate ?? "");

  const defectDescriptions = useMemo(
    () => (data?.defectDescriptions ?? {}) as Record<string, string>,
    [data]
  );

  const events = useMemo(() => {
    const inspections = (data?.inspections ?? []) as Array<Record<string, unknown>>;
    const defects = (data?.defects ?? []) as Array<Record<string, unknown>>;
    const source = defects.length > 0 ? defects : inspections;
    return source
      .filter((row) => String(row.gebrek_identificatie ?? "").trim().length > 0)
      .map((row, index) => {
        const code = String(row.gebrek_identificatie ?? "").trim();
        return {
          id: `${code}-${index}`,
          code,
          title: defectDescriptions[code] || (nl ? `Gebrek ${code}` : `Defect ${code}`),
          date: formatDateLabel(row.meld_datum_door_keuringsinstantie_dt ?? row.meld_datum_door_keuringsinstantie),
          recognition: String(row.soort_erkenning_omschrijving ?? "").trim(),
          count: Number(row.aantal_gebreken_geconstateerd ?? 1) || 1
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data, defectDescriptions, nl]);

  const wok = Boolean(data?.vehicle?.wok);
  const recallOpen = Boolean(data?.vehicle?.hasOpenRecall);

  const wrap = (content: React.ReactNode) =>
    embedded ? (
      <>{content}</>
    ) : (
      <div className={styles.page}>
        <div className={styles.shell}>
          <VehicleNavBar plate={plate ?? ""} subtitle={nl ? "Schadesignalen" : "Damage signals"} />
          {content}
        </div>
      </div>
    );

  if (!plate || !isValid || isError) {
    return wrap(<div className={styles.loadingCard}>{nl ? "Voertuig niet gevonden." : "Vehicle not found."}</div>);
  }
  if (isLoading || !data) {
    return wrap(<div className={styles.loadingCard}>{nl ? "Schadesignalen laden..." : "Loading damage signals..."}</div>);
  }

  const hasSignals = wok || events.length > 0;
  const statusClass = wok ? styles.statusDanger : events.length > 0 ? styles.statusReview : styles.statusClean;
  const statusLabel = wok
    ? nl ? "WOK-registratie aanwezig" : "Salvage (WOK) registration"
    : events.length > 0
    ? nl ? `${events.length} geregistreerde signalen` : `${events.length} recorded signals`
    : nl ? "Geen schadesignalen" : "No damage signals";

  const checks = [
    {
      id: "wok",
      label: nl ? "WOK-status (RDW)" : "WOK status (RDW)",
      value: wok ? (nl ? "Geregistreerd" : "Registered") : nl ? "Geen registratie" : "Not registered",
      note: nl
        ? "Wachten Op Keuren: officiële markering na zware schade."
        : "Official salvage flag after serious damage.",
      tone: wok ? "danger" : "ok"
    },
    {
      id: "defects",
      label: nl ? "APK-gebreken" : "APK defects",
      value:
        events.length > 0
          ? nl ? `${events.length} geconstateerd` : `${events.length} recorded`
          : nl ? "Geen geconstateerd" : "None recorded",
      note: nl ? "Gebreken vastgelegd tijdens officiële keuringen." : "Defects recorded during official inspections.",
      tone: events.length > 0 ? "warn" : "ok"
    },
    {
      id: "recall",
      label: nl ? "Terugroepacties" : "Recalls",
      value: recallOpen ? (nl ? "Open actie" : "Open recall") : nl ? "Geen open acties" : "None open",
      note: nl ? "Veiligheidsgerelateerde fabrieksacties." : "Safety-related manufacturer campaigns.",
      tone: recallOpen ? "warn" : "ok"
    }
  ];

  return wrap(
    <PremiumLock featureName={nl ? "Schadesignalen" : "Damage signals"} isLocked={true} plate={plate} sectionKey="damageHistory">
      <div className={styles.panel}>
        <div className={styles.headerRow}>
          <div className={styles.headerCopy}>
            <div className={styles.title}>{nl ? "Schadesignalen uit officiële registraties" : "Damage signals from official records"}</div>
            <p className={styles.subtitle}>
              {nl
                ? "Volledige schadehistorie van verzekeraars is in Nederland niet openbaar. Wij tonen daarom uitsluitend de officiële signalen: WOK-status, geconstateerde APK-gebreken en terugroepacties."
                : "Full insurer damage history is not public in the Netherlands. We therefore show only the official signals: WOK status, recorded APK defects and recalls."}
            </p>
          </div>
          <span className={`${styles.statusChip} ${statusClass}`}>
            {wok ? <ShieldAlert size={15} /> : hasSignals ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
            {statusLabel}
          </span>
        </div>

        <div className={styles.checksGrid}>
          {checks.map((check) => (
            <div key={check.id} className={styles.checkCard}>
              <span
                className={`${styles.checkIcon} ${
                  check.tone === "danger" ? styles.checkDanger : check.tone === "warn" ? styles.checkWarn : styles.checkOk
                }`}
              >
                {check.tone === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </span>
              <div className={styles.checkCopy}>
                <span className={styles.checkLabel}>{check.label}</span>
                <span className={styles.checkValue}>{check.value}</span>
                <span className={styles.checkNote}>{check.note}</span>
              </div>
            </div>
          ))}
        </div>

        {!hasSignals ? (
          <div className={styles.cleanState}>
            <ShieldCheck size={22} />
            <div>
              <div className={styles.cleanTitle}>
                {nl ? "Geen schadesignalen in de officiële data" : "No damage signals in the official data"}
              </div>
              <p className={styles.cleanCopy}>
                {nl
                  ? "Geen WOK-registratie, geen geconstateerde gebreken bij keuringen en geen open terugroepacties. Controleer bij de bezichtiging altijd ook lak, naden en het onderhoudsboekje."
                  : "No WOK registration, no recorded inspection defects and no open recalls. During the viewing, still check paint, panel gaps and the service book."}
              </p>
            </div>
          </div>
        ) : (
          events.length > 0 && (
            <>
              <div className={styles.eventsHeader}>
                {nl ? "Geconstateerde gebreken per keuring" : "Recorded defects per inspection"}
              </div>
              <div className={styles.eventsList}>
                {events.map((event) => (
                  <div key={event.id} className={styles.eventCard}>
                    <div className={styles.eventTop}>
                      <span className={styles.eventTitle}>
                        <AlertTriangle size={16} />
                        {event.title}
                      </span>
                      {event.date ? <span className={styles.eventDate}>{event.date}</span> : null}
                    </div>
                    <div className={styles.eventMeta}>
                      <span className={styles.metaChip}>{nl ? "Code" : "Code"} {event.code}</span>
                      {event.count > 1 ? (
                        <span className={styles.metaChip}>
                          {event.count}× {nl ? "geconstateerd" : "recorded"}
                        </span>
                      ) : null}
                      {event.recognition ? <span className={styles.metaChip}>{event.recognition}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        )}

        <p className={styles.sourceNote}>
          {nl
            ? "Bron: RDW open data (voertuigregister, keuringen, terugroepacties). Inhoud komt rechtstreeks uit officiële records."
            : "Source: RDW open data (vehicle register, inspections, recalls). Content comes directly from official records."}
        </p>
      </div>
    </PremiumLock>
  );
}
