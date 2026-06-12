import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { StoreProvider } from "@/lib/store/provider";
import { I18nProvider } from "@/lib/i18n/context";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AnalyticsScripts } from "@/components/layout/AnalyticsScripts";
import { COOKIEBOT_CBID, GTM_ID } from "@/lib/analytics/config";
import "./globals.css";

// Google Consent Mode v2 defaults. Must run before Cookiebot and GTM so every
// tag starts in "denied" until the visitor gives consent via the banner.
const consentModeDefaults = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag("consent", "default", {
  ad_personalization: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  analytics_storage: "denied",
  functionality_storage: "denied",
  personalization_storage: "denied",
  security_storage: "granted",
  wait_for_update: 500
});
gtag("set", "ads_data_redaction", true);
gtag("set", "url_passthrough", false);`;

const gtmSnippet = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`;

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const headingFont = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap"
});

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://kentekenrapport.com").replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Kentekenrapport - Kentekencheck & voertuighistorie",
    template: "%s | Kentekenrapport"
  },
  description:
    "Directe Nederlandse kentekencheck. Voertuigprofiel, APK-status, kilometerhistorie, terugroepacties, marktwaarde en AI-aankoopadvies op basis van officiële RDW-data.",
  keywords: ["kenteken", "kentekencheck", "RDW", "APK", "kilometerstand", "voertuighistorie", "kenteken rapport"],
  openGraph: {
    title: "Kentekenrapport - Kentekencheck & voertuighistorie",
    description:
      "Check elk Nederlands kenteken: APK-status, kilometerhistorie, terugroepacties, marktwaarde en AI-aankoopadvies.",
    type: "website",
    url: BASE_URL,
    siteName: "Kentekenrapport"
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${bodyFont.variable} ${headingFont.variable} bg-slate-50 font-sans text-slate-900 antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: consentModeDefaults }} />
        {/* Cookiebot must load synchronously, before GTM, for auto-blocking to work. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          id="Cookiebot"
          src="https://consent.cookiebot.com/uc.js"
          data-cbid={COOKIEBOT_CBID}
          data-blockingmode="auto"
        />
        {/* Google Tag Manager */}
        <script dangerouslySetInnerHTML={{ __html: gtmSnippet }} />
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        {/* End Google Tag Manager */}
        <StoreProvider>
          <I18nProvider>
            <AnalyticsScripts />
            <SiteHeader />
            <div className="min-h-screen">{children}</div>
            <SiteFooter />
          </I18nProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
