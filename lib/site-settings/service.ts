import { connectMongo } from "@/lib/db/mongodb";
import { SiteSettingsModel } from "@/models/SiteSettings";
import { defaultSiteSettings, type PublicSiteSettings } from "./defaults";
import { sanitizeSiteSettings } from "./sanitize";

// Old shipped defaults that may still live in the database. When a stored value
// is byte-identical to one of these, the admin never changed it, so the new
// default is applied instead. Admin-customized values are left untouched.
const LEGACY_HERO_IMAGE =
  "https://storage.googleapis.com/banani-generated-images/generated-images/ad953e96-ea70-4d4d-ab60-fc21c7b01fb4.jpg";
const LEGACY_CTA_SUBTITLE = "Sluit je aan bij meer dan 1.000.000 slimme kopers die hun auto checkten voor de deal.";
const LEGACY_BADGE_TOP = "Het #1 beoordeelde voertuiggeschiedenisplatform";
const LEGACY_FOOTER_DESCRIPTION = "Het meest complete en transparante voertuiggeschiedenisplatform voor kopers en dealers.";
const LEGACY_PRODUCT_LINKS = ["Sample Report", "Pricing", "Features", "For Dealers"];
const LEGACY_COMPANY_LINKS = ["About Us", "Careers", "Contact", "Partners"];
const LEGACY_LEGAL_LINKS = ["Terms of Service", "Privacy Policy", "Cookie Policy", "Data Sources"];
const LEGACY_FROM_ADDRESS = "noreply@kentekenrapport.nl";

function sameArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function applyLegacyDefaults(settings: PublicSiteSettings): PublicSiteSettings {
  if (settings.content.landingHeroImageUrl === LEGACY_HERO_IMAGE) {
    settings.content.landingHeroImageUrl = defaultSiteSettings.content.landingHeroImageUrl;
  }
  if (settings.content.landingCtaSubtitle === LEGACY_CTA_SUBTITLE) {
    settings.content.landingCtaSubtitle = defaultSiteSettings.content.landingCtaSubtitle;
  }
  if (settings.content.footerDescription === LEGACY_FOOTER_DESCRIPTION) {
    settings.content.footerDescription = defaultSiteSettings.content.footerDescription;
  }
  if (settings.landing.badgeTop === LEGACY_BADGE_TOP) {
    settings.landing.badgeTop = defaultSiteSettings.landing.badgeTop;
  }
  const footer = settings.landing.footer;
  if (sameArray(footer.productLinks, LEGACY_PRODUCT_LINKS)) {
    footer.productLinks = defaultSiteSettings.landing.footer.productLinks;
  }
  if (sameArray(footer.companyLinks, LEGACY_COMPANY_LINKS)) {
    footer.companyLinks = defaultSiteSettings.landing.footer.companyLinks;
  }
  if (sameArray(footer.legalLinks, LEGACY_LEGAL_LINKS)) {
    footer.legalLinks = defaultSiteSettings.landing.footer.legalLinks;
  }
  if (footer.companyTitle === "Company") footer.companyTitle = defaultSiteSettings.landing.footer.companyTitle;
  if (footer.legalTitle === "Legal") footer.legalTitle = defaultSiteSettings.landing.footer.legalTitle;
  if (settings.email.fromAddress === LEGACY_FROM_ADDRESS) {
    settings.email.fromAddress = defaultSiteSettings.email.fromAddress;
    settings.email.fromName = defaultSiteSettings.email.fromName;
  }
  return settings;
}

function mergedSettings(doc: Record<string, unknown>): PublicSiteSettings {
  // Validate every stored field against the defaults (the database can hold
  // shapes written by older app versions), then migrate untouched legacy values.
  return applyLegacyDefaults(sanitizeSiteSettings(doc));
}

export async function getSiteSettings(): Promise<PublicSiteSettings> {
  await connectMongo();
  const doc = await SiteSettingsModel.findOne({ key: "global" }).lean();
  if (!doc) {
    await SiteSettingsModel.create({ key: "global", ...defaultSiteSettings });
    return defaultSiteSettings;
  }
  return mergedSettings(doc as unknown as Record<string, unknown>);
}

export async function upsertSiteSettings(input: Partial<PublicSiteSettings>): Promise<PublicSiteSettings> {
  const current = await getSiteSettings();
  const next: PublicSiteSettings = {
    paymentEnabled: input.paymentEnabled ?? current.paymentEnabled,
    payment: { ...current.payment, ...(input.payment ?? {}) },
    lockSections: { ...current.lockSections, ...(input.lockSections ?? {}) },
    ui: { ...current.ui, ...(input.ui ?? {}) },
    content: { ...current.content, ...(input.content ?? {}) },
    landing: {
      ...current.landing,
      ...(input.landing ?? {}),
      sectionVisibility: {
        ...current.landing.sectionVisibility,
        ...(input.landing?.sectionVisibility ?? {})
      },
      footer: {
        ...current.landing.footer,
        ...(input.landing?.footer ?? {})
      }
    },
    seo: { ...current.seo, ...(input.seo ?? {}) },
    appearance: { ...current.appearance, ...(input.appearance ?? {}) },
    email: { ...current.email, ...(input.email ?? {}) }
  };

  await SiteSettingsModel.updateOne({ key: "global" }, { $set: { ...next } }, { upsert: true });
  return next;
}
