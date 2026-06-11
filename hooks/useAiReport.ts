"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";

export type AiInsights = {
  summary: string;
  positives: string[];
  risks: string[];
  recommendation: string;
  recommendations: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  purchaseVerdict: "BUY" | "CONSIDER" | "CAUTION" | "AVOID";
};

export type AiValuation = {
  currency: string;
  estimatedValueNow: number;
  estimatedValueMin: number;
  estimatedValueMax: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  factors: string[];
  explanation: string;
};

type AiReport = {
  insights: AiInsights | null;
  valuation: AiValuation | null;
};

// One AI call per plate+locale(+mileage) per browser session, shared by every
// component on the page that wants AI output.
const reportCache = new Map<string, Promise<AiReport>>();

function fetchAiReport(plate: string, locale: string, mileage: number | null): Promise<AiReport> {
  const mileagePart =
    typeof mileage === "number" && Number.isFinite(mileage) ? `&mileage=${encodeURIComponent(String(mileage))}` : "";
  return fetch(`/api/vehicle/${encodeURIComponent(plate)}?lang=${encodeURIComponent(locale)}&include_ai=1${mileagePart}`, {
    cache: "no-store"
  })
    .then(async (response) => {
      if (!response.ok) return { insights: null, valuation: null };
      const payload = (await response.json()) as { aiInsights?: AiInsights; aiValuation?: AiValuation };
      return { insights: payload.aiInsights ?? null, valuation: payload.aiValuation ?? null };
    })
    .catch(() => ({ insights: null, valuation: null }));
}

export function useAiReport(plate: string, mileage: number | null = null) {
  const { locale } = useI18n();
  const [report, setReport] = useState<AiReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!plate) return;
    const key = `${plate}|${locale}|${mileage ?? ""}`;
    let promise = reportCache.get(key);
    if (!promise) {
      promise = fetchAiReport(plate, locale, mileage);
      reportCache.set(key, promise);
    }
    let active = true;
    setLoading(true);
    void promise.then((result) => {
      if (!active) return;
      setReport(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [plate, locale, mileage]);

  return {
    insights: report?.insights ?? null,
    valuation: report?.valuation ?? null,
    loading
  };
}
