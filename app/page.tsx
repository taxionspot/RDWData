"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizePlate, validateDutchPlate } from "@/lib/rdw/normalize";
import { useI18n } from "@/lib/i18n/context";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useCmsPages } from "@/hooks/useCmsPages";
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
  Twitter,
  Linkedin,
  Facebook,
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

// Footer link lists are admin-configurable and stored in the DB, so a saved
// entry may not be a plain string (object/number/null). Coerce defensively to
// avoid a client-side crash (e.g. ".trim is not a function" or rendering an
// object as a React child).
function toLinkLabel(item: unknown): string {
  if (typeof item === "string") return item;
  if (typeof item === "number") return String(item);
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const candidate = o.label ?? o.title ?? o.name ?? o.text;
    if (typeof candidate === "string") return candidate;
  }
  return "";
}

function toLinkLabels(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.map(toLinkLabel).filter((label) => label.length > 0);
}

function resolveLegalHref(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "privacy policy" || normalized === "privacybeleid") {
    return "/privacy-policy";
  }
  if (normalized === "terms of service" || normalized === "terms and conditions" || normalized === "algemene voorwaarden") {
    return "/terms-and-conditions";
  }
  return null;
}

function resolveCompanyHref(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "contact") return "/contact";
  return null;
}

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
    <div className={styles["search-wrapper"]}>
      <small>{t("landing.example")}</small>
      <div className={styles["search-row"]}>
        <div className={styles["plate-field"]}>
          <span className={styles["plate-band"]} aria-hidden="true">
            <span className={styles["plate-star"]}>★</span>
            <span className={styles["plate-nl"]}>NL</span>
          </span>
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            placeholder={t("landing.example")}
            className={styles["plate-input"]}
          />
        </div>
        <button onClick={submit} className={styles["search-btn"]}>
          {t("landing.getReport")}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-[#dc2626]">{error}</p>}
    </div>
  );
}

export default function LandingPage() {
  const { t } = useI18n();
  const { settings } = useSiteSettings();
  const cmsPages = useCmsPages();
  const footerPages = cmsPages.filter(
    (page) => page.showInFooter && page.slug !== "privacy-policy" && page.slug !== "terms-and-conditions"
  );

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
              alt="Platform dashboard"
              priority
              unoptimized
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
            <button className={styles["cta-btn"]} data-media-type="banani-button">
              {settings.content.landingCtaButton}
            </button>
          </section>
        ) : null}
      </main>

      <footer className={styles.footer}>
        <div className={styles["footer-grid"]}>
          <div>
            <div className={styles["nav-brand"]}>
              <div className={styles["brand-icon"]}>
                <ShieldCheck size={16} />
              </div>
              {settings.content.platformName}
            </div>
            <p className={styles["footer-desc"]}>{settings.content.footerDescription}</p>
          </div>
          <div>
            <div className={styles["footer-title"]}>{settings.landing.footer.productTitle}</div>
            <div className={styles["footer-links"]}>
              {toLinkLabels(settings.landing.footer.productLinks).map((item) => (
                <div key={item} className={styles["footer-link"]}>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className={styles["footer-title"]}>{settings.landing.footer.companyTitle}</div>
            <div className={styles["footer-links"]}>
              {toLinkLabels(settings.landing.footer.companyLinks).map((item) => {
                const href = resolveCompanyHref(item);
                return href ? (
                  <Link key={item} href={href} className={styles["footer-link"]}>
                    {item}
                  </Link>
                ) : (
                  <div key={item} className={styles["footer-link"]}>
                    {item}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className={styles["footer-title"]}>{settings.landing.footer.legalTitle}</div>
            <div className={styles["footer-links"]}>
              {toLinkLabels(settings.landing.footer.legalLinks).map((item) => (
                (() => {
                  const href = resolveLegalHref(item);
                  if (href) {
                    return (
                      <Link key={item} href={href} className={styles["footer-link"]}>
                        {item}
                      </Link>
                    );
                  }
                  return (
                    <div key={item} className={styles["footer-link"]}>
                      {item}
                    </div>
                  );
                })()
              ))}
              {footerPages.map((page) => (
                <Link key={page._id} href={`/p/${page.slug}`} className={styles["footer-link"]}>
                  {page.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className={styles["footer-bottom"]}>
          <div>© {new Date().getFullYear()} {settings.content.platformName} {t("landing.footerRights")}</div>
          <div className={styles["social-icons"]}>
            <a className={styles["social-icon"]} href="https://twitter.com" aria-label="Twitter">
              <Twitter size={16} />
            </a>
            <a className={styles["social-icon"]} href="https://linkedin.com" aria-label="LinkedIn">
              <Linkedin size={16} />
            </a>
            <a className={styles["social-icon"]} href="https://facebook.com" aria-label="Facebook">
              <Facebook size={16} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
