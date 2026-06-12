"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useI18n } from "@/lib/i18n/context";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useCmsPages } from "@/hooks/useCmsPages";
import { SAMPLE_PLATE } from "@/lib/sample";
import { ShieldCheck, Menu, X } from "lucide-react";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isUserLoggedIn, setIsUserLoggedIn] = useState(false);
  const { locale, setLocale, t } = useI18n();
  const { settings } = useSiteSettings();
  const cmsPages = useCmsPages();
  const navLinks = [
    settings.ui.showFeaturesLink ? { href: "/#features", label: t("header.features") } : null,
    settings.ui.showSampleLink ? { href: `/search/${SAMPLE_PLATE}`, label: t("header.sample") } : null,
    settings.ui.showPricingLink ? { href: "/#pricing", label: t("header.pricing") } : null
  ].filter(Boolean) as Array<{ href: string; label: string }>;
  const pageLinks = cmsPages.filter((page) => page.showInHeader).map((page) => ({ href: `/p/${page.slug}`, label: page.title }));
  const allLinks = [...navLinks, ...pageLinks];

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/user/session", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { authenticated?: boolean };
        if (active) setIsUserLoggedIn(Boolean(payload.authenticated));
      } catch {
        if (active) setIsUserLoggedIn(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-lg shadow-sm relative">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 md:px-10">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900">
          <ShieldCheck className="h-6 w-6 text-brand-600" />
          {settings.content.platformName}
        </Link>

        <nav className="hidden items-center gap-4 md:flex" aria-label="Primary">
          {allLinks.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-brand-600/10 text-brand-800"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => setLocale(locale === "nl" ? "en" : "nl")}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700"
            >
              {locale === "nl" ? t("header.langEn") : t("header.langNl")}
            </button>
            {settings.ui.showLoginButton ? (
              <Link href="/account" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
                {isUserLoggedIn ? "Dashboard" : t("header.login")}
              </Link>
            ) : null}
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-xl shadow-brand-500/30"
            >
              {t("header.checkVehicle")}
            </Link>
          </div>
          <button
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 md:hidden"
            aria-label={open ? t("header.closeNav") : t("header.openNav")}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden">
          <div className="absolute inset-x-4 top-full z-40 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl">
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">{t("header.menu")}</span>

            <div className="mt-4 flex flex-col gap-2">
              {allLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold",
                    pathname === href ? "bg-brand-50 text-brand-600" : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setLocale(locale === "nl" ? "en" : "nl")}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {locale === "nl" ? t("header.langEn") : t("header.langNl")}
              </button>
              {settings.ui.showLoginButton ? (
                <Link
                  href="/account"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {isUserLoggedIn ? "Dashboard" : t("header.login")}
                </Link>
              ) : null}
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white"
              >
                {t("header.checkVehicle")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
