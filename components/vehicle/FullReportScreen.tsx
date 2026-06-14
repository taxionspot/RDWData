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
import { GROUPS, type GroupDef, type GroupId, type ReportSectionId } from "@/lib/vehicle/groups";
import type { GroupStatus } from "@/lib/vehicle/signals";
import { SubscriptionModal } from "@/components/ui/SubscriptionModal";
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary";
import { isSamplePlate } from "@/lib/sample";
import { track } from "@/lib/analytics";
import { ScanIntro } from "./ScanIntro";
import { JudgmentBlock } from "./JudgmentBlock";
import { AiAnalysisScreen } from "./AiAnalysisScreen";
import { VehicleResultScreen } from "./VehicleResultScreen";
import { MarketAnalysisScreen } from "./MarketAnalysisScreen";
import { InspectionTimelineScreen } from "./InspectionTimelineScreen";
import { MileageTimelineScreen } from "./MileageTimelineScreen";
import { DamageHistoryScreen } from "./DamageHistoryScreen";
import { OwnershipTimelineScreen } from "./OwnershipTimelineScreen";
import { ApkFailureIntelligenceScreen } from "./ApkFailureIntelligenceScreen";
import { TechnicalSpecsScreen } from "./TechnicalSpecsScreen";
import { ReportGroup } from "./ReportGroup";
import { ReportSectionNav } from "./ReportSectionNav";
import { TrustBadges } from "./TrustBadges";
import { ComparableListings } from "./ComparableListings";
import styles from "./FullReportScreen.module.css";

type Props = { plate: string };

type SectionEntry = {
  component: (plate: string) => React.ReactNode;
  lockKey: keyof PublicSiteSettings["lockSections"] | null;
  labelNl: string;
  labelEn: string;
};

/**
 * Registry of every report section. Layout is driven by GROUPS
 * (lib/vehicle/groups.ts); this map only says HOW to render each sectionId.
 * Each screen self-gates with its own PremiumLock (sectionKey), so we do NOT
 * wrap a second PremiumLock here. The "risico" section (RiskOverviewScreen) is
 * intentionally absent: its BLUF role moved to JudgmentBlock.
 */
const SECTIONS: Record<ReportSectionId, SectionEntry> = {
  overzicht: {
    component: (plate) => <VehicleResultScreen plate={plate} embedded />,
    lockKey: null,
    labelNl: "Overzicht",
    labelEn: "Overview"
  },
  "ai-analyse": {
    component: (plate) => <AiAnalysisScreen plate={plate} embedded />,
    lockKey: "riskOverview",
    labelNl: "Samenvatting & advies",
    labelEn: "Summary & advice"
  },
  markt: {
    component: (plate) => <MarketAnalysisScreen plate={plate} embedded />,
    lockKey: "marketAnalysis",
    labelNl: "Marktwaarde",
    labelEn: "Market value"
  },
  "te-koop": {
    component: (plate) => <ComparableListings plate={plate} />,
    lockKey: "marketAnalysis",
    labelNl: "Vergelijkbare auto's te koop",
    labelEn: "Comparable cars for sale"
  },
  kilometerstand: {
    component: (plate) => <MileageTimelineScreen plate={plate} embedded />,
    lockKey: "mileageHistory",
    labelNl: "Kilometerstand",
    labelEn: "Mileage"
  },
  apk: {
    component: (plate) => <InspectionTimelineScreen plate={plate} embedded />,
    lockKey: "inspectionTimeline",
    labelNl: "APK-historie",
    labelEn: "APK history"
  },
  risico: {
    component: () => null,
    lockKey: null,
    labelNl: "Risico's",
    labelEn: "Risks"
  },
  schade: {
    component: (plate) => <DamageHistoryScreen plate={plate} embedded />,
    lockKey: "damageHistory",
    labelNl: "Schadesignalen",
    labelEn: "Damage signals"
  },
  eigendom: {
    component: (plate) => <OwnershipTimelineScreen plate={plate} embedded />,
    lockKey: "ownershipHistory",
    labelNl: "Eigendom",
    labelEn: "Ownership"
  },
  "apk-intelligence": {
    component: (plate) => <ApkFailureIntelligenceScreen plate={plate} embedded />,
    lockKey: "riskOverview",
    labelNl: "APK-inzichten",
    labelEn: "APK insights"
  },
  specs: {
    component: (plate) => <TechnicalSpecsScreen plate={plate} embedded />,
    lockKey: "technicalSpecs",
    labelNl: "Technische specs",
    labelEn: "Tech specs"
  },
  acties: {
    component: () => null,
    lockKey: null,
    labelNl: "Volgende stappen",
    labelEn: "Next steps"
  }
};

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

/* ── Full single-scroll report ──────────────────────────────────────── */
export function FullReportScreen({ plate }: Props) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const { settings } = useSiteSettings();
  const searchParams = useSearchParams();
  const { normalized, isValid, data } = useVehicleLookup(plate);
  const [showPayment, setShowPayment] = useState(false);

  const unlocked = usePlateUnlocked(normalized, settings.paymentEnabled);
  const priceLabel = `€ ${settings.payment.amount}`;

  const [openGroups, setOpenGroups] = useState<Record<GroupId, boolean>>(() => {
    const seed = {} as Record<GroupId, boolean>;
    for (const group of GROUPS) seed[group.id] = group.defaultOpen;
    return seed;
  });

  useEffect(() => {
    if (isValid && normalized) track("report_viewed", { sample: isSamplePlate(normalized) });
  }, [isValid, normalized]);

  const isPremiumGroup = (group: GroupDef): boolean => {
    if (!group.lockKey) return false;
    if (!settings.paymentEnabled) return false;
    if (unlocked) return false;
    return settings.lockSections[group.lockKey];
  };

  const groupStatus = (group: GroupDef): GroupStatus => {
    const fromSignals = data?.signals?.groupStatus?.[group.id];
    if (fromSignals) return fromSignals;
    return {
      tone: "ok",
      labelNl: "Gegevens beschikbaar",
      labelEn: "Data available"
    };
  };

  const toggleGroup = (id: GroupId) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allOpen = GROUPS.every((group) => openGroups[group.id]);

  const expandAll = () => {
    const next = {} as Record<GroupId, boolean>;
    const target = !allOpen;
    for (const group of GROUPS) next[group.id] = target;
    setOpenGroups(next);
  };

  const jumpToGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id as GroupId]: true }));
    // Open state flips on the next render; defer the scroll one frame so the
    // header is settled (it is always in the DOM, so this is just polish).
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

  const navItems = GROUPS.map((group) => ({
    id: group.id as string,
    label: nl ? group.labelNl : group.labelEn,
    locked: isPremiumGroup(group)
  }));

  return (
    <div className={styles.page}>
      <ScanIntro plate={normalized} />

      <div className={styles.container}>
        <ReportSectionNav
          items={navItems}
          onJump={jumpToGroup}
          onExpandAll={expandAll}
          allOpen={allOpen}
        />

        <SectionErrorBoundary label="judgment-block">
          <JudgmentBlock plate={normalized} locale={locale} onJump={jumpToGroup} />
        </SectionErrorBoundary>

        {/* Phase 3 swaps RecordsSummary for ReportTeaser. */}
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

        {GROUPS.map((group, idx) => (
          <ReportGroup
            key={group.id}
            group={group}
            index={idx + 1}
            status={groupStatus(group)}
            isPremium={isPremiumGroup(group)}
            open={openGroups[group.id]}
            onToggle={toggleGroup}
            locale={locale}
          >
            {group.sectionIds.map((sectionId) => (
              <div key={sectionId}>{SECTIONS[sectionId].component(normalized)}</div>
            ))}
          </ReportGroup>
        ))}

        <SectionErrorBoundary label="acties">
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
        </SectionErrorBoundary>
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
