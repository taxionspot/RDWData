"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Lock,
  Radar,
  Scale,
  Unlock
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { formatDisplayPlate } from "@/lib/rdw/normalize";
import {
  hasPaidAccessForPlate,
  ensurePaidAccessChecked,
  onPlateAccessChanged
} from "@/lib/payments/access";
import type { PublicSiteSettings } from "@/lib/site-settings/defaults";
import { SubscriptionModal } from "@/components/ui/SubscriptionModal";
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary";
import { isSamplePlate } from "@/lib/sample";
import { track } from "@/lib/analytics";
import { ScanIntro } from "./ScanIntro";
import { AiAnalysisScreen } from "./AiAnalysisScreen";
import { VehicleResultScreen } from "./VehicleResultScreen";
import { RiskOverviewScreen } from "./RiskOverviewScreen";
import { MarketAnalysisScreen } from "./MarketAnalysisScreen";
import { InspectionTimelineScreen } from "./InspectionTimelineScreen";
import { MileageTimelineScreen } from "./MileageTimelineScreen";
import { DamageHistoryScreen } from "./DamageHistoryScreen";
import { OwnershipTimelineScreen } from "./OwnershipTimelineScreen";
import { ApkFailureIntelligenceScreen } from "./ApkFailureIntelligenceScreen";
import { TechnicalSpecsScreen } from "./TechnicalSpecsScreen";
import { ReportSectionNav } from "./ReportSectionNav";
import { TrustBadges } from "./TrustBadges";
import { ComparableListings } from "./ComparableListings";
import { JudgmentBlock } from "./JudgmentBlock";
import { GROUPS } from "@/lib/vehicle/groups";
import styles from "./FullReportScreen.module.css";

type Props = { plate: string };

type SectionDef = {
  id: string;
  labelNl: string;
  labelEn: string;
  subNl: string;
  subEn: string;
  lockKey: keyof PublicSiteSettings["lockSections"] | null;
};

const SECTIONS: SectionDef[] = [
  {
    id: "overzicht",
    labelNl: "Overzicht",
    labelEn: "Overview",
    subNl: "Identiteit, score en kerngegevens",
    subEn: "Identity, score and key data",
    lockKey: null
  },
  {
    id: "ai-analyse",
    labelNl: "Samenvatting & advies",
    labelEn: "Summary & advice",
    subNl: "Alle bevindingen samengevat in gewone taal",
    subEn: "All findings summarised in plain language",
    lockKey: "riskOverview"
  },
  {
    id: "markt",
    labelNl: "Marktwaarde",
    labelEn: "Market value",
    subNl: "Waarde, vraagprijs-check en vaste lasten",
    subEn: "Value, asking-price check and running costs",
    lockKey: "marketAnalysis"
  },
  {
    id: "te-koop",
    labelNl: "Vergelijkbare auto's te koop",
    labelEn: "Comparable cars for sale",
    subNl: "Dezelfde auto en alternatieven op de grote verkoopsites",
    subEn: "The same car and alternatives on the big marketplaces",
    lockKey: "marketAnalysis"
  },
  {
    id: "kilometerstand",
    labelNl: "Kilometerstand",
    labelEn: "Mileage",
    subNl: "NAP-oordeel en tellertrend",
    subEn: "NAP verdict and odometer trend",
    lockKey: "mileageHistory"
  },
  {
    id: "apk",
    labelNl: "APK-historie",
    labelEn: "APK history",
    subNl: "Alle keuringen en geconstateerde gebreken",
    subEn: "All inspections and recorded defects",
    lockKey: "inspectionTimeline"
  },
  {
    id: "risico",
    labelNl: "Risico's",
    labelEn: "Risks",
    subNl: "De vier kerncontroles in één blik",
    subEn: "The four core checks at a glance",
    lockKey: "riskOverview"
  },
  {
    id: "schade",
    labelNl: "Schadesignalen",
    labelEn: "Damage signals",
    subNl: "Officiële signalen uit keuringen en registraties",
    subEn: "Official signals from inspections and registrations",
    lockKey: "damageHistory"
  },
  {
    id: "eigendom",
    labelNl: "Eigendom",
    labelEn: "Ownership",
    subNl: "Registratie, overdracht en status",
    subEn: "Registration, transfer and status",
    lockKey: "ownershipHistory"
  },
  {
    id: "apk-intelligence",
    labelNl: "APK-inzichten",
    labelEn: "APK insights",
    subNl: "Terugkerende gebreken en slaagkans",
    subEn: "Recurring defects and pass probability",
    lockKey: "riskOverview"
  },
  {
    id: "specs",
    labelNl: "Technische specs",
    labelEn: "Tech specs",
    subNl: "Volledige fabrieksgegevens uit het RDW-register",
    subEn: "Full factory data from the RDW register",
    lockKey: "technicalSpecs"
  },
  {
    id: "acties",
    labelNl: "Volgende stappen",
    labelEn: "Next steps",
    subNl: "Vergelijken, volgen en downloaden",
    subEn: "Compare, watch and download",
    lockKey: null
  }
];

function usePlateUnlocked(plate: string, paymentEnabled: boolean) {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!plate) return;
    setUnlocked(hasPaidAccessForPlate(plate));
    void ensurePaidAccessChecked(plate).then((paid) => {
      if (paid) setUnlocked(true);
    });
    return onPlateAccessChanged(plate, (paid) => setUnlocked(paid));
  }, [plate]);

  return unlocked || !paymentEnabled || isSamplePlate(plate);
}

/* ── "Records found" banner ─────────────────────────────────────────── */
function RecordsSummary({
  plate,
  unlocked,
  priceLabel,
  onUnlockClick
}: {
  plate: string;
  unlocked: boolean;
  priceLabel: string;
  onUnlockClick: () => void;
}) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const { data } = useVehicleLookup(plate);

  const counts = useMemo(() => {
    const inspections = Array.isArray(data?.inspections) ? data!.inspections.length : 0;
    const defects = Array.isArray(data?.defects) ? data!.defects.length : 0;
    const recalls = Array.isArray(data?.recalls) ? data!.recalls.length : 0;
    const baseFields = 28; // core register fields always checked
    return {
      inspections,
      defects,
      recalls,
      datapoints: baseFields + inspections * 3 + defects + recalls
    };
  }, [data]);

  const findings = useMemo(() => {
    const list: Array<{ label: string; tone: "ok" | "warn" | "danger" }> = [];
    const v = data?.vehicle;
    if (!v) return list;

    if (v.wok) {
      list.push({ label: nl ? "WOK-registratie" : "Salvage (WOK) flag", tone: "danger" });
    } else {
      list.push({ label: nl ? "Geen WOK" : "No salvage flag", tone: "ok" });
    }

    const nap = (v.napVerdict ?? "").toLowerCase();
    if (nap.includes("onlogisch")) {
      list.push({ label: nl ? "NAP: onlogisch" : "NAP: illogical", tone: "danger" });
    } else if (nap.includes("logisch")) {
      list.push({ label: nl ? "NAP: logisch" : "NAP: logical", tone: "ok" });
    }

    if (v.hasOpenRecall) {
      list.push({ label: nl ? "Open terugroepactie" : "Open recall", tone: "warn" });
    }
    if (counts.defects > 0) {
      list.push({
        label: nl ? `${counts.defects} gebreken geregistreerd` : `${counts.defects} recorded defects`,
        tone: "warn"
      });
    }
    if (data?.enriched?.isImported) {
      list.push({ label: nl ? "Importvoertuig" : "Imported vehicle", tone: "warn" });
    }
    return list.slice(0, 5);
  }, [data, counts.defects, nl]);

  const attentionCount = findings.filter((finding) => finding.tone !== "ok").length;

  return (
    <div className={styles.summary}>
      <div className={styles.summaryCopy}>
        <span className={styles.summaryEyebrow}>
          <Radar size={13} />
          {nl ? "Scan voltooid" : "Scan complete"} · {formatDisplayPlate(plate)}
        </span>
        <div className={styles.summaryTitle}>
          {nl ? (
            <>
              Wij vonden <strong>{counts.datapoints} datapunten</strong>
              {attentionCount > 0 ? (
                <>
                  {" "}waarvan <strong>{attentionCount} {attentionCount === 1 ? "bevinding" : "bevindingen"}</strong> die je
                  moet zien
                </>
              ) : (
                <> zonder grote rode vlaggen</>
              )}
            </>
          ) : (
            <>
              We found <strong>{counts.datapoints} data points</strong>
              {attentionCount > 0 ? (
                <>
                  {" "}including <strong>{attentionCount} {attentionCount === 1 ? "finding" : "findings"}</strong> you should
                  see
                </>
              ) : (
                <> with no major red flags</>
              )}
            </>
          )}
        </div>
        <div className={styles.summaryChips}>
          <span className={styles.summaryChip}>
            {counts.inspections} {nl ? "APK-keuringen" : "APK inspections"}
          </span>
          <span className={styles.summaryChip}>
            {counts.defects} {nl ? "gebrekrecords" : "defect records"}
          </span>
          <span className={styles.summaryChip}>
            {counts.recalls} {nl ? "terugroepacties" : "recalls"}
          </span>
          {findings.map((finding) => (
            <span
              key={finding.label}
              className={`${styles.summaryChip} ${
                finding.tone === "danger"
                  ? styles.summaryChipDanger
                  : finding.tone === "warn"
                  ? styles.summaryChipWarn
                  : styles.summaryChipOk
              }`}
            >
              {finding.tone === "ok" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {finding.label}
            </span>
          ))}
        </div>
        {!unlocked ? (
          <p className={styles.summaryHint}>
            {nl
              ? "Hieronder zie je van elk onderdeel een voorproefje. Ontgrendel eenmalig om de volledige analyse, marktwaarde en historie te zien."
              : "Below you get a preview of every section. Unlock once to see the full analysis, market value and history."}
          </p>
        ) : null}
      </div>

      <div className={styles.summaryAction}>
        {unlocked ? (
          <span className={styles.unlockedBadge}>
            <Unlock size={16} />
            {nl ? "Volledig rapport ontgrendeld" : "Full report unlocked"}
          </span>
        ) : (
          <>
            <button type="button" className={styles.unlockBtn} onClick={onUnlockClick}>
              <Unlock size={16} />
              {nl ? `Ontgrendel alles · ${priceLabel}` : `Unlock everything · ${priceLabel}`}
            </button>
            <span className={styles.unlockMicro}>
              {nl
                ? "Eenmalig voor dit kenteken · iDEAL, Apple Pay, Google Pay, PayPal · direct toegang"
                : "One-time for this plate · iDEAL, Apple Pay, Google Pay, PayPal · instant access"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Section wrapper with numbered header ───────────────────────────── */
function SectionBlock({
  section,
  index,
  isPremium,
  locale,
  children
}: {
  section: SectionDef;
  index: number;
  isPremium: boolean;
  locale: "nl" | "en";
  children: React.ReactNode;
}) {
  const nl = locale === "nl";
  return (
    <section id={section.id} className={styles.sectionBlock}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionIndex}>{String(index).padStart(2, "0")}</span>
        <div className={styles.sectionMeta}>
          <span className={styles.sectionTitle}>
            {nl ? section.labelNl : section.labelEn}
            {section.lockKey ? (
              isPremium ? (
                <span className={`${styles.sectionChip} ${styles.sectionChipPremium}`}>
                  <Lock size={9} /> Premium
                </span>
              ) : (
                <span className={`${styles.sectionChip} ${styles.sectionChipFree}`}>{nl ? "Inbegrepen" : "Included"}</span>
              )
            ) : (
              <span className={`${styles.sectionChip} ${styles.sectionChipFree}`}>{nl ? "Gratis" : "Free"}</span>
            )}
          </span>
          <span className={styles.sectionSub}>{nl ? section.subNl : section.subEn}</span>
        </div>
      </div>
      <SectionErrorBoundary label={section.id}>{children}</SectionErrorBoundary>
    </section>
  );
}

/* ── Full single-scroll report ──────────────────────────────────────── */
export function FullReportScreen({ plate }: Props) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const { settings } = useSiteSettings();
  const searchParams = useSearchParams();
  const { normalized, isValid } = useVehicleLookup(plate);
  const [showPayment, setShowPayment] = useState(false);

  const unlocked = usePlateUnlocked(normalized, settings.paymentEnabled);
  const priceLabel = `€ ${settings.payment.amount}`;

  useEffect(() => {
    if (isValid && normalized) track("report_viewed", { sample: isSamplePlate(normalized) });
  }, [isValid, normalized]);

  const isPremiumSection = (section: SectionDef) => {
    if (!section.lockKey) return false;
    if (!settings.paymentEnabled) return false;
    if (unlocked) return false;
    return settings.lockSections[section.lockKey];
  };

  if (!isValid) {
    return (
      <div className={styles.page}>
        <div className={styles.statePanel}>{nl ? "Ongeldig kenteken." : "Invalid license plate."}</div>
      </div>
    );
  }

  const sharedQuery = searchParams?.toString();
  const withQuery = (href: string) => (sharedQuery ? `${href}?${sharedQuery}` : href);
  const sectionById = (id: string): SectionDef => SECTIONS.find((section) => section.id === id) ?? SECTIONS[0];
  const sectionIndex = (id: string): number => {
    const i = SECTIONS.findIndex((section) => section.id === id);
    return i >= 0 ? i + 1 : 1;
  };

  const navItems = SECTIONS.map((section) => ({
    id: section.id,
    label: nl ? section.labelNl : section.labelEn,
    locked: isPremiumSection(section)
  }));

  // Phase 1 temporary jump: the group accordion lands in Phase 2, so map a
  // group id to its first section id (which exists in the current layout) and
  // scroll there. Phase 2 will open the group then scroll its header.
  const jumpToGroup = (groupId: string) => {
    const group = GROUPS.find((g) => g.id === groupId);
    const targetId = group?.sectionIds[0] ?? groupId;
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.page}>
      <ScanIntro plate={normalized} />

      <div className={styles.container}>
        <JudgmentBlock plate={normalized} locale={locale} onJump={jumpToGroup} />

        <ReportSectionNav items={navItems} />

        <SectionBlock section={sectionById("overzicht")} index={sectionIndex("overzicht")} isPremium={false} locale={locale}>
          <VehicleResultScreen plate={plate} embedded />
        </SectionBlock>

        <SectionBlock section={sectionById("ai-analyse")} index={sectionIndex("ai-analyse")} isPremium={isPremiumSection(sectionById("ai-analyse"))} locale={locale}>
          <AiAnalysisScreen plate={normalized} />
        </SectionBlock>

        <SectionErrorBoundary label="records-summary">
          <RecordsSummary
            plate={normalized}
            unlocked={unlocked}
            priceLabel={priceLabel}
            onUnlockClick={() => setShowPayment(true)}
          />
        </SectionErrorBoundary>

        <SectionErrorBoundary label="trust-badges">
          <TrustBadges plate={normalized} />
        </SectionErrorBoundary>

        <SectionBlock section={sectionById("markt")} index={sectionIndex("markt")} isPremium={isPremiumSection(sectionById("markt"))} locale={locale}>
          <MarketAnalysisScreen plate={normalized} embedded />
        </SectionBlock>

        <SectionBlock section={sectionById("te-koop")} index={sectionIndex("te-koop")} isPremium={isPremiumSection(sectionById("te-koop"))} locale={locale}>
          <ComparableListings plate={normalized} />
        </SectionBlock>

        <SectionBlock section={sectionById("kilometerstand")} index={sectionIndex("kilometerstand")} isPremium={isPremiumSection(sectionById("kilometerstand"))} locale={locale}>
          <MileageTimelineScreen plate={normalized} embedded />
        </SectionBlock>

        <SectionBlock section={sectionById("apk")} index={sectionIndex("apk")} isPremium={isPremiumSection(sectionById("apk"))} locale={locale}>
          <InspectionTimelineScreen plate={normalized} embedded />
        </SectionBlock>

        <SectionBlock section={sectionById("risico")} index={sectionIndex("risico")} isPremium={isPremiumSection(sectionById("risico"))} locale={locale}>
          <RiskOverviewScreen plate={normalized} embedded />
        </SectionBlock>

        <SectionBlock section={sectionById("schade")} index={sectionIndex("schade")} isPremium={isPremiumSection(sectionById("schade"))} locale={locale}>
          <DamageHistoryScreen plate={normalized} embedded />
        </SectionBlock>

        <SectionBlock section={sectionById("eigendom")} index={sectionIndex("eigendom")} isPremium={isPremiumSection(sectionById("eigendom"))} locale={locale}>
          <OwnershipTimelineScreen plate={normalized} embedded />
        </SectionBlock>

        <SectionBlock section={sectionById("apk-intelligence")} index={sectionIndex("apk-intelligence")} isPremium={isPremiumSection(sectionById("apk-intelligence"))} locale={locale}>
          <ApkFailureIntelligenceScreen plate={normalized} embedded />
        </SectionBlock>

        <SectionBlock section={sectionById("specs")} index={sectionIndex("specs")} isPremium={isPremiumSection(sectionById("specs"))} locale={locale}>
          <TechnicalSpecsScreen plate={normalized} embedded />
        </SectionBlock>

        <SectionBlock section={sectionById("acties")} index={sectionIndex("acties")} isPremium={false} locale={locale}>
          <div className={styles.actionsGrid}>
            <Link href={withQuery(`/search/${normalized}/vehicle-comparison`)} className={styles.actionCard}>
              <span className={styles.actionIcon}>
                <Scale size={22} />
              </span>
              <span className={styles.actionCopy}>
                <span className={styles.actionTitle}>{nl ? "Vergelijk met een tweede auto" : "Compare with a second car"}</span>
                <span className={styles.actionDesc}>
                  {nl
                    ? "Zet dit kenteken naast een andere kandidaat over 30+ datapunten, met een duidelijk oordeel."
                    : "Put this plate next to another candidate across 30+ data points, with a clear verdict."}
                </span>
              </span>
              <ChevronRight size={18} className={styles.actionChevron} />
            </Link>
            <Link href={withQuery(`/search/${normalized}/post-purchase-watch`)} className={styles.actionCard}>
              <span className={styles.actionIcon}>
                <BellRing size={22} />
              </span>
              <span className={styles.actionCopy}>
                <span className={styles.actionTitle}>{nl ? "Volg dit kenteken (watch mode)" : "Watch this plate"}</span>
                <span className={styles.actionDesc}>
                  {nl
                    ? "Ontvang een melding bij nieuwe terugroepacties, APK-wijzigingen of risicoverschuivingen."
                    : "Get notified on new recalls, APK changes or risk shifts."}
                </span>
              </span>
              <ChevronRight size={18} className={styles.actionChevron} />
            </Link>
          </div>
        </SectionBlock>
      </div>

      {/* Sticky mobile unlock bar */}
      {!unlocked && settings.paymentEnabled ? (
        <div className={styles.stickyBar}>
          <div className={styles.stickyCopy}>
            <span className={styles.stickyTitle}>
              {nl ? `Volledig rapport · ${priceLabel}` : `Full report · ${priceLabel}`}
            </span>
            <span className={styles.stickySub}>
              {nl ? "Eenmalig voor dit kenteken" : "One-time for this plate"}
            </span>
          </div>
          <button type="button" className={styles.stickyBtn} onClick={() => setShowPayment(true)}>
            {nl ? "Ontgrendel" : "Unlock"}
            <ArrowRight size={15} />
          </button>
        </div>
      ) : null}

      <SubscriptionModal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        featureName={nl ? "het volledige rapport" : "the full report"}
        plate={normalized}
        onUnlocked={() => setShowPayment(false)}
      />
    </div>
  );
}
