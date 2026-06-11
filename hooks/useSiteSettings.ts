"use client";

import { useEffect, useState } from "react";
import { defaultSiteSettings, type PublicSiteSettings } from "@/lib/site-settings/defaults";

let cache: PublicSiteSettings | null = null;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Footer links have historically been stored both as plain strings and as
 * `{ label, href }` objects (written by different app versions against the same
 * database). Rendering an object as a React child crashes the whole page, so
 * normalize every entry to a string label here.
 */
function toLinkLabel(item: unknown): string {
  if (typeof item === "string") return item;
  if (isObject(item) && typeof item.label === "string") return item.label;
  return "";
}

function toLinkLabels(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const labels = value.map(toLinkLabel).filter(Boolean);
  return labels.length > 0 ? labels : fallback;
}

/**
 * Defensively merge the fetched payload over the defaults. The stored settings
 * document can be older or newer than this app version (other branches write to
 * the same database), so never trust its shape blindly — a missing or malformed
 * nested key must degrade to the default, never crash the UI.
 */
function sanitizeSettings(payload: unknown): PublicSiteSettings {
  const d = defaultSiteSettings;
  if (!isObject(payload)) return d;
  const p = payload as Record<string, unknown>;

  const payment = isObject(p.payment) ? p.payment : {};
  const lockSections = isObject(p.lockSections) ? p.lockSections : {};
  const ui = isObject(p.ui) ? p.ui : {};
  const content = isObject(p.content) ? p.content : {};
  const landing = isObject(p.landing) ? p.landing : {};
  const sectionVisibility = isObject(landing.sectionVisibility) ? landing.sectionVisibility : {};
  const footer = isObject(landing.footer) ? landing.footer : {};
  const seo = isObject(p.seo) ? p.seo : {};
  const appearance = isObject(p.appearance) ? p.appearance : {};
  const email = isObject(p.email) ? p.email : {};

  return {
    paymentEnabled: typeof p.paymentEnabled === "boolean" ? p.paymentEnabled : d.paymentEnabled,
    payment: {
      amount: typeof payment.amount === "string" && payment.amount ? payment.amount : d.payment.amount,
      currency: typeof payment.currency === "string" && payment.currency ? payment.currency : d.payment.currency
    },
    lockSections: { ...d.lockSections, ...lockSections } as PublicSiteSettings["lockSections"],
    ui: { ...d.ui, ...ui } as PublicSiteSettings["ui"],
    content: { ...d.content, ...content } as PublicSiteSettings["content"],
    landing: {
      ...d.landing,
      ...landing,
      sectionVisibility: { ...d.landing.sectionVisibility, ...sectionVisibility } as PublicSiteSettings["landing"]["sectionVisibility"],
      features: Array.isArray(landing.features) && landing.features.every(isObject)
        ? (landing.features as PublicSiteSettings["landing"]["features"])
        : d.landing.features,
      workflow: Array.isArray(landing.workflow) && landing.workflow.every(isObject)
        ? (landing.workflow as PublicSiteSettings["landing"]["workflow"])
        : d.landing.workflow,
      footer: {
        productTitle: typeof footer.productTitle === "string" ? footer.productTitle : d.landing.footer.productTitle,
        companyTitle: typeof footer.companyTitle === "string" ? footer.companyTitle : d.landing.footer.companyTitle,
        legalTitle: typeof footer.legalTitle === "string" ? footer.legalTitle : d.landing.footer.legalTitle,
        productLinks: toLinkLabels(footer.productLinks, d.landing.footer.productLinks),
        companyLinks: toLinkLabels(footer.companyLinks, d.landing.footer.companyLinks),
        legalLinks: toLinkLabels(footer.legalLinks, d.landing.footer.legalLinks)
      }
    },
    seo: { ...d.seo, ...seo } as PublicSiteSettings["seo"],
    appearance: { ...d.appearance, ...appearance } as PublicSiteSettings["appearance"],
    email: { ...d.email, ...email } as PublicSiteSettings["email"]
  };
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<PublicSiteSettings>(cache ?? defaultSiteSettings);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let active = true;
    if (cache) {
      setLoading(false);
      return;
    }
    void fetch("/api/site/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load site settings.");
        return (await response.json()) as unknown;
      })
      .then((payload) => {
        const sanitized = sanitizeSettings(payload);
        cache = sanitized;
        if (!active) return;
        setSettings(sanitized);
      })
      .catch(() => {
        if (!active) return;
        setSettings(defaultSiteSettings);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { settings, loading };
}
