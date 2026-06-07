"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Mail, MapPin } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

export default function ContactPage() {
  const { locale } = useI18n();
  const nl = locale === "nl";

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> {nl ? "Terug naar home" : "Back to home"}
      </Link>

      <h1 className="text-3xl font-bold text-slate-900">{nl ? "Contact" : "Contact"}</h1>
      <p className="mt-3 max-w-xl text-slate-600">
        {nl
          ? "Vragen over een rapport, een betaling of je account? Neem gerust contact met ons op, we helpen je graag verder."
          : "Questions about a report, a payment, or your account? Feel free to reach out, we are happy to help."}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <a
          href="mailto:info@kentekenrapport.com"
          className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{nl ? "E-mail" : "Email"}</div>
            <div className="mt-0.5 font-semibold text-slate-900 group-hover:text-brand-700">info@kentekenrapport.com</div>
            <div className="mt-1 text-sm text-slate-500">
              {nl ? "Reactie meestal binnen 1 werkdag." : "Usually a reply within 1 business day."}
            </div>
          </div>
        </a>

        <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{nl ? "Adres" : "Address"}</div>
            <div className="mt-0.5 font-semibold text-slate-900">Pastoor Petersstraat 170-46</div>
            <div className="text-sm text-slate-600">5612 LW Eindhoven</div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Building2 className="h-4 w-4" /> {nl ? "Bedrijfsgegevens" : "Company details"}
        </div>
        <dl className="mt-3 grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-slate-500">{nl ? "Handelsnaam" : "Trade name"}</dt>
            <dd className="font-semibold text-slate-900 sm:mt-0.5">Kentekenrapport</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-slate-500">{nl ? "Onderneming" : "Legal entity"}</dt>
            <dd className="font-semibold text-slate-900 sm:mt-0.5">Taxionspot</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-slate-500">KVK</dt>
            <dd className="font-semibold text-slate-900 sm:mt-0.5">65752376</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-slate-500">{nl ? "E-mail" : "Email"}</dt>
            <dd className="font-semibold text-slate-900 sm:mt-0.5">info@kentekenrapport.com</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-400">
          {nl
            ? "Kentekenrapport is de handelsnaam van Taxionspot."
            : "Kentekenrapport is the trade name of Taxionspot."}
        </p>
      </div>
    </div>
  );
}
