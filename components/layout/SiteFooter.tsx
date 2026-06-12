"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useCmsPages } from "@/hooks/useCmsPages";
import { SAMPLE_PLATE } from "@/lib/sample";

const CONTACT_EMAIL = "info@kentekenrapport.com";

// Maps known footer labels (NL + EN) to real routes so admin-managed labels stay clickable.
const ROUTE_BY_LABEL: Record<string, string> = {
  kentekencheck: "/",
  "kenteken check": "/",
  "plate check": "/",
  functies: "/#features",
  features: "/#features",
  voorbeeldrapport: `/search/${SAMPLE_PLATE}`,
  "sample report": `/search/${SAMPLE_PLATE}`,
  prijzen: "/#pricing",
  pricing: "/#pricing",
  contact: `mailto:${CONTACT_EMAIL}`,
  account: "/account",
  inloggen: "/account",
  login: "/account",
  "algemene voorwaarden": "/terms-and-conditions",
  "terms of service": "/terms-and-conditions",
  "terms and conditions": "/terms-and-conditions",
  privacybeleid: "/privacy-policy",
  "privacy policy": "/privacy-policy",
  cookieverklaring: "/cookie-policy",
  "cookie policy": "/cookie-policy",
  cookies: "/cookie-policy"
};

export function resolveFooterHref(label: string): string | null {
  return ROUTE_BY_LABEL[label.trim().toLowerCase()] ?? null;
}

function FooterLink({ label }: { label: string }) {
  const href = resolveFooterHref(label);
  if (!href) {
    return <span className="text-sm text-slate-400">{label}</span>;
  }
  if (href.startsWith("mailto:")) {
    return (
      <a href={href} className="text-sm text-slate-400 transition hover:text-white">
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className="text-sm text-slate-400 transition hover:text-white">
      {label}
    </Link>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { settings } = useSiteSettings();
  const cmsPages = useCmsPages();

  // The landing page renders its own styled footer.
  if (pathname === "/") return null;
  const footerPages = cmsPages.filter(
    (page) => page.showInFooter && page.slug !== "privacy-policy" && page.slug !== "terms-and-conditions"
  );

  return (
    <footer className="border-t border-slate-800 bg-slate-950">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-12 md:grid-cols-4 md:px-10">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-white">
            <ShieldCheck className="h-5 w-5 text-brand-500" />
            {settings.content.platformName}
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">{settings.content.footerDescription}</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="mt-3 inline-block text-sm text-slate-400 transition hover:text-white">
            {CONTACT_EMAIL}
          </a>
        </div>
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            {settings.landing.footer.productTitle}
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {settings.landing.footer.productLinks.map((label) => (
              <FooterLink key={label} label={label} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            {settings.landing.footer.companyTitle}
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {settings.landing.footer.companyLinks.map((label) => (
              <FooterLink key={label} label={label} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            {settings.landing.footer.legalTitle}
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {settings.landing.footer.legalLinks.map((label) => (
              <FooterLink key={label} label={label} />
            ))}
            {footerPages.map((page) => (
              <Link key={page._id} href={`/p/${page.slug}`} className="text-sm text-slate-400 transition hover:text-white">
                {page.title}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-slate-800/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between md:px-10">
          <div>
            © {new Date().getFullYear()} {settings.content.platformName}. {t("landing.footerRights")}
          </div>
          <div>iDEAL · Apple Pay · Google Pay · PayPal · Creditcard</div>
        </div>
      </div>
    </footer>
  );
}
