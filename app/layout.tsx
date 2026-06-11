import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { StoreProvider } from "@/lib/store/provider";
import { I18nProvider } from "@/lib/i18n/context";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { AnalyticsScripts } from "@/components/layout/AnalyticsScripts";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "PlateIntel - Nederlandse Kentekeninzichten",
  description:
    "Directe Nederlandse kentekencheck. Krijg voertuigprofiel, APK-status, inspectiehistorie en terugroepmeldingen op basis van RDW open data.",
  keywords: ["kenteken", "RDW", "license plate", "Netherlands", "APK", "vehicle lookup"],
  openGraph: {
    title: "PlateIntel - Nederlandse Voertuiginzichten",
    description: "Directe Nederlandse voertuigchecks op basis van RDW open data.",
    type: "website"
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
        <StoreProvider>
          <I18nProvider>
            <AnalyticsScripts />
            <SiteHeader />
            <div className="min-h-screen">{children}</div>
          </I18nProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
