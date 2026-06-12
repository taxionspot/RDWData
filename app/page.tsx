"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { normalizePlate, validateDutchPlate } from "@/lib/rdw/normalize";
import { useI18n } from "@/lib/i18n/context";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import {
  Building2,
  Briefcase,
  MapPin,
  Scale,
  CarFront,
  Gauge,
  TrendingUp,
  Users,
  FileCheck,
  FileSpreadsheet,
  Sparkles,
  ShieldCheck
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./page.module.css";

const ICON_MAP: Record<string, LucideIcon> = {
  CarFront,
  Gauge,
  TrendingUp,
  Users,
  FileCheck,
  FileSpreadsheet,
  Sparkles,
  ShieldCheck
};

function PlateSearch() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { t } = useI18n();

  const submit = () => {
    const plate = normalizePlate(value);
    if (!validateDutchPlate(plate)) {
      setError(t("landing.invalidPlate"));
      return;
    }
    router.push(`/search/${plate}`);
  };

  return (
    <div id="plate-search" className={styles["search-wrapper"]}>
      <small>{t("landing.example")}</small>
      <div className={styles["search-row"]}>
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(event) => event.key === "Enter" && submit()}
          placeholder={t("landing.example")}
          className={`${styles["input-mock"]} ${styles["plate-input"]}`}
        />
        <button onClick={submit} className={styles["search-btn"]}>
          {t("landing.getReport")}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-[#dc2626]">{error}</p>}
    </div>
  );
}

export default function LandingPage() {
  const { settings } = useSiteSettings();

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles["hero-section"]}>
          <div className={`${styles.badge} ${styles.badgePrimary}`}>
            <Sparkles size={14} /> {settings.landing.badgeTop}
          </div>
          <h1 className={styles["hero-title"]}>
            {settings.content.landingHeroTitleA} <span>{settings.content.landingHeroTitleB}</span>
          </h1>
          <p className={styles["hero-subtitle"]}>{settings.content.landingHeroSubtitle}</p>
          <PlateSearch />
          <div className={styles["trust-logos"]}>
            <span>{settings.landing.trustedSourcesLabel}</span>
            <Building2 size={20} />
            <Briefcase size={20} />
            <MapPin size={20} />
            <Scale size={20} />
          </div>
          <div className={styles["hero-image"]}>
            <Image
              src={settings.content.landingHeroImageUrl}
              width={1200}
              height={675}
              alt="Kentekenrapport voertuigcheck"
              priority
              className="w-full h-auto"
            />
          </div>
        </section>

        {settings.landing.sectionVisibility.features ? (
          <section id="features" className={styles.section}>
            <div className={styles["section-header"]}>
              <div className={styles.badge}>{settings.landing.featureSectionLabel}</div>
              <h2 className={styles["section-title"]}>{settings.landing.featureSectionTitle}</h2>
            </div>
            <div className={styles["features-grid"]}>
              {settings.landing.features.map((feature) => {
                const Icon = ICON_MAP[feature.icon] ?? Sparkles;
                return (
                  <div key={feature.id} className={styles["feature-card"]}>
                    <div className={styles["feature-icon"]}>
                      <Icon size={28} />
                    </div>
                    <h3 className={styles["feature-title"]}>{feature.title}</h3>
                    <p className={styles["feature-desc"]}>{feature.desc}</p>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {settings.landing.sectionVisibility.workflow ? (
          <section id="sample" className={styles.section}>
            <div className={styles["section-header"]}>
              <div className={styles.badge}>{settings.landing.howSectionLabel}</div>
              <h2 className={styles["section-title"]}>{settings.landing.howSectionTitle}</h2>
            </div>
            <div className={styles["workflow-steps"]}>
              {settings.landing.workflow.map((step, index) => (
                <div key={step.id} className={styles["step-card"]}>
                  <div className={styles["step-number"]}>{index + 1}</div>
                  <h3 className={styles["step-title"]}>{step.title}</h3>
                  <p className={styles["step-desc"]}>{step.desc}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {settings.landing.sectionVisibility.cta ? (
          <section id="pricing" className={styles.cta}>
            <h2 className={styles["cta-title"]}>{settings.content.landingCtaTitle}</h2>
            <p className={styles["cta-subtitle"]}>{settings.content.landingCtaSubtitle}</p>
            <a href="#plate-search" className={styles["cta-btn"]}>
              {settings.content.landingCtaButton}
            </a>
          </section>
        ) : null}
      </main>
    </div>
  );
}
