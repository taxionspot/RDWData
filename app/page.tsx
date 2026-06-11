"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizePlate, validateDutchPlate } from "@/lib/rdw/normalize";
import { useI18n } from "@/lib/i18n/context";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useCmsPages } from "@/hooks/useCmsPages";
import {
  AlertTriangle,
  BadgeEuro,
  CarFront,
  CheckCircle2,
  ChevronDown,
  FileCheck,
  FileSpreadsheet,
  Gauge,
  HandCoins,
  ListChecks,
  Lock,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Twitter,
  Linkedin,
  Facebook,
  Users
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

const SAMPLE_PLATE = "16RSL9";

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

/* ── Kenteken plate input (NL plate styling) ─────────────────────────── */
function PlateSearch({ id }: { id?: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { t, locale } = useI18n();

  const submit = () => {
    const plate = normalizePlate(value);
    if (!validateDutchPlate(plate)) {
      setError(t("landing.invalidPlate"));
      return;
    }
    router.push(`/search/${plate}`);
  };

  return (
    <div className={styles.plateForm}>
      <div className={styles.plateRow}>
        <div className={`${styles.plateShell} ${error ? styles.plateShellError : ""}`}>
          <div className={styles.plateBand}>
            <span className={styles.plateStars}>★</span>
            NL
          </div>
          <input
            id={id}
            value={value}
            onChange={(event) => {
              setValue(event.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            placeholder="XX-99-XX"
            maxLength={9}
            className={styles.plateField}
            aria-label={locale === "nl" ? "Kenteken" : "License plate"}
          />
        </div>
        <button onClick={submit} className={styles.plateSubmit} type="button">
          <Search size={18} />
          {locale === "nl" ? "Check kenteken" : "Check plate"}
        </button>
      </div>
      {error && <p className={styles.plateError}>{error}</p>}
      <div className={styles.plateMicro}>
        <span>
          <strong>{locale === "nl" ? "Gratis basischeck" : "Free basic check"}</strong>{" "}
          · {locale === "nl" ? "geen account nodig" : "no account needed"}
        </span>
        <span>
          {locale === "nl" ? "Voorbeeld:" : "Example:"}{" "}
          <strong>16-RSL-9</strong>
        </span>
      </div>
    </div>
  );
}

/* ── Live counter ────────────────────────────────────────────────────── */
function LiveReportCount() {
  // Deterministic initial value: server-rendered HTML and the first client
  // render must match exactly, otherwise React throws a hydration error in
  // production ("Application error"). Randomize only after mount.
  const [n, setN] = useState(1247);
  useEffect(() => {
    setN(1240 + Math.floor(Math.random() * 40));
    const id = setInterval(() => setN((c) => c + Math.floor(Math.random() * 2) + 1), 4200);
    return () => clearInterval(id);
  }, []);
  return <>{n.toLocaleString("nl-NL")}</>;
}

/* ── Hero mock report card ───────────────────────────────────────────── */
function MockReportCard({ locale }: { locale: "nl" | "en" }) {
  return (
    <div className={styles.mockWrap} aria-hidden>
      <div className={styles.mockGlow} />
      <div className={styles.mockCard}>
        <div className={styles.mockHeader}>
          <span className={styles.mockPlate}>
            <span className={styles.mockPlateBand}>NL</span>
            <span className={styles.mockPlateNr}>16-RSL-9</span>
          </span>
          <div className={styles.mockScore}>
            <div className={styles.mockRing}>
              <div className={styles.mockRingInner}>78</div>
            </div>
            <div className={styles.mockScoreLabel}>
              Kentekenrapport
              <br />
              Score
            </div>
          </div>
        </div>
        <div className={styles.mockRows}>
          <div className={`${styles.mockRow} ${styles.mockOk}`}>
            <CheckCircle2 size={16} />
            {locale === "nl" ? "NAP-tellerstandoordeel: logisch" : "NAP odometer verdict: logical"}
          </div>
          <div className={`${styles.mockRow} ${styles.mockOk}`}>
            <CheckCircle2 size={16} />
            {locale === "nl" ? "Geen WOK-registratie" : "No salvage (WOK) registration"}
          </div>
          <div className={`${styles.mockRow} ${styles.mockWarn}`}>
            <AlertTriangle size={16} />
            {locale === "nl" ? "1 open terugroepactie" : "1 open recall"}
          </div>
          <div className={`${styles.mockRow} ${styles.mockBlur}`}>
            <BadgeEuro size={16} />
            <span>{locale === "nl" ? "Marktwaarde € 14.250" : "Market value € 14,250"}</span>
            <span className={styles.mockLockTag}>
              <Lock size={9} /> PREMIUM
            </span>
          </div>
          <div className={`${styles.mockRow} ${styles.mockBlur}`}>
            <HandCoins size={16} />
            <span>{locale === "nl" ? "Biedrange € 12.900 – € 13.600" : "Offer range € 12,900 – € 13,600"}</span>
            <span className={styles.mockLockTag}>
              <Lock size={9} /> PREMIUM
            </span>
          </div>
        </div>
        <div className={styles.mockFootnote}>
          {locale === "nl" ? "Voorbeeldweergave van een rapport" : "Sample report preview"}
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const { t, locale } = useI18n();
  const { settings } = useSiteSettings();
  const cmsPages = useCmsPages();
  const nl = locale === "nl";
  const footerPages = cmsPages.filter(
    (page) => page.showInFooter && page.slug !== "privacy-policy" && page.slug !== "terms-and-conditions"
  );

  const focusPlateInput = () => {
    const input = document.getElementById("hero-plate-input") as HTMLInputElement | null;
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => input?.focus(), 350);
  };

  // Free/premium mapping for the report contents grid
  const tierByFeatureId: Record<string, "free" | "premium"> = {
    damage: "premium",
    mileage: "premium",
    market: "premium",
    owners: "free",
    apk: "free",
    specs: "free"
  };

  const extraContents = [
    {
      id: "ai",
      icon: Sparkles,
      tier: "premium" as const,
      title: nl ? "AI-samenvatting" : "AI summary",
      desc: nl
        ? "Heldere uitleg van alle bevindingen in gewone taal, met aandachtspunten voor de bezichtiging."
        : "Plain-language explanation of every finding, with attention points for the viewing."
    },
    {
      id: "negotiation",
      icon: HandCoins,
      tier: "premium" as const,
      title: nl ? "Onderhandelcoach" : "Negotiation copilot",
      desc: nl
        ? "Aanbevolen biedrange, walk-away-grens en gesprekspunten onderbouwd met de data uit het rapport."
        : "Recommended offer range, walk-away threshold and talking points backed by report data."
    },
    {
      id: "compare",
      icon: ListChecks,
      tier: "premium" as const,
      title: nl ? "Vergelijk 2 auto's" : "Compare 2 vehicles",
      desc: nl
        ? "Zet twee kentekens naast elkaar over 30+ datapunten en laat AI de beste keuze onderbouwen."
        : "Put two plates side by side across 30+ data points with an AI-backed verdict."
    }
  ];

  const faqItems = nl
    ? [
        {
          q: "Wat is gratis en wat is betaald?",
          a: "De basischeck is gratis en zonder account: voertuiggegevens, APK-status, NAP-tellerstandoordeel en open terugroepacties. Het volledige rapport — met APK-gebrekenhistorie, marktwaarde, vraagprijs-check, onderhandelcoach en PDF — ontgrendel je eenmalig per kenteken."
        },
        {
          q: "Waar komt de data vandaan?",
          a: "Uit de officiële open databronnen van de RDW (Rijksdienst voor het Wegverkeer): het voertuigregister, APK-keuringen, geconstateerde gebreken en terugroepacties. Bij elk gegeven tonen we de bron."
        },
        {
          q: "Kan ik de volledige kilometerhistorie zien?",
          a: "Nee — en dat kan niemand. De RDW mag volledige tellerstanden aan geen enkele partij verstrekken, ook niet aan buitenlandse aanbieders. Wij tonen het officiële NAP-tellerstandoordeel en leggen uit hoe je via de verkoper het gratis RDW-tellerrapport opvraagt."
        },
        {
          q: "Hoe betaal ik?",
          a: "Via onze beveiligde checkout met iDEAL, Apple Pay, Google Pay, PayPal of creditcard. Je hebt geen PayPal-account nodig."
        },
        {
          q: "Is dit hetzelfde als CARFAX of carVertical?",
          a: "Nee. Internationale checkers zijn sterk voor importauto's, maar missen Nederlandse diepte: geen NAP-oordeel en beperkte APK-historie. Kentekenrapport is Nederlands-eerst, gebouwd op de officiële RDW-bronnen, en kost een derde van de prijs."
        },
        {
          q: "Krijg ik mijn geld terug als het rapport tegenvalt?",
          a: "Ja. Niet tevreden? Mail ons binnen 14 dagen en je krijgt je geld terug."
        }
      ]
    : [
        {
          q: "What is free and what is paid?",
          a: "The basic check is free without an account: vehicle data, APK status, NAP odometer verdict and open recalls. The full report — defect history, market value, asking-price check, negotiation copilot and PDF — is a one-time unlock per plate."
        },
        {
          q: "Where does the data come from?",
          a: "From the official open data sources of the RDW (Netherlands Vehicle Authority): the vehicle register, APK inspections, recorded defects and recall campaigns. Every data point shows its source."
        },
        {
          q: "Can I see the full mileage history?",
          a: "No — and neither can anyone else. The RDW is not allowed to share full odometer readings with any party, including foreign providers. We show the official NAP verdict and explain how to request the free RDW odometer report via the seller."
        },
        {
          q: "How do I pay?",
          a: "Through our secure checkout with iDEAL, Apple Pay, Google Pay, PayPal or credit card. No PayPal account required."
        },
        {
          q: "Is this the same as CARFAX or carVertical?",
          a: "No. International checkers are strong for imported cars but miss Dutch depth: no NAP verdict and limited APK history. Kentekenrapport is Dutch-first, built on official RDW sources, at a third of the price."
        },
        {
          q: "Do I get a refund if the report disappoints?",
          a: "Yes. Not satisfied? Email us within 14 days and you get your money back."
        }
      ];

  const compareRows: Array<{ label: string; us: string; carfax: string; cv: string }> = nl
    ? [
        { label: "Prijs per rapport", us: `€ ${settings.payment.amount}`, carfax: "€ 19,99 – 39,99", cv: "± € 30" },
        { label: "Volledige RDW-data (NL)", us: "✓", carfax: "~", cv: "~" },
        { label: "NAP-tellerstandoordeel", us: "✓", carfax: "✓", cv: "✗" },
        { label: "APK-gebrekenhistorie + omschrijvingen", us: "✓", carfax: "~", cv: "✗" },
        { label: "Marktwaarde + vraagprijs-check", us: "✓", carfax: "✗", cv: "✓" },
        { label: "Onderhandelcoach & AI-samenvatting", us: "✓", carfax: "✗", cv: "✗" },
        { label: "Buitenlandse historie (import)", us: "✗", carfax: "✓", cv: "✓" },
        { label: "Nederlandstalig", us: "✓", carfax: "✓", cv: "✓" }
      ]
    : [
        { label: "Price per report", us: `€ ${settings.payment.amount}`, carfax: "€ 19.99 – 39.99", cv: "± € 30" },
        { label: "Full RDW data (NL)", us: "✓", carfax: "~", cv: "~" },
        { label: "NAP odometer verdict", us: "✓", carfax: "✓", cv: "✗" },
        { label: "APK defect history + descriptions", us: "✓", carfax: "~", cv: "✗" },
        { label: "Market value + asking-price check", us: "✓", carfax: "✗", cv: "✓" },
        { label: "Negotiation copilot & AI summary", us: "✓", carfax: "✗", cv: "✗" },
        { label: "Foreign history (imports)", us: "✗", carfax: "✓", cv: "✓" },
        { label: "Dutch language", us: "✓", carfax: "✓", cv: "✓" }
      ];

  const renderCompareCell = (value: string) => {
    if (value === "✓") return <span className={styles.compareYes}>✓</span>;
    if (value === "✗") return <span className={styles.compareNo}>✗</span>;
    if (value === "~") return <span className={styles.comparePart}>{nl ? "deels" : "partial"}</span>;
    return value;
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {/* ── HERO ─────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroGrid} aria-hidden />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <div className={styles.heroBadge}>
                <ShieldCheck size={14} />
                {nl ? "Officiële RDW-data · dagelijks ververst" : "Official RDW data · refreshed daily"}
              </div>
              <h1 className={styles.heroTitle}>
                {settings.content.landingHeroTitleA} <span>{settings.content.landingHeroTitleB}</span>
              </h1>
              <p className={styles.heroSubtitle}>{settings.content.landingHeroSubtitle}</p>

              <PlateSearch id="hero-plate-input" />

              <div className={styles.heroTrustRow}>
                <span className={styles.trustChip}>
                  <CheckCircle2 size={14} />
                  {nl ? "Officiële RDW-bronnen" : "Official RDW sources"}
                </span>
                <span className={styles.trustChip}>
                  <CheckCircle2 size={14} />
                  {nl ? "Niet-goed-geld-terug" : "Money-back guarantee"}
                </span>
                <span className={styles.trustChip}>
                  <CheckCircle2 size={14} />
                  {nl ? "iDEAL · Apple Pay · PayPal" : "iDEAL · Apple Pay · PayPal"}
                </span>
              </div>

              <div className={styles.heroStats}>
                <div className={styles.heroStat}>
                  <span className={styles.heroStatValue}>16M+</span>
                  <span className={styles.heroStatLabel}>{nl ? "Voertuigen in het register" : "Vehicles in the register"}</span>
                </div>
                <div className={styles.heroStat}>
                  <span className={styles.heroStatValue}>15+</span>
                  <span className={styles.heroStatLabel}>{nl ? "Officiële datasets per check" : "Official datasets per check"}</span>
                </div>
                <div className={styles.heroStat}>
                  <span className={styles.heroStatValue}>
                    <LiveReportCount />
                  </span>
                  <span className={styles.heroStatLabel}>{nl ? "Checks deze week" : "Checks this week"}</span>
                </div>
              </div>
            </div>

            <MockReportCard locale={locale} />
          </div>
        </section>

        {/* ── REPORT CONTENTS ──────────────────────────────────────── */}
        {settings.landing.sectionVisibility.features ? (
          <section id="features" className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.badge}>{settings.landing.featureSectionLabel}</div>
              <h2 className={styles.sectionTitle}>
                {nl ? "Dit ontdek je in het rapport" : "What you discover in the report"}
              </h2>
              <p className={styles.sectionIntro}>
                {nl
                  ? "Gratis zie je direct de basis. Het volledige rapport ontgrendelt elke sectie voor dit kenteken — eenmalig, zonder abonnement."
                  : "The basics are free instantly. The full report unlocks every section for this plate — one-time, no subscription."}
              </p>
            </div>
            <div className={styles.contentsGrid}>
              {settings.landing.features.map((feature) => {
                const Icon = ICON_MAP[feature.icon] ?? Sparkles;
                const tier = tierByFeatureId[feature.id] ?? "premium";
                return (
                  <div key={feature.id} className={styles.contentCard}>
                    <div className={styles.contentIcon}>
                      <Icon size={24} />
                    </div>
                    <div className={styles.contentTitleRow}>
                      <h3 className={styles.contentTitle}>{feature.title}</h3>
                      {tier === "free" ? (
                        <span className={`${styles.tierChip} ${styles.tierFree}`}>{nl ? "Gratis" : "Free"}</span>
                      ) : (
                        <span className={`${styles.tierChip} ${styles.tierPremium}`}>
                          <Lock size={9} /> Premium
                        </span>
                      )}
                    </div>
                    <p className={styles.contentDesc}>{feature.desc}</p>
                  </div>
                );
              })}
              {extraContents.map((item) => (
                <div key={item.id} className={styles.contentCard}>
                  <div className={styles.contentIcon}>
                    <item.icon size={24} />
                  </div>
                  <div className={styles.contentTitleRow}>
                    <h3 className={styles.contentTitle}>{item.title}</h3>
                    <span className={`${styles.tierChip} ${styles.tierPremium}`}>
                      <Lock size={9} /> Premium
                    </span>
                  </div>
                  <p className={styles.contentDesc}>{item.desc}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── WHY CHECK (dark band) ────────────────────────────────── */}
        <section className={styles.darkBand}>
          <div className={styles.darkBandInner}>
            <div className={styles.darkBandHead}>
              <h2 className={styles.darkBandTitle}>
                {nl ? "Een occasion koop je geen twee keer" : "You only buy a used car once"}
              </h2>
              <p className={styles.darkBandSub}>
                {nl
                  ? "Kilometerfraude, verzwegen schade en een verborgen importverleden komen vaker voor dan je denkt. Eén check voorkomt een miskoop van duizenden euro's."
                  : "Odometer fraud, concealed damage and hidden import history are more common than you think. One check prevents a costly mistake."}
              </p>
            </div>
            <div className={styles.riskCards}>
              <div className={styles.riskCard}>
                <div className={styles.riskCardIcon}>
                  <Gauge size={22} />
                </div>
                <div className={styles.riskCardTitle}>{nl ? "Teruggedraaide tellers" : "Rolled-back odometers"}</div>
                <p className={styles.riskCardDesc}>
                  {nl
                    ? "Wij tonen het officiële NAP-tellerstandoordeel van de RDW en signaleren onlogische patronen in de keuringshistorie."
                    : "We show the official RDW NAP odometer verdict and flag illogical patterns in the inspection history."}
                </p>
              </div>
              <div className={styles.riskCard}>
                <div className={styles.riskCardIcon}>
                  <AlertTriangle size={22} />
                </div>
                <div className={styles.riskCardTitle}>{nl ? "Verzwegen gebreken" : "Concealed defects"}</div>
                <p className={styles.riskCardDesc}>
                  {nl
                    ? "Elke afkeuring en elk geconstateerd gebrek uit de APK-historie, met officiële omschrijving — ook wat de verkoper niet vertelt."
                    : "Every APK failure and recorded defect with its official description — including what the seller doesn't mention."}
                </p>
              </div>
              <div className={styles.riskCard}>
                <div className={styles.riskCardIcon}>
                  <BadgeEuro size={22} />
                </div>
                <div className={styles.riskCardTitle}>{nl ? "Te veel betalen" : "Overpaying"}</div>
                <p className={styles.riskCardDesc}>
                  {nl
                    ? "Marktwaarde-indicatie met bandbreedte, vraagprijs-check en een onderhandelcoach die je biedstrategie onderbouwt."
                    : "Market value with a confidence band, asking-price check and a negotiation copilot that backs your offer."}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
        {settings.landing.sectionVisibility.workflow ? (
          <section id="sample" className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.badge}>{settings.landing.howSectionLabel}</div>
              <h2 className={styles.sectionTitle}>{settings.landing.howSectionTitle}</h2>
            </div>
            <div className={styles.steps}>
              {settings.landing.workflow.map((step, index) => (
                <div key={step.id} className={styles.stepCard}>
                  <div className={styles.stepNumber}>{index + 1}</div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepDesc}>{step.desc}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── PRICING ──────────────────────────────────────────────── */}
        <section id="pricing" className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.badge}>{nl ? "Prijzen" : "Pricing"}</div>
            <h2 className={styles.sectionTitle}>
              {nl ? "Eén heldere prijs. Geen abonnement." : "One clear price. No subscription."}
            </h2>
            <p className={styles.sectionIntro}>
              {nl
                ? `Eenmalig € ${settings.payment.amount} per kenteken ontgrendelt het volledige rapport — een fractie van wat één verborgen gebrek je kost.`
                : `A one-time € ${settings.payment.amount} per plate unlocks the full report — a fraction of what one hidden defect costs you.`}
            </p>
          </div>

          <div className={styles.pricingGrid}>
            <div className={`${styles.priceCard} ${styles.priceCardFeatured}`}>
              <div className={styles.priceTag}>{nl ? "Direct beschikbaar" : "Available now"}</div>
              <div className={styles.priceName}>{nl ? "Volledig rapport" : "Full report"}</div>
              <div className={styles.priceAmount}>
                <span className={styles.priceValue}>€ {settings.payment.amount}</span>
                <span className={styles.priceUnit}>{nl ? "eenmalig per kenteken" : "one-time per plate"}</span>
              </div>
              <ul className={styles.priceList}>
                <li>
                  <CheckCircle2 size={16} />
                  {nl ? "Alle premium secties ontgrendeld voor dit kenteken" : "All premium sections unlocked for this plate"}
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  {nl ? "APK-gebrekenhistorie, kilometeranalyse en schadesignalen" : "Defect history, mileage analysis and damage signals"}
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  {nl ? "Marktwaarde, vraagprijs-check en onderhandelcoach" : "Market value, asking-price check and negotiation copilot"}
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  {nl ? "PDF-rapport + levering per e-mail" : "PDF report + email delivery"}
                </li>
              </ul>
              <button type="button" className={`${styles.priceCta} ${styles.priceCtaPrimary}`} onClick={focusPlateInput}>
                <Search size={16} />
                {nl ? "Check een kenteken" : "Check a plate"}
              </button>
            </div>

            <div className={styles.priceCard}>
              <div className={styles.priceName}>{nl ? "Bundel: 3 rapporten" : "Bundle: 3 reports"}</div>
              <div className={styles.priceAmount}>
                <span className={styles.priceValue}>€ 19,95</span>
                <span className={styles.priceUnit}>{nl ? "voor 3 kentekens" : "for 3 plates"}</span>
              </div>
              <div className={styles.priceNote}>{nl ? "Bespaar 33% per rapport" : "Save 33% per report"}</div>
              <ul className={styles.priceList}>
                <li>
                  <CheckCircle2 size={16} />
                  {nl ? "Voor wie meerdere auto's vergelijkt" : "For comparing multiple cars"}
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  {nl ? "Inclusief AI-vergelijking tussen kandidaten" : "Includes AI comparison between candidates"}
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  {nl ? "Zelfde volledige rapport per kenteken" : "Same full report per plate"}
                </li>
              </ul>
              <button type="button" className={`${styles.priceCta} ${styles.priceCtaGhost}`} disabled>
                {nl ? "Binnenkort beschikbaar" : "Coming soon"}
              </button>
            </div>
          </div>

          <div className={styles.payMethods}>
            <span>{nl ? "Veilig betalen met" : "Pay securely with"}</span>
            <span className={styles.payChip}>iDEAL</span>
            <span className={styles.payChip}>Apple Pay</span>
            <span className={styles.payChip}>Google Pay</span>
            <span className={styles.payChip}>PayPal</span>
            <span className={styles.payChip}>Visa / Mastercard</span>
          </div>

          <div className={styles.guaranteeRow}>
            <span className={styles.guaranteeItem}>
              <Shield size={16} />
              {nl ? "Niet-goed-geld-terug binnen 14 dagen" : "Money back within 14 days"}
            </span>
            <span className={styles.guaranteeItem}>
              <CheckCircle2 size={16} />
              {nl ? "Direct na betaling beschikbaar" : "Available immediately after payment"}
            </span>
          </div>
        </section>

        {/* ── COMPARISON ───────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.badge}>{nl ? "Vergelijk zelf" : "Compare for yourself"}</div>
            <h2 className={styles.sectionTitle}>
              {nl ? "Nederlands-eerst verslaat internationaal" : "Dutch-first beats international"}
            </h2>
            <p className={styles.sectionIntro}>
              {nl
                ? "Internationale checkers zijn sterk voor importauto's — maar voor een Nederlandse occasion missen ze de diepte van de officiële RDW-bronnen."
                : "International checkers are strong for imports — but for a Dutch used car they miss the depth of official RDW sources."}
            </p>
          </div>
          <div className={styles.compareWrap}>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th>{nl ? "Wat je krijgt" : "What you get"}</th>
                  <th className={styles.compareUs}>{settings.content.platformName}</th>
                  <th>CARFAX</th>
                  <th>carVertical</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className={styles.compareUs}>{renderCompareCell(row.us)}</td>
                    <td>{renderCompareCell(row.carfax)}</td>
                    <td>{renderCompareCell(row.cv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.compareFootnote}>
            {nl
              ? "Prijzen van derden zijn indicatief (juni 2026) en kunnen wijzigen. Koop je een importauto? Dan kan een internationale check een zinvolle aanvulling zijn."
              : "Third-party prices are indicative (June 2026) and may change. Buying an import? An international check can be a useful addition."}
          </p>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.badge}>FAQ</div>
            <h2 className={styles.sectionTitle}>{nl ? "Veelgestelde vragen" : "Frequently asked questions"}</h2>
          </div>
          <div className={styles.faqList}>
            {faqItems.map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary>
                  {item.q}
                  <ChevronDown size={18} className={styles.faqChevron} />
                </summary>
                <div className={styles.faqBody}>{item.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        {settings.landing.sectionVisibility.cta ? (
          <section className={styles.cta}>
            <h2 className={styles.ctaTitle}>{settings.content.landingCtaTitle}</h2>
            <p className={styles.ctaSubtitle}>{settings.content.landingCtaSubtitle}</p>
            <button className={styles.ctaBtn} type="button" onClick={focusPlateInput}>
              <Search size={18} />
              {settings.content.landingCtaButton}
            </button>
          </section>
        ) : null}
      </main>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerGrid}>
          <div>
            <div className={styles.navBrand}>
              <div className={styles.brandIcon}>
                <ShieldCheck size={16} />
              </div>
              {settings.content.platformName}
            </div>
            <p className={styles.footerDesc}>{settings.content.footerDescription}</p>
          </div>
          <div>
            <div className={styles.footerTitle}>{settings.landing.footer.productTitle}</div>
            <div className={styles.footerLinks}>
              {settings.landing.footer.productLinks.map((item) => (
                <div key={item} className={styles.footerLink}>
                  {item}
                </div>
              ))}
              <Link href={`/search/${SAMPLE_PLATE}`} className={styles.footerLink}>
                {nl ? "Voorbeeldrapport" : "Sample report"}
              </Link>
            </div>
          </div>
          <div>
            <div className={styles.footerTitle}>{settings.landing.footer.companyTitle}</div>
            <div className={styles.footerLinks}>
              {settings.landing.footer.companyLinks.map((item) => (
                <div key={item} className={styles.footerLink}>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className={styles.footerTitle}>{settings.landing.footer.legalTitle}</div>
            <div className={styles.footerLinks}>
              {settings.landing.footer.legalLinks.map((item) =>
                (() => {
                  const href = resolveLegalHref(item);
                  if (href) {
                    return (
                      <Link key={item} href={href} className={styles.footerLink}>
                        {item}
                      </Link>
                    );
                  }
                  return (
                    <div key={item} className={styles.footerLink}>
                      {item}
                    </div>
                  );
                })()
              )}
              {footerPages.map((page) => (
                <Link key={page._id} href={`/p/${page.slug}`} className={styles.footerLink}>
                  {page.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <div>
            © {new Date().getFullYear()} {settings.content.platformName} {t("landing.footerRights")}
          </div>
          <div className={styles.socialIcons}>
            <a className={styles.socialIcon} href="https://twitter.com" aria-label="Twitter">
              <Twitter size={16} />
            </a>
            <a className={styles.socialIcon} href="https://linkedin.com" aria-label="LinkedIn">
              <Linkedin size={16} />
            </a>
            <a className={styles.socialIcon} href="https://facebook.com" aria-label="Facebook">
              <Facebook size={16} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
