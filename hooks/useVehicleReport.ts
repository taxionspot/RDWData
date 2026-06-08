"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import type { ReportSection, SectionId, VehicleReport } from "@/lib/agents/types";

/**
 * Fetch the multi-agent report for a plate (the same `include_ai` endpoint the
 * overview uses; the report is cached server-side for 24h so per-tab calls are
 * cheap). Returns null until loaded; never throws.
 */
export function useVehicleReport(plate: string | null | undefined, mileage?: number | null) {
  const { locale } = useI18n();
  const [report, setReport] = useState<VehicleReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!plate) {
      setReport(null);
      return;
    }
    let active = true;
    setIsLoading(true);
    void (async () => {
      try {
        const mileageParam = typeof mileage === "number" && Number.isFinite(mileage) ? `&mileage=${encodeURIComponent(String(mileage))}` : "";
        const url = `/api/vehicle/${encodeURIComponent(plate)}?lang=${encodeURIComponent(locale)}&include_ai=1${mileageParam}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as { report?: VehicleReport };
        if (active && payload.report) setReport(payload.report);
      } catch {
        // best-effort; the tab still renders its deterministic content
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [plate, locale, mileage]);

  return { report, isLoading };
}

/** Convenience: pick one section out of a report by id. */
export function pickSection(report: VehicleReport | null, id: SectionId): ReportSection | null {
  return report?.sections.find((s) => s.id === id) ?? null;
}
