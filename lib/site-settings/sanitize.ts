import { defaultSiteSettings, type PublicSiteSettings } from "./defaults";

// The production database can contain settings written by older app versions
// (e.g. footer links stored as {label, href} objects instead of strings).
// Every field is validated against the defaults so schema drift can never
// crash the UI.

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

// PayPal requires amounts like "6.95"; admins may type "6,95" in the dashboard.
function amount(value: unknown, fallback: string): string {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const parsed = Number.parseFloat(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed.toFixed(2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function linkLabel(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.label === "string" && obj.label.trim()) return obj.label;
    if (typeof obj.title === "string" && obj.title.trim()) return obj.title;
  }
  return null;
}

function linkLabels(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const labels = value.map(linkLabel).filter((item): item is string => item !== null);
  return labels.length > 0 ? labels : fallback;
}

// next/image throws for remote hosts that are not whitelisted in next.config.mjs,
// so only local paths and known-allowed hosts pass through.
function heroImageUrl(value: unknown): string {
  const fallback = defaultSiteSettings.content.landingHeroImageUrl;
  if (typeof value !== "string" || !value.trim()) return fallback;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === "storage.googleapis.com") return value;
  } catch {
    // fall through to fallback
  }
  return fallback;
}

function featureItems(
  value: unknown,
  fallback: PublicSiteSettings["landing"]["features"]
): PublicSiteSettings["landing"]["features"] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item, index) => {
      const obj = asRecord(item);
      return {
        id: str(obj.id, `feature-${index}`),
        icon: str(obj.icon, "Sparkles"),
        title: str(obj.title, ""),
        desc: str(obj.desc, "")
      };
    })
    .filter((item) => item.title !== "");
  return items.length > 0 ? items : fallback;
}

function workflowItems(
  value: unknown,
  fallback: PublicSiteSettings["landing"]["workflow"]
): PublicSiteSettings["landing"]["workflow"] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item, index) => {
      const obj = asRecord(item);
      return {
        id: str(obj.id, `step-${index}`),
        title: str(obj.title, ""),
        desc: str(obj.desc, "")
      };
    })
    .filter((item) => item.title !== "");
  return items.length > 0 ? items : fallback;
}

function reviewItems(
  value: unknown,
  fallback: PublicSiteSettings["reviews"]
): PublicSiteSettings["reviews"] {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((item) => {
      const obj = asRecord(item);
      const quote = typeof obj.quote === "string" ? obj.quote.trim() : "";
      const author = typeof obj.author === "string" ? obj.author.trim() : "";
      return { quote, author };
    })
    .filter((item) => item.quote !== "")
    .slice(0, 6);
}

export function sanitizeSiteSettings(payload: unknown): PublicSiteSettings {
  const d = defaultSiteSettings;
  const raw = asRecord(payload);
  const payment = asRecord(raw.payment);
  const lock = asRecord(raw.lockSections);
  const ui = asRecord(raw.ui);
  const content = asRecord(raw.content);
  const landing = asRecord(raw.landing);
  const visibility = asRecord(landing.sectionVisibility);
  const footer = asRecord(landing.footer);
  const seo = asRecord(raw.seo);
  const appearance = asRecord(raw.appearance);
  const email = asRecord(raw.email);

  return {
    paymentEnabled: bool(raw.paymentEnabled, d.paymentEnabled),
    payment: {
      amount: amount(payment.amount, d.payment.amount),
      currency: str(payment.currency, d.payment.currency)
    },
    lockSections: {
      riskOverview: bool(lock.riskOverview, d.lockSections.riskOverview),
      mileageHistory: bool(lock.mileageHistory, d.lockSections.mileageHistory),
      marketAnalysis: bool(lock.marketAnalysis, d.lockSections.marketAnalysis),
      vehicleComparison: bool(lock.vehicleComparison, d.lockSections.vehicleComparison),
      damageHistory: bool(lock.damageHistory, d.lockSections.damageHistory),
      technicalSpecs: bool(lock.technicalSpecs, d.lockSections.technicalSpecs),
      inspectionTimeline: bool(lock.inspectionTimeline, d.lockSections.inspectionTimeline),
      ownershipHistory: bool(lock.ownershipHistory, d.lockSections.ownershipHistory),
      reportDownload: bool(lock.reportDownload, d.lockSections.reportDownload)
    },
    ui: {
      showFeaturesLink: bool(ui.showFeaturesLink, d.ui.showFeaturesLink),
      showSampleLink: bool(ui.showSampleLink, d.ui.showSampleLink),
      showPricingLink: bool(ui.showPricingLink, d.ui.showPricingLink),
      showLoginButton: bool(ui.showLoginButton, d.ui.showLoginButton)
    },
    content: {
      platformName: str(content.platformName, d.content.platformName),
      landingHeroTitleA: str(content.landingHeroTitleA, d.content.landingHeroTitleA),
      landingHeroTitleB: str(content.landingHeroTitleB, d.content.landingHeroTitleB),
      landingHeroSubtitle: str(content.landingHeroSubtitle, d.content.landingHeroSubtitle),
      landingCtaTitle: str(content.landingCtaTitle, d.content.landingCtaTitle),
      landingCtaSubtitle: str(content.landingCtaSubtitle, d.content.landingCtaSubtitle),
      landingCtaButton: str(content.landingCtaButton, d.content.landingCtaButton),
      landingHeroImageUrl: heroImageUrl(content.landingHeroImageUrl),
      footerDescription: str(content.footerDescription, d.content.footerDescription)
    },
    landing: {
      badgeTop: str(landing.badgeTop, d.landing.badgeTop),
      trustedSourcesLabel: str(landing.trustedSourcesLabel, d.landing.trustedSourcesLabel),
      featureSectionLabel: str(landing.featureSectionLabel, d.landing.featureSectionLabel),
      featureSectionTitle: str(landing.featureSectionTitle, d.landing.featureSectionTitle),
      howSectionLabel: str(landing.howSectionLabel, d.landing.howSectionLabel),
      howSectionTitle: str(landing.howSectionTitle, d.landing.howSectionTitle),
      sectionVisibility: {
        features: bool(visibility.features, d.landing.sectionVisibility.features),
        workflow: bool(visibility.workflow, d.landing.sectionVisibility.workflow),
        cta: bool(visibility.cta, d.landing.sectionVisibility.cta)
      },
      features: featureItems(landing.features, d.landing.features),
      workflow: workflowItems(landing.workflow, d.landing.workflow),
      footer: {
        productTitle: str(footer.productTitle, d.landing.footer.productTitle),
        companyTitle: str(footer.companyTitle, d.landing.footer.companyTitle),
        legalTitle: str(footer.legalTitle, d.landing.footer.legalTitle),
        productLinks: linkLabels(footer.productLinks, d.landing.footer.productLinks),
        companyLinks: linkLabels(footer.companyLinks, d.landing.footer.companyLinks),
        legalLinks: linkLabels(footer.legalLinks, d.landing.footer.legalLinks)
      }
    },
    seo: {
      metaTitle: str(seo.metaTitle, d.seo.metaTitle),
      metaDescription: str(seo.metaDescription, d.seo.metaDescription),
      ogImage: typeof seo.ogImage === "string" ? seo.ogImage : d.seo.ogImage,
      googleAnalyticsId: typeof seo.googleAnalyticsId === "string" ? seo.googleAnalyticsId : d.seo.googleAnalyticsId,
      faviconUrl: typeof seo.faviconUrl === "string" ? seo.faviconUrl : d.seo.faviconUrl,
      microsoftClarityId: typeof seo.microsoftClarityId === "string" ? seo.microsoftClarityId : d.seo.microsoftClarityId
    },
    appearance: {
      primaryColor: str(appearance.primaryColor, d.appearance.primaryColor),
      accentColor: str(appearance.accentColor, d.appearance.accentColor),
      fontFamily: str(appearance.fontFamily, d.appearance.fontFamily),
      logoUrl: typeof appearance.logoUrl === "string" ? appearance.logoUrl : d.appearance.logoUrl,
      logoText: str(appearance.logoText, d.appearance.logoText)
    },
    email: {
      fromName: str(email.fromName, d.email.fromName),
      fromAddress: str(email.fromAddress, d.email.fromAddress),
      reportSubjectNl: str(email.reportSubjectNl, d.email.reportSubjectNl),
      reportSubjectEn: str(email.reportSubjectEn, d.email.reportSubjectEn),
      welcomeBodyNl: str(email.welcomeBodyNl, d.email.welcomeBodyNl),
      welcomeBodyEn: str(email.welcomeBodyEn, d.email.welcomeBodyEn)
    },
    reviews: reviewItems(raw.reviews, d.reviews)
  };
}
