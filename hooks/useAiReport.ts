"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { onPlateAccessChanged } from "@/lib/payments/access";

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
    // The server only returns AI content for paid plates. After an unlock the
    // cached "empty" response is stale, so refetch once access is granted.
    // If AI is still being generated (prewarm in flight or cache miss), poll
    // every 1.5s up to 20s rather than showing the deterministic fallback
    // immediately. The loading state stays true the whole time so the UI shows
    // a reassuring spinner, not a premature "no data" screen.
    const pollIntervalMs = 1500;
    const pollMaxMs = 20000;
    const pollTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

    const stopPolling = () => {
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const startPolling = () => {
      stopPolling();
      const startedAt = Date.now();

      const poll = () => {
        if (!active) return;
        if (Date.now() - startedAt >= pollMaxMs) {
          // Timed out: accept whatever the last fetch returned (may be null).
          reportCache.delete(key);
          const final = fetchAiReport(plate, locale, mileage);
          reportCache.set(key, final);
          void final.then((result) => {
            if (!active) return;
            setReport(result);
            setLoading(false);
          });
          return;
        }
        reportCache.delete(key);
        const attempt = fetchAiReport(plate, locale, mileage);
        reportCache.set(key, attempt);
        void attempt.then((result) => {
          if (!active) return;
          if (result.insights !== null) {
            // Cache is warm: deliver immediately.
            setReport(result);
            setLoading(false);
          } else {
            // Cache still cold: keep loading, schedule another poll.
            pollTimerRef.current = setTimeout(poll, pollIntervalMs);
          }
        });
      };

      // First poll after one interval so the just-fired prewarm has a moment to land.
      pollTimerRef.current = setTimeout(poll, pollIntervalMs);
    };

    const unsubscribe = onPlateAccessChanged(plate, (paid) => {
      if (!paid) return;
      setLoading(true);
      // Kick off an immediate refetch; if insights are still null (prewarm
      // still running), enter the polling loop instead of settling for null.
      reportCache.delete(key);
      const fresh = fetchAiReport(plate, locale, mileage);
      reportCache.set(key, fresh);
      void fresh.then((result) => {
        if (!active) return;
        if (result.insights !== null) {
          setReport(result);
          setLoading(false);
        } else {
          // Prewarm may still be running; poll until ready.
          startPolling();
        }
      });
    });

    return () => {
      active = false;
      stopPolling();
      unsubscribe();
    };
  }, [plate, locale, mileage]);

  return {
    insights: report?.insights ?? null,
    valuation: report?.valuation ?? null,
    loading
  };
}
