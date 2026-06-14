"use client";

import { useMemo } from "react";
import { AlertTriangle, Car, Gauge, Leaf, ShieldAlert, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import styles from "./TrustBadges.module.css";

type Tone = "ok" | "warn" | "danger";
type Badge = { key: string; tone: Tone; icon: "gauge" | "recall-ok" | "recall-bad" | "leaf" | "import" | "taxi"; title: string; sub: string };

/** Parse the Euro emission class number from RDW's "EURO 5 F" style string. */
function euroClass(emissionStandard: string | null | undefined): number | null {
  if (!emissionStandard) return null;
  const m = /euro\s*([0-9])/i.exec(emissionStandard);
  return m ? Number(m[1]) : null;
}

const ICONS = {
  gauge: Gauge,
  "recall-ok": ShieldCheck,
  "recall-bad": ShieldAlert,
  leaf: Leaf,
  import: AlertTriangle,
  taxi: Car
} as const;

/**
 * Prominent, free trust signals shown right under the scan summary: the three
 * things NL used-car buyers care about most (odometer/NAP fraud, open recalls,
 * low-emission-zone access), plus import/taxi flags. All from free RDW base data,
 * so they render before the paywall too. Honest: only claims what RDW actually says.
 */
export function TrustBadges({ plate }: { plate: string }) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const { data } = useVehicleLookup(plate);
  const v = data?.vehicle;

  const badges = useMemo<Badge[]>(() => {
    if (!v) return [];
    const list: Badge[] = [];

    // Odometer / NAP verdict
    const nap = (v.napVerdict ?? "").toLowerCase();
    if (nap.includes("onlogisch")) {
      list.push({
        key: "nap",
        tone: "danger",
        icon: "gauge",
        title: nl ? "Tellerstand onlogisch" : "Odometer illogical",
        sub: nl ? "NAP wijst op een mogelijk teruggedraaide teller" : "NAP flags a possible rollback"
      });
    } else if (nap.includes("logisch")) {
      list.push({
        key: "nap",
        tone: "ok",
        icon: "gauge",
        title: nl ? "Tellerstand logisch" : "Odometer logical",
        sub: nl ? "NAP-registraties lopen logisch op" : "NAP readings rise logically"
      });
    }

    // Open recall
    if (v.hasOpenRecall) {
      list.push({
        key: "recall",
        tone: "danger",
        icon: "recall-bad",
        title: nl ? "Open terugroepactie" : "Open recall",
        sub: nl ? "Niet-uitgevoerde fabrieksterugroep, laat dit nakijken" : "Unresolved manufacturer recall, have it checked"
      });
    } else {
      list.push({
        key: "recall",
        tone: "ok",
        icon: "recall-ok",
        title: nl ? "Geen open terugroepactie" : "No open recall",
        sub: nl ? "Geen openstaande fabrieksterugroep bekend" : "No outstanding manufacturer recall"
      });
    }

    // Low-emission zone (milieuzone): the national rule bars diesel Euro 3 and
    // older from most NL zones. Other fuels / Euro 4+ are currently allowed.
    const ec = euroClass(v.emissionStandard);
    const isDiesel = (v.fuelType ?? "").toLowerCase().includes("diesel");
    if (isDiesel && ec !== null && ec <= 3) {
      list.push({
        key: "lez",
        tone: "warn",
        icon: "leaf",
        title: nl ? `Milieuzone: diesel Euro ${ec}` : `Low-emission zone: diesel Euro ${ec}`,
        sub: nl
          ? "Diesels Euro 3 en ouder worden uit de meeste milieuzones geweerd"
          : "Diesel Euro 3 and older are barred from most low-emission zones"
      });
    } else if (ec !== null) {
      list.push({
        key: "lez",
        tone: "ok",
        icon: "leaf",
        title: nl ? "Milieuzone: toegestaan" : "Low-emission zone: allowed",
        sub: nl ? `Emissieklasse Euro ${ec}, geen milieuzone-beperking bekend` : `Euro ${ec}, no known zone restriction`
      });
    }

    // Import
    if (data?.enriched?.isImported) {
      list.push({
        key: "import",
        tone: "warn",
        icon: "import",
        title: nl ? "Importvoertuig" : "Imported vehicle",
        sub: nl ? "Eerst in het buitenland toegelaten, controleer de historie" : "First registered abroad, check the history"
      });
    }

    // Taxi history
    if (v.isTaxi) {
      list.push({
        key: "taxi",
        tone: "warn",
        icon: "taxi",
        title: nl ? "Taxi-verleden" : "Taxi history",
        sub: nl ? "Geregistreerd (geweest) als taxi, vaak hoge kilometrage" : "Registered as a taxi, often high mileage"
      });
    }

    return list;
  }, [v, data?.enriched?.isImported, nl]);

  if (!v || badges.length === 0) return null;

  return (
    <div className={styles.row} aria-label={nl ? "Belangrijkste controles" : "Key checks"}>
      {badges.map((b) => {
        const Icon = ICONS[b.icon];
        return (
          <div key={b.key} className={`${styles.badge} ${styles[b.tone]}`}>
            <span className={styles.icon}>
              <Icon size={18} />
            </span>
            <span className={styles.text}>
              <span className={styles.title}>{b.title}</span>
              <span className={styles.sub}>{b.sub}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
