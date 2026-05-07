"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CarFront, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import styles from "./VehicleNavBar.module.css";

type Props = {
  plate: string;
  subtitle?: string;
};

export function VehicleNavBar({ plate, subtitle = "Open detailed reports" }: Props) {
  const { locale } = useI18n();
  const resolvedSubtitle =
    subtitle === "Open detailed reports"
      ? locale === "nl"
        ? "Open gedetailleerde rapporten"
        : subtitle
      : subtitle;
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const carryParams = new URLSearchParams();
  const mileageRaw = searchParams.get("mileage");
  const compareRaw = searchParams.get("compare");
  const compareMileageRaw = searchParams.get("compareMileage");
  if (mileageRaw && /^\d{1,7}$/.test(mileageRaw)) carryParams.set("mileage", mileageRaw);
  if (compareRaw && /^[A-Z0-9-]{1,16}$/i.test(compareRaw)) carryParams.set("compare", compareRaw.toUpperCase());
  if (compareMileageRaw && /^\d{1,7}$/.test(compareMileageRaw)) carryParams.set("compareMileage", compareMileageRaw);
  const sharedQuery = carryParams.toString();
  const base = `/search/${plate}`;

  const navItems =
    locale === "nl"
      ? [
          { href: "", label: "Overzicht", isPremium: false },
          { href: "technical-specs", label: "Technische specs", isPremium: false },
          { href: "risk-overview", label: "Risico-overzicht", isPremium: true },
          { href: "inspection-timeline", label: "APK-tijdlijn", isPremium: false },
          { href: "damage-history", label: "Schade", isPremium: true },
          { href: "ownership-history", label: "Eigendom", isPremium: false },
          { href: "market-analysis", label: "Markt", isPremium: true },
          { href: "vehicle-comparison", label: "Vergelijking", isPremium: true },
          { href: "negotiation-copilot", label: "Onderhandelcoach", isPremium: true },
          { href: "apk-failure-intelligence", label: "APK Intelligence", isPremium: true },
          { href: "post-purchase-watch", label: "Watch mode", isPremium: true },
        ]
      : [
          { href: "", label: "Overview", isPremium: false },
          { href: "technical-specs", label: "Tech Specs", isPremium: false },
          { href: "risk-overview", label: "Risk Overview", isPremium: true },
          { href: "inspection-timeline", label: "APK Timeline", isPremium: false },
          { href: "damage-history", label: "Damage", isPremium: true },
          { href: "ownership-history", label: "Ownership", isPremium: false },
          { href: "market-analysis", label: "Market", isPremium: true },
          { href: "vehicle-comparison", label: "Comparison", isPremium: true },
          { href: "negotiation-copilot", label: "Negotiation Copilot", isPremium: true },
          { href: "apk-failure-intelligence", label: "APK Intelligence", isPremium: true },
          { href: "post-purchase-watch", label: "Watch mode", isPremium: true },
        ];

  const stripRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft]   = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", updateArrows); ro.disconnect(); };
  }, [updateArrows]);

  // Scroll active pill into view on mount / route change
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>("[data-active]");
    if (active) active.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [pathname]);

  const scroll = (dir: "left" | "right") => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
  };

  return (
    <div className={styles.topbar}>
      {/* Brand block */}
      <div className={styles.brandBlock}>
        <div className={styles.brandMark}>
          <CarFront size={18} />
        </div>
        <div className={styles.brandCopy}>
          <div className={styles.brandTitle}>
            {locale === "nl" ? "Voertuigoverzicht" : "Vehicle Overview"}
          </div>
          <div className={styles.brandSubtitle}>{resolvedSubtitle}</div>
        </div>
      </div>

      {/* Scroll controls + strip */}
      <div className={styles.navArea}>
        {/* Left arrow */}
        <button
          onClick={() => scroll("left")}
          className={styles.scrollBtn}
          aria-label="Scroll left"
          style={{ opacity: canLeft ? 1 : 0, pointerEvents: canLeft ? "auto" : "none" }}
        >
          <ChevronLeft size={15} />
        </button>

        {/* Scrollable pill strip */}
        <div className={styles.topbarRight} ref={stripRef}>
          {navItems.map((item) => {
            const hrefBase = item.href ? `${base}/${item.href}` : base;
            const href = sharedQuery ? `${hrefBase}?${sharedQuery}` : hrefBase;
            const isActive = pathname === hrefBase || pathname === `${hrefBase}/`;
            return (
              <Link
                key={item.href}
                href={href}
                data-active={isActive || undefined}
                className={`${styles.navPill} ${isActive ? styles.navPillActive : ""} ${item.isPremium ? styles.navPillPremium : ""}`}
              >
                {item.label}
                {item.isPremium && <Lock size={10} className={styles.lockIcon} />}
              </Link>
            );
          })}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll("right")}
          className={styles.scrollBtn}
          aria-label="Scroll right"
          style={{ opacity: canRight ? 1 : 0, pointerEvents: canRight ? "auto" : "none" }}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
