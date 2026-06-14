"use client";

import { ChevronDown, Lock } from "lucide-react";
import type { GroupDef, GroupId } from "@/lib/vehicle/groups";
import type { GroupStatus } from "@/lib/vehicle/signals";
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary";
import styles from "./ReportGroup.module.css";

type Props = {
  group: GroupDef;
  index: number;
  status: GroupStatus;
  isPremium: boolean;
  open: boolean;
  onToggle: (id: GroupId) => void;
  locale: "nl" | "en";
  children: React.ReactNode;
};

function statusToneClass(tone: GroupStatus["tone"]): string {
  if (tone === "danger") return styles.statusDanger;
  if (tone === "warn") return styles.statusWarn;
  return styles.statusOk;
}

/**
 * One collapsible report group. The HEADER (with id={group.id}) is ALWAYS in
 * the DOM so the scrollspy IntersectionObserver and nav scrollIntoView can
 * target it even while the body is collapsed. Only the body collapses, and it
 * is wrapped in SectionErrorBoundary so one broken section never crashes the
 * whole report.
 */
export function ReportGroup({
  group,
  index,
  status,
  isPremium,
  open,
  onToggle,
  locale,
  children
}: Props) {
  const nl = locale === "nl";
  const label = nl ? group.labelNl : group.labelEn;
  const statusLabel = nl ? status.labelNl : status.labelEn;
  const bodyId = `${group.id}-body`;

  return (
    <section className={`${styles.group} ${open ? styles.groupOpen : ""}`}>
      <button
        type="button"
        id={group.id}
        className={styles.header}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => onToggle(group.id)}
      >
        <span className={styles.index}>{String(index).padStart(2, "0")}</span>
        <span className={styles.meta}>
          <span className={styles.titleRow}>
            <span className={styles.title}>{label}</span>
            {group.lockKey ? (
              isPremium ? (
                <span className={`${styles.chip} ${styles.chipPremium}`}>
                  <Lock size={9} aria-hidden={true} /> Premium
                </span>
              ) : (
                <span className={`${styles.chip} ${styles.chipFree}`}>
                  {nl ? "Inbegrepen" : "Included"}
                </span>
              )
            ) : (
              <span className={`${styles.chip} ${styles.chipFree}`}>
                {nl ? "Gratis" : "Free"}
              </span>
            )}
          </span>
          <span className={`${styles.status} ${statusToneClass(status.tone)}`}>
            <span className={styles.statusDot} />
            {statusLabel}
          </span>
        </span>
        <ChevronDown
          size={20}
          aria-hidden={true}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
        />
      </button>

      {open ? (
        <div id={bodyId} className={styles.body}>
          <SectionErrorBoundary label={group.id}>{children}</SectionErrorBoundary>
        </div>
      ) : null}
    </section>
  );
}
