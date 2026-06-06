"use client";

import Link from "next/link";
import type { ElementType } from "react";
import {
  ArrowUpRight,
  FileCheck2,
  Gauge,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import styles from "./RiskOverviewScreen.module.css";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import { useI18n } from "@/lib/i18n/context";


type Props = {
  plate?: string;
};

function buildPlateHref(plate: string | undefined, suffix = "") {
  if (!plate) return suffix || "/";
  return `/search/${plate}${suffix}`;
}

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
}

type RiskCardTone = "success" | "warning" | "primary";

type RiskCardDef = {
  id: string;
  title: string;
  status: string;
  description: string;
  badge: string;
  trend: string;
  icon: ElementType;
  tone: RiskCardTone;
  link: string;
};

function RiskCard({
  title,
  status,
  description,
  badge,
  trend,
  icon: Icon,
  tone,
  link,
  locale
}: {
  title: string;
  status: string;
  description: string;
  badge: string;
  trend: string;
  icon: ElementType;
  tone: RiskCardTone;
  link: string;
  locale: "nl" | "en";
}) {
  return (
    <Link href={link} className={styles.riskCard}>
      <div className={styles.cardTop}>
        <div className={styles.cardIconStack}>
          <div className={`${styles.riskIconWrapper} ${styles[`icon${tone}`]}`}>
            <Icon size={24} />
          </div>
          <div className={`${styles.cardBadge} ${styles[`badge${tone}`]}`}>{badge}</div>
        </div>
        <div className={styles.riskChevron}>
          <ArrowUpRight size={18} />
        </div>
      </div>
      <div className={styles.riskBody}>
        <div className={styles.riskTitle}>{title}</div>
        <div className={styles.riskStatus}>{status}</div>
        <div className={styles.riskDescription}>{description}</div>
      </div>
      <div className={styles.riskFooter}>
        <div className={styles.trendRow}>
          <span className={`${styles.trendDot} ${styles[`trend${tone}`]}`} />
          <span className={styles.trendText}>{trend}</span>
        </div>
        <div className={styles.viewLink}>{locale === "nl" ? "Open historie" : "Open history"}</div>
      </div>
    </Link>
  );
}

export function RiskOverviewScreen({ plate }: Props) {
  const { locale } = useI18n();
  const { isValid, data, isLoading, isError } = useVehicleLookup(plate ?? "");

  if (!plate || !isValid || isError) {
    return (
      <div className={styles.page}>
        <div className={styles.pageContainer}>
          <div className={styles.contentContainer}>
            <div className={styles.glassPanel}>{locale === "nl" ? "Voertuig niet gevonden." : "Vehicle not found."}</div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className={styles.page}>
        <div className={styles.pageContainer}>
          <div className={styles.contentContainer}>
            <div className={styles.glassPanel}>{locale === "nl" ? "Risico-overzicht laden..." : "Loading risk overview..."}</div>
          </div>
        </div>
      </div>
    );
  }

  const v = data.vehicle;

  const positiveChecks = [
    v.napVerdict && v.napVerdict.toLowerCase().includes("logisch"),
    !v.wok,
    !v.hasOpenRecall
  ].filter(Boolean).length;

  // Trust snapshot computed from the real RDW signals (no hardcoded verdict).
  const nl = locale === "nl";
  const napIllogical = !!v.napVerdict && v.napVerdict.toLowerCase().includes("onlogisch");
  const apkExpired = !!v.apkExpiryDate && new Date(v.apkExpiryDate).getTime() < Date.now();
  const attentionItems = [
    v.hasOpenRecall ? (nl ? "openstaande terugroepactie" : "open recall") : null,
    apkExpired ? (nl ? "verlopen APK" : "expired APK") : null,
    data.defects.length > 3 ? (nl ? `${data.defects.length} defectrecords` : `${data.defects.length} defect records`) : null,
    (v.owners.count ?? 0) > 4 ? (nl ? "veel eigenaren" : "many owners") : null
  ].filter(Boolean) as string[];
  const riskLevel: "low" | "medium" | "high" =
    napIllogical || v.wok ? "high" : attentionItems.length > 0 ? "medium" : "low";
  const riskLabel =
    riskLevel === "high" ? (nl ? "Hoog risico" : "High risk") : riskLevel === "medium" ? (nl ? "Aandachtspunten" : "Needs attention") : (nl ? "Laag risico" : "Low risk");
  const riskColor = riskLevel === "high" ? "#dc2626" : riskLevel === "medium" ? "#d97706" : undefined;
  const riskNote =
    riskLevel === "high"
      ? napIllogical
        ? nl ? "Tellerstand is door RDW als onlogisch gemarkeerd (NAP)." : "Odometer is flagged illogical by RDW (NAP)."
        : nl ? "Registratieblokkade (WOK) actief op dit voertuig." : "Registration block (WOK) active on this vehicle."
      : riskLevel === "medium"
      ? nl ? `Let op: ${attentionItems.join(", ")}.` : `Attention: ${attentionItems.join(", ")}.`
      : nl ? "Geen grote rode vlaggen in de belangrijkste RDW-datasets." : "No major red flags in the key RDW datasets.";
  const nextAction =
    napIllogical || data.enriched?.mileageVerdict === "ONLOGISCH"
      ? nl ? "Open de kilometerhistorie om de tellerstand te controleren." : "Open mileage history to verify the odometer."
      : data.defects.length > 0
      ? nl ? "Open de schadehistorie om de gemelde defecten te bekijken." : "Open damage history to review the reported defects."
      : nl ? "Open de eigendomshistorie om de registratiedatums te bekijken." : "Open ownership history to review the registration dates.";

  const metrics = [
    { label: locale === "nl" ? "Positieve controles" : "Positive checks", value: `${positiveChecks} / 3` },
    { label: locale === "nl" ? "Nadere controle" : "Needs review", value: `${v.wok || v.hasOpenRecall ? 1 : 0} ${locale === "nl" ? "item" : "item"}` },
    { label: locale === "nl" ? "Laatste update" : "Last update", value: data.fromCache ? (locale === "nl" ? "Cache" : "Cached") : "Live" }
  ];

  const resolvedMileageVerdict =
    data.enriched?.mileageVerdict && data.enriched.mileageVerdict !== "UNKNOWN"
      ? data.enriched.mileageVerdict
      : v.napVerdict ?? (locale === "nl" ? "Onbekend" : "Unknown");

  const mileageTone =
    typeof resolvedMileageVerdict === "string" && resolvedMileageVerdict.toLowerCase().includes("logisch")
      ? "success"
      : "warning";

  const riskCards: RiskCardDef[] = [
    {
      id: "mileage",
      title: locale === "nl" ? "Kilometerhistorie" : "Mileage History",
      status: resolvedMileageVerdict,
      description:
        locale === "nl"
          ? "Kilometeroordeel op basis van APK-historie met trendanalyse."
          : "Mileage verdict is derived from APK history with weighted trend detection.",
      badge: resolvedMileageVerdict !== "Unknown" ? (locale === "nl" ? "Geverifieerd" : "Verified") : (locale === "nl" ? "Onbekend" : "Unknown"),
      trend: resolvedMileageVerdict ?? (locale === "nl" ? "Geen oordeel" : "No verdict"),
      icon: Gauge,
      tone: mileageTone,
      link: "/mileage-history"
    },
    {
      id: "damage",
      title: locale === "nl" ? "Schadehistorie" : "Damage History",
      status: data.defects.length === 0 ? (locale === "nl" ? "Geen defecten" : "No defects found") : `${data.defects.length} ${locale === "nl" ? "records" : "records"}`,
      description:
        locale === "nl"
          ? "Defecten gemeld tijdens keuringen. Open voor details."
          : "Defect records reported during inspections. Expand for details.",
      badge: data.defects.length === 0 ? (locale === "nl" ? "Schoon" : "Clear") : (locale === "nl" ? "Controleren" : "Review"),
      trend: data.defects.length === 0 ? (locale === "nl" ? "Schoon dossier" : "Clean record") : (locale === "nl" ? "Controleer defecten" : "Check defects"),
      icon: ShieldCheck,
      tone: data.defects.length === 0 ? "success" : "warning",
      link: "/damage-history"
    },
    {
      id: "ownership",
      title: locale === "nl" ? "Eigendom" : "Ownership",
      status: v.owners.count ? `${v.owners.count} ${locale === "nl" ? "tenaamstellingen" : "registrations"}` : (locale === "nl" ? "Zie registratiedatums" : "See registration dates"),
      description:
        locale === "nl"
          ? "RDW-opendata toont registratiedatums (incl. huidige eigenaar sinds); het aantal houders is niet altijd beschikbaar."
          : "RDW open data shows registration dates (incl. current owner since); keeper count isn't always available.",
      badge: v.owners.count && v.owners.count > 2 ? (locale === "nl" ? "Controleren" : "Review") : (locale === "nl" ? "Stabiel" : "Stable"),
      trend: v.owners.count ? (locale === "nl" ? "Overdrachtsdatums" : "Transfer dates") : (locale === "nl" ? "Geen data" : "No data"),
      icon: Users,
      tone: v.owners.count && v.owners.count > 2 ? "warning" : "success",
      link: "/ownership-history"
    },
    {
      id: "apk",
      title: locale === "nl" ? "APK-keuring" : "APK Inspection",
      status: v.apkExpiryDate
        ? `${locale === "nl" ? "Geldig tot" : "Valid until"} ${formatDate(v.apkExpiryDate)}`
        : (locale === "nl" ? "Onbekend" : "Unknown"),
      description:
        locale === "nl"
          ? "Geldigheid en keuringsevents uit RDW APK-records."
          : "Inspection validity and event history from RDW APK records.",
      badge: v.apkExpiryDate ? (locale === "nl" ? "Actueel" : "Current") : (locale === "nl" ? "Onbekend" : "Unknown"),
      trend: v.apkExpiryDate ? (locale === "nl" ? "APK actief" : "Inspection active") : (locale === "nl" ? "Ontbreekt" : "Missing"),
      icon: FileCheck2,
      tone: v.apkExpiryDate ? "primary" : "warning",
      link: "/inspection-timeline"
    }
  ];

  const resolvedCards = riskCards.map((card) => ({
    ...card,
    link: buildPlateHref(plate, card.link)
  }));

  return (
    <div className={styles.page}>
      <div className={styles.pageContainer}>
        <div className={styles.contentContainer}>
          <VehicleNavBar plate={plate} subtitle={locale === "nl" ? "Risico-overzicht" : "Risk overview"} />

          <PremiumLock featureName={locale === "nl" ? "Risico-overzicht" : "Risk Overview"} isLocked={true} plate={plate} sectionKey="riskOverview">
            <div className={`${styles.heroPanel} ${styles.glassPanel}`}>
              <div className={styles.heroCopy}>
                <div className={styles.eyebrow}>
                  <Sparkles size={14} /> {locale === "nl" ? "Slim risico-overzicht" : "Smart risk summary"}
                </div>
                <div className={styles.heroTitle}>{locale === "nl" ? "Begrijp het voertuig in seconden" : "Understand the vehicle in seconds"}</div>
                <div className={styles.heroSubtitle}>
                  {locale === "nl"
                    ? "Elke kaart toont een kerncontrole met status, context en een directe route naar detailhistorie."
                    : "Each card highlights a core checkpoint with status signals, supportive context, and a clear path into the detailed history."}
                </div>
                <div className={styles.heroMetrics}>
                  {metrics.map((metric) => (
                    <div key={metric.label} className={styles.metricChip}>
                      <div className={styles.metricLabel}>{metric.label}</div>
                      <div className={styles.metricValue}>{metric.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.heroSide}>
                <div className={styles.spotlightCard}>
                  <div className={styles.spotlightLabel}>{locale === "nl" ? "Vertrouwenssnapshot" : "Vehicle trust snapshot"}</div>
                  <div className={styles.spotlightValue} style={{ color: riskColor }}>{riskLabel}</div>
                  <div className={styles.spotlightNote}>{riskNote}</div>
                </div>
                <div className={styles.spotlightCard}>
                  <div className={styles.spotlightLabel}>{locale === "nl" ? "Beste vervolgstap" : "Next best action"}</div>
                  <div className={styles.spotlightNote}>{nextAction}</div>
                </div>
              </div>
            </div>

            <div className={`${styles.riskSection} ${styles.glassPanel}`}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionCopy}>
                  <div className={styles.sectionTitle}>{locale === "nl" ? "Risico-overzicht" : "Risk Overview"}</div>
                  <div className={styles.sectionSubtitle}>
                    {locale === "nl"
                      ? "Een kaartgerichte weergave met sterke scanbaarheid, duidelijke signalen en snelle doorkliks naar details."
                      : "A more modern, card-first overview with stronger emphasis on scanability, confidence signals, and click targets for deeper inspection."}
                  </div>
                </div>
                <button className={styles.sectionAction} type="button">
                  <LayoutGrid size={16} /> {locale === "nl" ? "Overzichtsmodus" : "Overview mode"}
                </button>
              </div>

              <div className={styles.riskGrid}>
                {resolvedCards.map((card) => (
                  <RiskCard key={card.id} {...card} locale={locale} />
                ))}
              </div>
            </div>
          </PremiumLock>

        </div>
      </div>
    </div>
  );
}

