"use client";

import { useMemo } from "react";
import { Globe, Flag, Users, FileCheck2 } from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import styles from "./OwnershipTimelineScreen.module.css";
import { VehicleNavBar } from "./VehicleNavBar";
import { useI18n } from "@/lib/i18n/context";
import { PremiumLock } from "../ui/PremiumLock";

type Props = {
  plate: string;
};

type TimelineEntry = {
  id: string;
  label: string;
  detail: string;
  note?: string;
  tone: "default" | "warning";
  icon: "world" | "nl" | "owners" | "apk";
};

function formatLongDate(dateValue: string | null, locale: "nl" | "en") {
  if (!dateValue) return locale === "nl" ? "Onbekend" : "Unknown";
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return locale === "nl" ? "Onbekend" : "Unknown";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
}

// RDW exposes the NUMBER of keepers (aantal_houders) and the registration dates,
// but NOT the date or type of each individual owner. So we build a timeline from
// the real registration milestones we DO have, and state the owner count as a
// fact -- no invented per-owner periods or lease/dealer/private labels.
function buildRegistrationTimeline(
  vehicle: {
    firstRegistrationWorld: string | null;
    firstRegistrationNL: string | null;
    apkExpiryDate: string | null;
    owners: { count: number | null };
    currentOwnerSince: string | null;
  },
  isImported: boolean,
  locale: "nl" | "en"
): TimelineEntry[] {
  const nl = locale === "nl";
  const entries: TimelineEntry[] = [];

  if (vehicle.firstRegistrationWorld) {
    entries.push({
      id: "world",
      label: nl ? "Eerste toelating (wereld)" : "First registration (world)",
      detail: formatLongDate(vehicle.firstRegistrationWorld, locale),
      icon: "world",
      tone: "default"
    });
  }

  if (vehicle.firstRegistrationNL && vehicle.firstRegistrationNL !== vehicle.firstRegistrationWorld) {
    entries.push({
      id: "nl",
      label: isImported
        ? nl ? "Import: eerste registratie in Nederland" : "Import: first registration in the Netherlands"
        : nl ? "Eerste registratie in Nederland" : "First registration in the Netherlands",
      detail: formatLongDate(vehicle.firstRegistrationNL, locale),
      icon: "nl",
      tone: isImported ? "warning" : "default"
    });
  }

  if (vehicle.currentOwnerSince) {
    entries.push({
      id: "owner-since",
      label: nl ? "Huidige eigenaar sinds" : "Current owner since",
      detail: formatLongDate(vehicle.currentOwnerSince, locale),
      icon: "owners",
      tone: "default"
    });
  }

  // RDW open data does not publish the keeper count, so only show it when a value
  // is actually present -- never a misleading "Unknown" placeholder.
  if (vehicle.owners.count != null) {
    entries.push({
      id: "owners",
      label: nl ? "Aantal tenaamstellingen" : "Number of registrations",
      detail: `${vehicle.owners.count}`,
      icon: "owners",
      tone: vehicle.owners.count > 4 ? "warning" : "default"
    });
  }

  if (vehicle.apkExpiryDate) {
    entries.push({
      id: "apk",
      label: nl ? "APK geldig tot" : "APK valid until",
      detail: formatLongDate(vehicle.apkExpiryDate, locale),
      icon: "apk",
      tone: "default"
    });
  }

  return entries;
}

function IconForType({ type }: { type: TimelineEntry["icon"] }) {
  if (type === "world") return <Globe size={24} />;
  if (type === "nl") return <Flag size={24} />;
  if (type === "apk") return <FileCheck2 size={24} />;
  return <Users size={24} />;
}

export function OwnershipTimelineScreen({ plate }: Props) {
  const { locale } = useI18n();
  const { isValid, data, isLoading, isError } = useVehicleLookup(plate);

  const entries = useMemo(() => {
    if (!data) return [];
    const v = data.vehicle;
    const imported =
      !!v.firstRegistrationNL && !!v.firstRegistrationWorld && v.firstRegistrationNL !== v.firstRegistrationWorld;
    return buildRegistrationTimeline(v, imported, locale);
  }, [data, locale]);

  if (!isValid || isError) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.contentContainer}>
          <div className={styles.glassPanel}>{locale === "nl" ? "Voertuig niet gevonden." : "Vehicle not found."}</div>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.contentContainer}>
          <div className={styles.glassPanel}>{locale === "nl" ? "Eigendomstijdlijn laden..." : "Loading ownership timeline..."}</div>
        </div>
      </div>
    );
  }

  const registrationItems = [
    { label: locale === "nl" ? "APK vervaldatum" : "APK expiry", value: formatLongDate(data.vehicle.apkExpiryDate, locale) },
    { label: locale === "nl" ? "Eerste toelating (NL)" : "First registration (NL)", value: formatLongDate(data.vehicle.firstRegistrationNL, locale) },
    { label: locale === "nl" ? "Eerste toelating (wereld)" : "First registration (world)", value: formatLongDate(data.vehicle.firstRegistrationWorld, locale) },
    { label: locale === "nl" ? "NAP-oordeel" : "NAP verdict", value: data.vehicle.napVerdict ?? (locale === "nl" ? "Onbekend" : "Unknown") },
    { label: locale === "nl" ? "Overdracht mogelijk" : "Transfer possible", value: data.vehicle.transferPossible ? (locale === "nl" ? "Ja" : "Yes") : (locale === "nl" ? "Nee" : "No") },
    { label: locale === "nl" ? "WOK-gemarkeerd" : "WOK flagged", value: data.vehicle.wok ? (locale === "nl" ? "Ja" : "Yes") : (locale === "nl" ? "Nee" : "No") },
    { label: locale === "nl" ? "Verzekerd" : "Insured", value: data.vehicle.insured ? (locale === "nl" ? "Ja" : "Yes") : (locale === "nl" ? "Nee" : "No") },
    { label: locale === "nl" ? "Terugroepacties" : "Recalls", value: `${data.vehicle.recallsCount}` }
  ];

  return (
    <div className={styles.pageContainer}>
      <div className={styles.contentContainer}>
        <VehicleNavBar plate={plate} subtitle={locale === "nl" ? "Eigendomshistorie" : "Ownership history"} />

        <PremiumLock
          featureName={locale === "nl" ? "Eigendomshistorie" : "Ownership history"}
          isLocked={true}
          plate={plate}
          sectionKey="ownershipHistory"
        >
        <div className={styles.registrationPanel}>
          <div className={styles.registrationHeader}>
            <div>
              <div className={styles.registrationTitle}>{locale === "nl" ? "Registratie & signalen" : "Registration & flags"}</div>
              <p className={styles.registrationSubtitle}>{locale === "nl" ? "Overdracht, terugroepacties en keuringsmetadata." : "Transfer, recalls and inspection metadata."}</p>
            </div>
          </div>
          <div className={styles.registrationGrid}>
            {registrationItems.map((item) => (
              <div key={item.label} className={styles.registrationRow}>
                <span className={styles.registrationLabel}>{item.label}</span>
                <span className={styles.registrationValue}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${styles.timelineContainer} ${styles.glassPanel}`}>
          <div className={styles.timelineHeader}>
            <h2 className={styles.timelineTitle}>{locale === "nl" ? "Registratiehistorie" : "Registration history"}</h2>
          </div>

          <div className={styles.timeline}>
            {entries.map((entry) => (
                <div key={entry.id} className={styles.timelineItem}>
                  <div className={`${styles.timelineNode} ${entry.tone === "warning" ? styles.nodeWarning : ""}`} />
                  <div className={`${styles.ownerCard} ${entry.tone === "warning" ? styles.cardWarning : ""}`}>
                    <div className={styles.ownerTop}>
                      <div className={styles.ownerIdentity}>
                        <div className={styles.ownerAvatar}>
                          <IconForType type={entry.icon} />
                        </div>
                        <div className={styles.ownerInfo}>
                          <div className={styles.ownerName}>{entry.label}</div>
                          {entry.note ? <div className={styles.ownerType}>{entry.note}</div> : null}
                        </div>
                      </div>
                      <div className={styles.ownerDates}>
                        <div className={styles.dateRange}>{entry.detail}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
        </PremiumLock>
      </div>
    </div>
  );
}

