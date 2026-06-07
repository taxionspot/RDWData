import { connectMongo } from "@/lib/db/mongodb";
import { VehicleReportCacheModel } from "@/models/VehicleReportCache";
import type { ClaudeInsightResult, ClaudeValuationResult, ClaudeVehicleReportResult } from "@/lib/api/claude";
import { analystAgent } from "./analyst";
import { buildSharedContext, extractInputs } from "./context";
import { complianceAgent, defectsAgent, odometerAgent, valueAgent } from "./specialists";
import type { ReportInputs, VehicleReport } from "./types";

export type { VehicleReport } from "./types";

const REPORT_TTL_MS = 24 * 60 * 60 * 1000;
// Bump when agent prompts / assembly change so stale reports are ignored.
const REPORT_VERSION = "agents-v1";

function cacheKey(plate: string, locale: "nl" | "en", mileage: number | null): string {
  return `${plate}:${locale}:${mileage ?? "na"}:${REPORT_VERSION}`;
}

/**
 * Run the multi-agent engine: four specialist agents in parallel, then the lead
 * analyst. Never throws — each agent falls back to deterministic output, so the
 * report is always fully populated even with no API key or a Claude outage.
 */
export async function generateVehicleReport(args: { plate: string; locale: "nl" | "en"; vehicleData: unknown; debug?: boolean }): Promise<VehicleReport> {
  const inputs = extractInputs(args.plate, args.locale, args.vehicleData);
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const debug = args.debug ?? (process.env.NODE_ENV !== "production" && process.env.ANTHROPIC_DEBUG === "true");
  const shared = buildSharedContext(inputs);

  const sections = await Promise.all([
    odometerAgent(apiKey, shared, inputs, debug),
    defectsAgent(apiKey, shared, inputs, debug),
    complianceAgent(apiKey, shared, inputs, debug),
    valueAgent(apiKey, shared, inputs, debug)
  ]);

  const analyst = await analystAgent(apiKey, shared, inputs, sections, debug);

  const aiCount = [...sections.map((s) => s.source), analyst.source].filter((s) => s === "ai").length;
  const aiSource = aiCount === 0 ? "fallback" : aiCount === sections.length + 1 ? "ai" : "partial";

  return { analyst, sections, generatedAt: new Date().toISOString(), aiSource };
}

/** Cached wrapper. Never throws — returns a freshly generated report on any cache error. */
export async function getOrGenerateVehicleReport(args: { plate: string; locale: "nl" | "en"; mileage: number | null; vehicleData: unknown }): Promise<VehicleReport> {
  const key = cacheKey(args.plate, args.locale, args.mileage);

  try {
    await connectMongo();
    const cached = await VehicleReportCacheModel.findById(key).lean<{ report?: VehicleReport; expiresAt?: Date } | null>();
    if (cached?.report && cached.expiresAt && cached.expiresAt.getTime() > Date.now()) {
      return cached.report;
    }
  } catch {
    // Cache unavailable — generate live.
  }

  const report = await generateVehicleReport({ plate: args.plate, locale: args.locale, vehicleData: args.vehicleData });

  // Only persist reports where at least the analyst came from Claude — never
  // cache a pure fallback (so a transient outage doesn't pin generic text 24h).
  if (report.aiSource !== "fallback") {
    try {
      const now = Date.now();
      await VehicleReportCacheModel.findByIdAndUpdate(
        key,
        { _id: key, plate: args.plate, locale: args.locale, report, cachedAt: new Date(now), expiresAt: new Date(now + REPORT_TTL_MS) },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch {
      // Best-effort cache write.
    }
  }

  return report;
}

/**
 * Map the rich multi-agent report onto the legacy {insights, valuation} shape the
 * current UI/PDF still consume, so they immediately benefit from real synthesis.
 */
export function reportToLegacy(report: VehicleReport, plate: string, locale: "nl" | "en", vehicleData: unknown): ClaudeVehicleReportResult {
  const inputs: ReportInputs = extractInputs(plate, locale, vehicleData);
  const a = report.analyst;
  const valueSection = report.sections.find((s) => s.id === "value");

  const insights: ClaudeInsightResult = {
    summary: a.summary,
    positives: a.positives.slice(0, 6),
    risks: a.risks.slice(0, 6),
    recommendation: a.recommendation,
    purchaseVerdict: a.verdict,
    riskLevel: a.riskLevel,
    recommendations: [a.recommendation].filter(Boolean).slice(0, 8)
  };

  const confidence = inputs.value.confidence === "HIGH" || inputs.value.confidence === "MEDIUM" ? inputs.value.confidence : "LOW";
  const valuation: ClaudeValuationResult = {
    currency: "EUR",
    estimatedValueNow: inputs.value.now ?? 0,
    estimatedValueMin: inputs.value.min ?? 0,
    estimatedValueMax: inputs.value.max ?? 0,
    confidence,
    factors: report.sections.map((s) => `${s.title}: ${s.status}`).slice(0, 12),
    explanation: valueSection?.summary ?? a.summary
  };

  return { insights, valuation };
}
