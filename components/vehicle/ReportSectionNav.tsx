"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Lock } from "lucide-react";
import styles from "./FullReportScreen.module.css";

export type ReportNavItem = {
  id: string;
  label: string;
  locked: boolean;
};

type Props = {
  items: ReportNavItem[];
  onJump: (id: string) => void;
  onExpandAll: () => void;
  allOpen: boolean;
};

/**
 * Sticky in-report navigation with scrollspy. The report is one long page of
 * collapsible groups, so this lets visitors jump straight to a group (the
 * parent opens it, then scrolls its header into view) instead of scrolling
 * through everything. Scrollspy observes the GROUP HEADER elements, which are
 * always in the DOM (id={group.id}) even when a group is collapsed. The matching
 * CSS (.navWrap/.nav/.navPill) lives in FullReportScreen.module.css.
 */
export function ReportSectionNav({ items, onJump, onExpandAll, allOpen }: Props) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const navRef = useRef<HTMLDivElement | null>(null);
  const ids = items.map((it) => it.id).join(",");

  // Scrollspy: mark the topmost group header currently in the viewport band.
  useEffect(() => {
    const sectionIds = ids ? ids.split(",") : [];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-132px 0px -55% 0px", threshold: 0 }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  // Keep the active pill in view inside the horizontal scroller (mobile).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const pill = nav.querySelector<HTMLElement>(`[data-nav-id="${active}"]`);
    if (!pill) return;
    const target = pill.offsetLeft - nav.clientWidth / 2 + pill.clientWidth / 2;
    nav.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [active]);

  const handleClick = (id: string) => {
    setActive(id);
    onJump(id);
  };

  return (
    <div className={styles.navWrap}>
      <div className={styles.nav} ref={navRef} role="tablist" aria-label="Rapportsecties">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            data-nav-id={item.id}
            className={`${styles.navPill} ${active === item.id ? styles.navPillActive : ""}`}
            onClick={() => handleClick(item.id)}
            aria-current={active === item.id ? "true" : undefined}
          >
            {item.locked ? <Lock size={11} className={styles.navLockIcon} /> : null}
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.navPill} ${styles.navExpandPill}`}
          onClick={onExpandAll}
          aria-label={allOpen ? "Alles inklappen" : "Alles uitklappen"}
        >
          {allOpen ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
          {allOpen ? "Inklappen" : "Alles open"}
        </button>
      </div>
    </div>
  );
}
