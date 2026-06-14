"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BellRing,
  ChevronRight,
  Scale
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import {
  hasPaidAccessForPlate,
  ensurePaidAccessChecked,
  onPlateAccessChanged
} from "@/lib/payments/access";
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
import { ReportTeaser } from "./ReportTeaser";
import { TrustBadges } from "./TrustBadges";
import { ComparableListings } from "./ComparableListings";
import styles from "./FullReportScreen.module.css";

type Props = { plate: string };

type SectionEntry = {
  component: (plate: string) => React.ReactNode;
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
    component: (plate) => <VehicleResultScreen plate={plate} embedded />
  },
  "ai-analyse": {
    component: (plate) => <AiAnalysisScreen plate={plate} embedded />
  },
  markt: {
    component: (plate) => <MarketAnalysisScreen plate={plate} embedded />
  },
  "te-koop": {
    component: (plate) => <ComparableListings plate={plate} />
  },
  kilometerstand: {
    component: (plate) => <MileageTimelineScreen plate={plate} embedded />
  },
  apk: {
    component: (plate) => <InspectionTimelineScreen plate={plate} embedded />
  },
  risico: {
    component: () => null
  },
  schade: {
    component: (plate) => <DamageHistoryScreen plate={plate} embedded />
  },
  eigendom: {
    component: (plate) => <OwnershipTimelineScreen plate={plate} embedded />
  },
  "apk-intelligence": {
    component: (plate) => <ApkFailureIntelligenceScreen plate={plate} embedded />
  },
  specs: {
    component: (plate) => <TechnicalSpecsScreen plate={plate} embedded />
  },
  acties: {
    component: () => null
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

  const pendingScrollRef = useRef<string | null>(null);
  const jumpToGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id as GroupId]: true }));
    pendingScrollRef.current = id;
  };
  useEffect(() => {
    const id = pendingScrollRef.current;
    if (!id) return;
    pendingScrollRef.current = null;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openGroups]);

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

        <SectionErrorBoundary label="report-teaser">
          <ReportTeaser
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
