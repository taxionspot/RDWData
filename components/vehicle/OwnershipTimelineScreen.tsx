"use client";

import { useMemo } from "react";
import { Briefcase, Store, User } from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import styles from "./OwnershipTimelineScreen.module.css";
import { VehicleNavBar } from "./VehicleNavBar";
import { useI18n } from "@/lib/i18n/context";
import { PremiumLock } from "../ui/PremiumLock";

type Props = {
  plate: string;
  embedded?: boolean;
};

type OwnershipEntry = {
  id: string;
  label: string;
  type: string;
  range: string;
  duration: string;
  warning?: string;
  tone: "default" | "warning";
  icon: "business" | "private" | "lease";
};

function formatYear(dateValue: string | null) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear();
}

function formatLongDate(dateValue: string | null, locale: "nl" | "en") {
  if (!dateValue) return locale === "nl" ? "Onbekend" : "Unknown";
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return locale === "nl" ? "Onbekend" : "Unknown";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
}

function buildOwnershipTimeline(
  firstYear: number | null,
  ownersCount: number | null,
  locale: "nl" | "en"
): OwnershipEntry[] {
  if (!ownersCount || ownersCount < 1 || !firstYear) {
    return [];
  }

  const currentYear = new Date().getFullYear();
  const totalYears = Math.max(currentYear - firstYear, ownersCount);
  const segment = Math.max(Math.floor(totalYears / ownersCount), 1);

  const entries: OwnershipEntry[] = [];
  let start = firstYear;

  for (let i = ownersCount; i >= 1; i -= 1) {
    const end = i === 1 ? (locale === "nl" ? "Heden" : "Present") : String(start + segment);
    const range = `${start} - ${end}`;
    const duration =
      i === 1
        ? locale === "nl"
          ? "Huidige eigenaar"
          : "Current owner"
        : `${segment} ${locale === "nl" ? "jaar" : `year${segment > 1 ? "s" : ""}`}`;

    const icon: OwnershipEntry["icon"] = i === ownersCount
      ? "lease"
      : i === 1
      ? "business"
      : "private";

    entries.push({
      id: `owner-${i}`,
      label: `${locale === "nl" ? "Eigenaar" : "Owner"} ${i}${i === 1 ? ` (${locale === "nl" ? "Huidig" : "Current"})` : ""}`,
      type:
        icon === "lease"
          ? locale === "nl"
            ? "Zakelijke lease"
            : "Corporate Lease"
          : icon === "business"
          ? locale === "nl"
            ? "Dealer / Bedrijf"
            : "Dealer / Business"
          : locale === "nl"
          ? "Particulier"
          : "Private Individual",
      range,
      duration,
      warning: i === 1 && segment <= 1 ? (locale === "nl" ? "Controle aanbevolen: korte eigendomsduur." : "Review recommended: short ownership window.") : undefined,
      tone: i === 1 && segment <= 1 ? "warning" : "default",
      icon
    });

    if (typeof end === "string" && end !== "Present" && end !== "Heden") {
      start = Number(end);
    }
  }

  return entries.reverse();
}

function IconForType({ type }: { type: OwnershipEntry["icon"] }) {
  if (type === "business") return <Store size={24} />;
  if (type === "lease") return <Briefcase size={24} />;
  return <User size={24} />;
}

export function OwnershipTimelineScreen({ plate, embedded = false }: Props) {
  const { locale } = useI18n();
  const { isValid, data, isLoading, isError } = useVehicleLookup(plate);

  const ownersCount = data?.vehicle.owners.count ?? null;
  const firstYear = formatYear(data?.vehicle.firstRegistrationWorld ?? null);

  const entries = useMemo(() => buildOwnershipTimeline(firstYear, ownersCount, locale), [firstYear, ownersCount, locale]);

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
    <div className={embedded ? undefined : styles.pageContainer}>
      <div className={embedded ? undefined : styles.contentContainer}>
        {!embedded && <VehicleNavBar plate={plate} subtitle={locale === "nl" ? "Eigendomshistorie" : "Ownership history"} />}

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
            <h2 className={styles.timelineTitle}>{locale === "nl" ? "Eigendomstijdlijn" : "Ownership Timeline"}</h2>
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
                          <div className={styles.ownerType}>{entry.type}</div>
                        </div>
                      </div>
                      <div className={styles.ownerDates}>
                        <div className={styles.dateRange}>{entry.range}</div>
                        <div className={styles.durationBadge}>{entry.duration}</div>
                      </div>
                    </div>
                    {entry.warning ? (
                      <div className={styles.warningAlert}>
                        {entry.warning}
                      </div>
                    ) : null}
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

