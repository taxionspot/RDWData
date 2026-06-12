"use client";

import Link from "next/link";
import { Check, ArrowRight, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function PricingPage() {
  const { locale } = useI18n();
  const { settings } = useSiteSettings();
  const nl = locale === "nl";
  const amount = nl ? settings.payment.amount.replace(".", ",") : settings.payment.amount;

  const features = nl
    ? [
        "Volledig voertuigprofiel via officiële RDW-data",
        "APK-historie, gebreken en terugroepacties",
        "Kilometerstand-analyse en tellerstandoordeel",
        "Marktwaarde-indicatie en kosteninschatting",
        "AI-aankoopadvies met sterke punten en risico's",
        "PDF-rapport: direct downloaden én per e-mail"
      ]
    : [
        "Complete vehicle profile from official RDW data",
        "APK history, defects and recalls",
        "Mileage analysis and odometer judgment",
        "Market value estimate and running costs",
        "AI purchase advice with strengths and risks",
        "PDF report: instant download and email delivery"
      ];

  return (
    <div>
      <div className="border-b border-slate-100 bg-white py-14 text-center">
        <span className="section-label">{nl ? "Prijzen" : "Pricing"}</span>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
          {nl ? "Eén duidelijke prijs" : "One clear price"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-slate-500">
          {nl
            ? "Gratis basischeck voor elk kenteken. Betaal alleen voor het volledige rapport — geen abonnement."
            : "Free basic check for every plate. Pay only for the full report — no subscription."}
        </p>
      </div>

      <div className="bg-slate-50 py-14">
        <div className="mx-auto max-w-3xl px-6">
          <div className="grid gap-5 md:grid-cols-2">
            <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-card">
              <h3 className="font-display text-lg font-bold text-slate-900">{nl ? "Gratis check" : "Free check"}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                {nl
                  ? "Direct inzicht in de basisgegevens van elk Nederlands kenteken."
                  : "Instant insight into the basics of any Dutch license plate."}
              </p>
              <div className="mt-5 flex items-end gap-1">
                <span className="font-display text-4xl font-extrabold text-slate-900">€ 0</span>
              </div>
              <hr className="my-5 h-px border-0 bg-slate-100" />
              <ul className="flex-1 space-y-3">
                {(nl
                  ? ["Onbeperkt kentekens opzoeken", "Voertuigprofiel en specificaties", "APK-status en vervaldatum", "Openstaande terugroepacties"]
                  : ["Unlimited plate lookups", "Vehicle profile and specs", "APK status and expiry date", "Open recalls"]
                ).map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" strokeWidth={2.5} />
                    <span className="text-slate-600">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/"
                className="group/btn mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-5 py-3 text-sm font-bold text-brand-700 shadow-sm transition-all hover:bg-brand-100"
              >
                {nl ? "Start gratis check" : "Start free check"}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover/btn:translate-x-0.5" />
              </Link>
            </article>

            <article className="relative flex flex-col overflow-hidden rounded-2xl border border-brand-700 bg-brand-600 p-7 shadow-card">
              <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-brand-300 via-violet-400 to-sky-400" />
              <span className="absolute right-5 top-5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
                {nl ? "Volledig rapport" : "Full report"}
              </span>
              <h3 className="font-display text-lg font-bold text-white">{nl ? "Kentekenrapport" : "Vehicle report"}</h3>
              <p className="mt-1 text-sm leading-relaxed text-brand-200">
                {nl
                  ? "Alle premium inzichten voor één kenteken, eenmalig."
                  : "All premium insights for one plate, one-time."}
              </p>
              <div className="mt-5 flex items-end gap-1">
                <span className="font-display text-4xl font-extrabold text-white">€ {amount}</span>
                <span className="mb-1 text-sm text-brand-200">{nl ? "per kenteken" : "per plate"}</span>
              </div>
              <hr className="my-5 h-px border-0 bg-white/10" />
              <ul className="flex-1 space-y-3">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-200" strokeWidth={2.5} />
                    <span className="text-brand-100">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/"
                className="group/btn mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-700 shadow-sm transition-all hover:bg-brand-50"
              >
                {nl ? "Check een kenteken" : "Check a plate"}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover/btn:translate-x-0.5" />
              </Link>
            </article>
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-slate-400">
            <ShieldCheck className="h-4 w-4" />
            {nl
              ? "Veilig betalen met iDEAL, Apple Pay, Google Pay, PayPal of creditcard. Geen abonnement, geen verborgen kosten."
              : "Pay securely with iDEAL, Apple Pay, Google Pay, PayPal or card. No subscription, no hidden fees."}
          </p>
        </div>
      </div>

      <div className="flex justify-center border-t border-slate-100 bg-white py-6">
        <Link href="/" className="text-sm text-slate-400 transition hover:text-slate-700">
          {nl ? "← Terug naar zoeken" : "← Back to search"}
        </Link>
      </div>
    </div>
  );
}
