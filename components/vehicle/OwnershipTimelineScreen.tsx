"use client";

import { useMemo } from "react";
import { Car, FileSignature, Flag, Info } from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import styles from "./OwnershipTimelineScreen.module.css";
import { VehicleNavBar } from "./VehicleNavBar";
import { useI18n } from "@/lib/i18n/context";
import { PremiumLock } from "../ui/PremiumLock";

type Props = {
  plate: string;
  embedded?: boolean;
};

type RegistrationEvent = {
  id: string;
  label: string;
  detail: string;
  date: string;
  icon: "registration" | "import" | "transfer";
  tone: "default" | "warning";
  warning?: string;
};

function formatLongDate(dateValue: string | null | undefined, locale: "nl" | "en") {
  if (!dateValue) return locale === "nl" ? "Onbekend" : "Unknown";
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return locale === "nl" ? "Onbekend" : "Unknown";
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { dateStyle: "medium" }).format(parsed);
}

function yearsBetween(from: string | null | undefined, to: Date): number | null {
  if (!from) return null;
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return null;
  return (to.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

function IconForType({ type }: { type: RegistrationEvent["icon"] }) {
  if (type === "import") return <Flag size={24} />;
  if (type === "transfer") return <FileSignature size={24} />;
  return <Car size={24} />;
}

/**
 * Eerlijke registratiehistorie: uitsluitend de momenten die echt in het
 * RDW-register staan (eerste toelating, NL-registratie/import, laatste
 * tenaamstelling). Het aantal eigenaren is in Nederland niet openbaar; dat
 * zeggen we expliciet in plaats van een tijdlijn te verzinnen.
 */
export function OwnershipTimelineScreen({ plate, embedded = false }: Props) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const { isValid, data, isLoading, isError } = useVehicleLookup(plate);

  const lastTransferDate = useMemo(() => {
    const main = (data?.raw?.main?.[0] ?? {}) as Record<string, unknown>;
    const value = main.datum_tenaamstelling_dt ?? main.datum_tenaamstelling;
    if (typeof value !== "string" || !value.trim()) return null;
    if (/^\d{8}$/.test(value)) {
      return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    }
    return value;
  }, [data]);

  const events = useMemo<RegistrationEvent[]>(() => {
    if (!data?.vehicle) return [];
    const v = data.vehicle;
    const list: RegistrationEvent[] = [];

    if (v.firstRegistrationWorld) {
      list.push({
        id: "first-world",
        label: nl ? "Eerste toelating" : "First registration",
        detail: nl ? "Het voertuig is voor het eerst op de weg toegelaten." : "The vehicle was first admitted to the road.",
        date: v.firstRegistrationWorld,
        icon: "registration",
        tone: "default"
      });
    }

    const imported = Boolean(
      v.firstRegistrationNL && v.firstRegistrationWorld && v.firstRegistrationNL !== v.firstRegistrationWorld
    );
    if (imported && v.firstRegistrationNL) {
      list.push({
        id: "import-nl",
        label: nl ? "Geïmporteerd naar Nederland" : "Imported into the Netherlands",
        detail: nl
          ? "Eerste tenaamstelling in Nederland. De buitenlandse periode is niet zichtbaar in Nederlandse registers."
          : "First registration in the Netherlands. The foreign period is not visible in Dutch registers.",
        date: v.firstRegistrationNL,
        icon: "import",
        tone: "warning",
        warning: nl
          ? "Importvoertuig: vraag de verkoper naar buitenlandse historie en onderhoudsbewijzen."
          : "Imported vehicle: ask the seller for foreign history and maintenance proof."
      });
    }

    if (lastTransferDate) {
      const yearsAgo = yearsBetween(lastTransferDate, new Date());
      const isRecent = yearsAgo != null && yearsAgo < 0.5;
      list.push({
        id: "last-transfer",
        label: nl ? "Laatste tenaamstelling" : "Latest registration transfer",
        detail: nl
          ? "De huidige eigenaar staat sinds deze datum geregistreerd."
          : "The current keeper has been registered since this date.",
        date: lastTransferDate,
        icon: "transfer",
        tone: isRecent ? "warning" : "default",
        warning: isRecent
          ? nl
            ? "Recente overdracht: korte bezitsduur kan op snelle doorverkoop wijzen. Vraag waarom de auto alweer te koop staat."
            : "Recent transfer: a short holding period can indicate quick flipping. Ask why the car is for sale again."
          : undefined
      });
    }

    return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, lastTransferDate, nl]);

  const wrap = (content: React.ReactNode) =>
    embedded ? (
      <>{content}</>
    ) : (
      <div className={styles.pageContainer}>
        <div className={styles.contentContainer}>
          <VehicleNavBar plate={plate} subtitle={nl ? "Eigendom & registratie" : "Ownership & registration"} />
          {content}
        </div>
      </div>
    );

  if (!isValid || isError) {
    return wrap(<div className={styles.glassPanel}>{nl ? "Voertuig niet gevonden." : "Vehicle not found."}</div>);
  }

  if (isLoading || !data) {
    return wrap(<div className={styles.glassPanel}>{nl ? "Registratiehistorie laden..." : "Loading registration history..."}</div>);
  }

  const registrationItems = [
    { label: nl ? "APK vervaldatum" : "APK expiry", value: formatLongDate(data.vehicle.apkExpiryDate, locale) },
    { label: nl ? "Eerste toelating (NL)" : "First registration (NL)", value: formatLongDate(data.vehicle.firstRegistrationNL, locale) },
    { label: nl ? "Eerste toelating (wereld)" : "First registration (world)", value: formatLongDate(data.vehicle.firstRegistrationWorld, locale) },
    {
      label: nl ? "Laatste tenaamstelling" : "Latest transfer",
      value: lastTransferDate ? formatLongDate(lastTransferDate, locale) : nl ? "Onbekend" : "Unknown"
    },
    { label: nl ? "NAP-oordeel" : "NAP verdict", value: data.vehicle.napVerdict ?? (nl ? "Onbekend" : "Unknown") },
    { label: nl ? "Overdracht mogelijk" : "Transfer possible", value: data.vehicle.transferPossible ? (nl ? "Ja" : "Yes") : nl ? "Nee" : "No" },
    { label: nl ? "WOK-gemarkeerd" : "WOK flagged", value: data.vehicle.wok ? (nl ? "Ja" : "Yes") : nl ? "Nee" : "No" },
    { label: nl ? "Verzekerd (WAM)" : "Insured (WAM)", value: data.vehicle.insured ? (nl ? "Ja" : "Yes") : nl ? "Nee" : "No" },
    { label: nl ? "Taxi-verleden" : "Taxi history", value: data.vehicle.isTaxi ? (nl ? "Ja" : "Yes") : nl ? "Nee" : "No" },
    { label: nl ? "Terugroepacties" : "Recalls", value: `${data.vehicle.recallsCount}` }
  ];

  return wrap(
    <PremiumLock
      featureName={nl ? "Eigendom & registratie" : "Ownership & registration"}
      isLocked={true}
      plate={plate}
      sectionKey="ownershipHistory"
    >
      <div className={styles.registrationPanel}>
        <div className={styles.registrationHeader}>
          <div>
            <div className={styles.registrationTitle}>{nl ? "Registratie & signalen" : "Registration & flags"}</div>
            <p className={styles.registrationSubtitle}>
              {nl ? "Officiële registratiestatus uit het RDW-register." : "Official registration status from the RDW register."}
            </p>
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
          <h2 className={styles.timelineTitle}>{nl ? "Geregistreerde momenten" : "Registered moments"}</h2>
        </div>

        {events.length === 0 ? (
          <p className={styles.registrationSubtitle}>
            {nl ? "Geen registratiedatums beschikbaar voor dit voertuig." : "No registration dates available for this vehicle."}
          </p>
        ) : (
          <div className={styles.timeline}>
            {events.map((event) => (
              <div key={event.id} className={styles.timelineItem}>
                <div className={`${styles.timelineNode} ${event.tone === "warning" ? styles.nodeWarning : ""}`} />
                <div className={`${styles.ownerCard} ${event.tone === "warning" ? styles.cardWarning : ""}`}>
                  <div className={styles.ownerTop}>
                    <div className={styles.ownerIdentity}>
                      <div className={styles.ownerAvatar}>
                        <IconForType type={event.icon} />
                      </div>
                      <div className={styles.ownerInfo}>
                        <div className={styles.ownerName}>{event.label}</div>
                        <div className={styles.ownerType}>{event.detail}</div>
                      </div>
                    </div>
                    <div className={styles.ownerDates}>
                      <div className={styles.dateRange}>{formatLongDate(event.date, locale)}</div>
                    </div>
                  </div>
                  {event.warning ? <div className={styles.warningAlert}>{event.warning}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.ownerCard} style={{ marginTop: 14 }}>
          <div className={styles.ownerTop}>
            <div className={styles.ownerIdentity}>
              <div className={styles.ownerAvatar}>
                <Info size={24} />
              </div>
              <div className={styles.ownerInfo}>
                <div className={styles.ownerName}>
                  {nl ? "Aantal eigenaren is niet openbaar" : "Owner count is not public"}
                </div>
                <div className={styles.ownerType}>
                  {nl
                    ? "De RDW publiceert het aantal eigenaren niet in open data. Vraag de verkoper om het overschrijvingsbewijs en het onderhoudsboekje om de eigendomsgeschiedenis te verifiëren."
                    : "The RDW does not publish the number of owners in open data. Ask the seller for transfer proof and the service book to verify ownership history."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PremiumLock>
  );
}
