// Shared types for the multi-agent vehicle report engine.
// Each "aspect" of the report is produced by its own specialist agent; a final
// analyst agent synthesises their output into one verdict + score.

export type Severity = "high" | "medium" | "low" | "info";
export type SectionTone = "success" | "warning" | "danger" | "neutral";
export type AnalystVerdict = "BUY" | "CONSIDER" | "CAUTION" | "AVOID";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type AgentSource = "ai" | "fallback";

export type ReportFinding = {
  label: string;
  detail: string;
  severity: Severity;
};

export type ReportFact = {
  label: string;
  value: string;
};

export type SectionId = "odometer" | "defects" | "compliance" | "value";

export type ReportSection = {
  id: SectionId;
  title: string;
  status: string; // short status/verdict label, e.g. "Logisch", "3 aandachtspunten"
  tone: SectionTone;
  summary: string; // 1-3 sentence plain-language TL;DR
  facts: ReportFact[]; // deterministic key numbers (never AI-invented)
  findings: ReportFinding[];
  source: AgentSource;
};

export type AnalystResult = {
  score: number; // 0-100 overall buy-confidence
  verdict: AnalystVerdict;
  riskLevel: RiskLevel;
  headline: string;
  summary: string;
  positives: string[];
  risks: string[];
  recommendation: string;
  source: AgentSource;
};

export type VehicleReport = {
  analyst: AnalystResult;
  sections: ReportSection[];
  generatedAt: string;
  // "ai" = analyst + all sections from Claude; "fallback" = none; "partial" = mixed.
  aiSource: "ai" | "fallback" | "partial";
};

// Compact, deterministic facts extracted from the localized vehicle profile and
// fed to every agent (the cacheable shared context) plus used for fallbacks.
export type ReportInputs = {
  plate: string;
  locale: "nl" | "en";
  identity: {
    brand: string | null;
    model: string | null;
    year: number | null;
    fuel: string | null;
    body: string | null;
    emissionStandard: string | null;
  };
  odometer: {
    napVerdict: string | null;
    mileageVerdict: string | null;
    estimatedMileageNow: number | null;
    anomalies: string[];
    readings: { date: string | null; km: number }[];
  };
  defects: {
    total: number;
    unique: number;
    top: { desc: string; count: number }[];
    apkExpiry: string | null;
    apkExpired: boolean;
    apkPassChance: number | null;
  };
  compliance: {
    fuel: string | null;
    emissionStandard: string | null;
    year: number | null;
    ageYears: number | null;
    isImported: boolean;
    hasOpenRecall: boolean;
    recalls: string[];
  };
  value: {
    now: number | null;
    min: number | null;
    max: number | null;
    confidence: string | null;
    cataloguePrice: number | null;
    roadTaxQuarter: { min: number; max: number } | null;
    fuelEstMonth: number | null;
    ageYears: number | null;
    mileage: number | null;
    owners: number | null;
  };
};
