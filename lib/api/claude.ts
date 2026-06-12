import Anthropic from "@anthropic-ai/sdk";
import { alignValuationWithFormula } from "@/lib/api/market-value";

export type ClaudeInsightResult = {
  summary: string;
  positives: string[];
  risks: string[];
  recommendation: string;
  purchaseVerdict: "BUY" | "CONSIDER" | "CAUTION" | "AVOID";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  recommendations: string[];
};

export type ClaudeValuationResult = {
  currency: "EUR";
  estimatedValueNow: number;
  estimatedValueMin: number;
  estimatedValueMax: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  factors: string[];
  explanation: string;
};

export type ClaudeVehicleReportResult = {
  insights: ClaudeInsightResult;
  valuation: ClaudeValuationResult;
};

export type ClaudeNegotiationCopilotResult = {
  script: string;
  offerStrategy: string;
  walkAwayReason: string;
  repairReserveAdvice: string;
  talkingPoints: string[];
};

function getRequiredAnthropicEnv() {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const debugEnabled = process.env.NODE_ENV !== "production" && process.env.ANTHROPIC_DEBUG === "true";
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY.");
  }
  return { apiKey, model, debugEnabled };
}

function safeTruncate(value: string, max = 7000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const textParts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const maybeText = (part as { type?: string; text?: string }).text;
    const type = (part as { type?: string }).type;
    if (type === "text" && typeof maybeText === "string") {
      textParts.push(maybeText);
    }
  }
  return textParts.join("\n").trim();
}

function parseReportCandidate(raw: string): ClaudeVehicleReportResult | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ClaudeVehicleReportResult>;
    if (!parsed || typeof parsed !== "object") return null;
    const rawInsights = (parsed.insights ?? {}) as Partial<ClaudeInsightResult>;
    const rawValuation = (parsed.valuation ?? {}) as Partial<ClaudeValuationResult>;
    const purchaseVerdict: ClaudeInsightResult["purchaseVerdict"] =
      rawInsights.purchaseVerdict === "BUY" ||
      rawInsights.purchaseVerdict === "CONSIDER" ||
      rawInsights.purchaseVerdict === "CAUTION"
        ? rawInsights.purchaseVerdict
        : "AVOID";
    const riskLevel: ClaudeInsightResult["riskLevel"] =
      rawInsights.riskLevel === "LOW" || rawInsights.riskLevel === "MEDIUM" ? rawInsights.riskLevel : "HIGH";

    const insights: ClaudeInsightResult = {
      summary: typeof rawInsights.summary === "string" ? rawInsights.summary : "",
      positives: Array.isArray(rawInsights.positives) ? rawInsights.positives.filter((x): x is string => typeof x === "string") : [],
      risks: Array.isArray(rawInsights.risks) ? rawInsights.risks.filter((x): x is string => typeof x === "string") : [],
      recommendation: typeof rawInsights.recommendation === "string" ? rawInsights.recommendation : "",
      purchaseVerdict,
      riskLevel,
      recommendations: Array.isArray(rawInsights.recommendations)
        ? rawInsights.recommendations.filter((x): x is string => typeof x === "string")
        : []
    };

    const now = Number(rawValuation.estimatedValueNow);
    const min = Number(rawValuation.estimatedValueMin);
    const max = Number(rawValuation.estimatedValueMax);
    const confidence = rawValuation.confidence === "HIGH" || rawValuation.confidence === "MEDIUM" ? rawValuation.confidence : "LOW";
    const valuation: ClaudeValuationResult = {
      currency: "EUR",
      estimatedValueNow: Number.isFinite(now) ? Math.max(0, Math.round(now)) : 0,
      estimatedValueMin: Number.isFinite(min) ? Math.max(0, Math.round(min)) : 0,
      estimatedValueMax: Number.isFinite(max) ? Math.max(0, Math.round(max)) : 0,
      confidence,
      factors: Array.isArray(rawValuation.factors) ? rawValuation.factors.filter((x): x is string => typeof x === "string").slice(0, 12) : [],
      explanation: typeof rawValuation.explanation === "string" ? rawValuation.explanation : ""
    };

    if (!insights.summary && !insights.recommendation && insights.positives.length === 0 && insights.risks.length === 0) return null;
    if (valuation.estimatedValueNow <= 0) return null;
    if (valuation.estimatedValueMin <= 0 || valuation.estimatedValueMax <= 0) return null;

    const normalizedMin = Math.min(valuation.estimatedValueMin, valuation.estimatedValueNow, valuation.estimatedValueMax);
    const normalizedMax = Math.max(valuation.estimatedValueMin, valuation.estimatedValueNow, valuation.estimatedValueMax);
    const normalizedNow = Math.min(Math.max(valuation.estimatedValueNow, normalizedMin), normalizedMax);
    return {
      insights: {
        ...insights,
        positives: insights.positives.slice(0, 6),
        risks: insights.risks.slice(0, 6),
        recommendations: insights.recommendations.slice(0, 8)
      },
      valuation: {
        ...valuation,
        estimatedValueNow: normalizedNow,
        estimatedValueMin: normalizedMin,
        estimatedValueMax: normalizedMax
      }
    };
  } catch {
    return null;
  }
}

function parseClaudeJson(text: string): ClaudeVehicleReportResult | null {
  const direct = parseReportCandidate(text);
  if (direct) return direct;

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    const fromFence = parseReportCandidate(fenceMatch[1].trim());
    if (fromFence) return fromFence;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const extracted = parseReportCandidate(text.slice(start, end + 1));
    if (extracted) return extracted;
  }
  return null;
}

function buildAnthropicPrompt(args: { plate: string; locale: "nl" | "en"; dataJson: string }) {
  const isNl = args.locale === "nl";
  return isNl
    ? `Analyseer dit volledige RDW-voertuigprofiel voor kenteken ${args.plate} en geef AI aankoopadvies + realistische marktwaardering.
Geef exact dit JSON-formaat terug:
{
  "insights": {
    "summary": "...",
    "positives": ["..."],
    "risks": ["..."],
    "recommendation": "...",
    "purchaseVerdict": "BUY|CONSIDER|CAUTION|AVOID",
    "riskLevel": "LOW|MEDIUM|HIGH",
    "recommendations": ["..."]
  },
  "valuation": {
    "currency": "EUR",
    "estimatedValueNow": 0,
    "estimatedValueMin": 0,
    "estimatedValueMax": 0,
    "confidence": "LOW|MEDIUM|HIGH",
    "factors": ["..."],
    "explanation": "..."
  }
}
Regels:
- Baseer analyse op alle data (identiteit, APK/defecten, recalls, onderhoudsrisico, kilometrage-signalen, markt/fuel/gewicht).
- summary 120-220 woorden, concreet en overtuigend
- positives max 6, risks max 6, recommendations max 8, factors max 12
- GEBRUIK voor estimatedValueNow, estimatedValueMin en estimatedValueMax EXACT de waarden uit enriched.estimatedValueNow, enriched.estimatedValueMin en enriched.estimatedValueMax in DATA (onze eigen taxatieformule). Verzin NOOIT eigen bedragen. Leg in explanation en factors uit welke factoren deze waarde verklaren.
- estimatedValueMin <= estimatedValueNow <= estimatedValueMax
- waardes als gehele EUR getallen
- recommendation moet expliciet advies geven: kopen/wachten/onderhandelen/extra inspectie
- alleen JSON, geen markdown, geen extra tekst

DATA:
${args.dataJson}`
    : `Analyze this full RDW vehicle profile for plate ${args.plate} and return AI purchase guidance plus realistic market valuation.
Return exactly this JSON shape:
{
  "insights": {
    "summary": "...",
    "positives": ["..."],
    "risks": ["..."],
    "recommendation": "...",
    "purchaseVerdict": "BUY|CONSIDER|CAUTION|AVOID",
    "riskLevel": "LOW|MEDIUM|HIGH",
    "recommendations": ["..."]
  },
  "valuation": {
    "currency": "EUR",
    "estimatedValueNow": 0,
    "estimatedValueMin": 0,
    "estimatedValueMax": 0,
    "confidence": "LOW|MEDIUM|HIGH",
    "factors": ["..."],
    "explanation": "..."
  }
}
Rules:
- Use all available data (identity, inspections/defects, recalls, maintenance risk, mileage signals, market/fuel/weight indicators).
- summary 120-220 words, concrete and convincing
- positives max 6, risks max 6, recommendations max 8, factors max 12
- USE the exact values from enriched.estimatedValueNow, enriched.estimatedValueMin and enriched.estimatedValueMax in DATA (our own valuation formula) for estimatedValueNow/Min/Max. NEVER invent your own amounts. Use explanation and factors to explain what drives this value.
- estimatedValueMin <= estimatedValueNow <= estimatedValueMax
- integer EUR values
- recommendation must explicitly guide buy/wait/negotiate/inspect
- JSON only, no markdown, no extra text

DATA:
${args.dataJson}`;
}

async function callAnthropic(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  debugEnabled: boolean;
}) {
  try {
    const client = new Anthropic({
      apiKey: args.apiKey,
      maxRetries: 2,
      logLevel: args.debugEnabled ? "debug" : "warn"
    });
    const message = await client.messages.create({
      model: args.model,
      max_tokens: 1800,
      temperature: 0.1,
      system: args.systemPrompt,
      messages: [{ role: "user", content: args.userPrompt }]
    });
    return {
      content: message.content,
      requestId: message._request_id
    } as const;
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Anthropic SDK error (${error.status ?? "N/A"} ${error.name}): ${error.message}`);
    }
    throw error;
  }
}

/**
 * Hard guarantee that the valuation amounts equal our own formula, whatever
 * the model returned: the prompt instructs Claude to copy them, this enforces
 * it. See alignValuationWithFormula.
 */
function withFormulaValuation(report: ClaudeVehicleReportResult, vehicleData: unknown): ClaudeVehicleReportResult {
  const aligned = alignValuationWithFormula((vehicleData ?? {}) as Record<string, unknown>, report.valuation);
  return aligned ? { ...report, valuation: aligned } : report;
}

export async function generateVehicleAiReport(args: {
  plate: string;
  locale: "nl" | "en";
  vehicleData: unknown;
}): Promise<ClaudeVehicleReportResult> {
  const { apiKey, model, debugEnabled } = getRequiredAnthropicEnv();
  const dataJson = safeTruncate(JSON.stringify(args.vehicleData, null, 2), 16000);
  const isNl = args.locale === "nl";
  const systemPrompt = isNl
    ? "Je bent een senior auto-inspectie analist en voertuigwaarderingsspecialist. Antwoord uitsluitend met geldige JSON."
    : "You are a senior vehicle inspection analyst and valuation specialist. Respond strictly with valid JSON.";
  const userPrompt = buildAnthropicPrompt({ plate: args.plate, locale: args.locale, dataJson });

  const response = await callAnthropic({ apiKey, model, systemPrompt, userPrompt, debugEnabled });
  if (debugEnabled) {
    console.info(`[anthropic] request_id=${response.requestId} model=${model} pass=1`);
  }
  const parsed = parseClaudeJson(extractTextContent(response.content));
  if (parsed) return withFormulaValuation(parsed, args.vehicleData);

  const retryResponse = await callAnthropic({
    apiKey,
    model,
    systemPrompt,
    userPrompt: `${userPrompt}\n\nIMPORTANT: Return only one raw JSON object and nothing else.`,
    debugEnabled
  });
  if (debugEnabled) {
    console.info(`[anthropic] request_id=${retryResponse.requestId} model=${model} pass=2`);
  }
  const retryParsed = parseClaudeJson(extractTextContent(retryResponse.content));
  if (!retryParsed) throw new Error("Anthropic response was not valid JSON in expected format.");
  return withFormulaValuation(retryParsed, args.vehicleData);
}

export async function generateVehicleAiInsights(args: {
  plate: string;
  locale: "nl" | "en";
  vehicleData: unknown;
}): Promise<ClaudeInsightResult> {
  const report = await generateVehicleAiReport(args);
  return report.insights;
}

function parseNegotiationCandidate(raw: string): ClaudeNegotiationCopilotResult | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ClaudeNegotiationCopilotResult>;
    if (!parsed || typeof parsed !== "object") return null;
    const result: ClaudeNegotiationCopilotResult = {
      script: typeof parsed.script === "string" ? parsed.script : "",
      offerStrategy: typeof parsed.offerStrategy === "string" ? parsed.offerStrategy : "",
      walkAwayReason: typeof parsed.walkAwayReason === "string" ? parsed.walkAwayReason : "",
      repairReserveAdvice: typeof parsed.repairReserveAdvice === "string" ? parsed.repairReserveAdvice : "",
      talkingPoints: Array.isArray(parsed.talkingPoints)
        ? parsed.talkingPoints.filter((x): x is string => typeof x === "string").slice(0, 8)
        : []
    };
    if (!result.script || !result.offerStrategy) return null;
    return result;
  } catch {
    return null;
  }
}

function parseNegotiationJson(text: string): ClaudeNegotiationCopilotResult | null {
  const direct = parseNegotiationCandidate(text);
  if (direct) return direct;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    const fromFence = parseNegotiationCandidate(fenceMatch[1].trim());
    if (fromFence) return fromFence;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const extracted = parseNegotiationCandidate(text.slice(start, end + 1));
    if (extracted) return extracted;
  }
  return null;
}

export async function generateNegotiationCopilotAdvice(args: {
  plate: string;
  locale: "nl" | "en";
  vehicleData: unknown;
  context: {
    offerMin: number;
    offerMax: number;
    walkAway: number;
    reserveMin: number;
    reserveMax: number;
  };
}): Promise<ClaudeNegotiationCopilotResult> {
  const { apiKey, model, debugEnabled } = getRequiredAnthropicEnv();
  const isNl = args.locale === "nl";
  const payload = safeTruncate(
    JSON.stringify(
      {
        plate: args.plate,
        context: args.context,
        vehicleData: args.vehicleData
      },
      null,
      2
    ),
    120000
  );
  const systemPrompt = isNl
    ? "Je bent een senior auto-inkooponderhandelaar. Antwoord alleen met geldige JSON."
    : "You are a senior vehicle purchase negotiation advisor. Respond only with valid JSON.";
  const userPrompt = isNl
    ? `Maak een koper-gerichte onderhandelstrategie voor dit voertuig.
Geef exact dit JSON-formaat:
{
  "script": "...",
  "offerStrategy": "...",
  "walkAwayReason": "...",
  "repairReserveAdvice": "...",
  "talkingPoints": ["..."]
}
Regels:
- script: 120-180 woorden, overtuigend en praktisch
- talkingPoints: 4-8 concrete punten met bewijs uit data
- gebruik de context-ranges letterlijk als basis
- geen markdown, alleen JSON
DATA:
${payload}`
    : `Create a buyer-focused negotiation strategy for this vehicle.
Return exactly this JSON shape:
{
  "script": "...",
  "offerStrategy": "...",
  "walkAwayReason": "...",
  "repairReserveAdvice": "...",
  "talkingPoints": ["..."]
}
Rules:
- script: 120-180 words, practical and convincing
- talkingPoints: 4-8 concrete points tied to evidence
- use provided context ranges explicitly
- no markdown, JSON only
DATA:
${payload}`;

  const response = await callAnthropic({ apiKey, model, systemPrompt, userPrompt, debugEnabled });
  if (debugEnabled) {
    console.info(`[anthropic] request_id=${response.requestId} model=${model} copilot=1`);
  }
  const parsed = parseNegotiationJson(extractTextContent(response.content));
  if (parsed) return parsed;

  const retry = await callAnthropic({
    apiKey,
    model,
    systemPrompt,
    userPrompt: `${userPrompt}\n\nIMPORTANT: Return only one raw JSON object and nothing else.`,
    debugEnabled
  });
  if (debugEnabled) {
    console.info(`[anthropic] request_id=${retry.requestId} model=${model} copilot=2`);
  }
  const retryParsed = parseNegotiationJson(extractTextContent(retry.content));
  if (!retryParsed) throw new Error("Anthropic negotiation response was not valid JSON.");
  return retryParsed;
}

export function buildFallbackNegotiationCopilotAdvice(args: {
  locale: "nl" | "en";
  context: {
    offerMin: number;
    offerMax: number;
    walkAway: number;
    reserveMin: number;
    reserveMax: number;
  };
}): ClaudeNegotiationCopilotResult {
  const isNl = args.locale === "nl";
  return {
    script: isNl
      ? `Start de onderhandeling tussen ${args.context.offerMin} en ${args.context.offerMax} euro en onderbouw je bod met onderhouds- en inspectiesignalen. Blijf strikt onder de walk-away grens van ${args.context.walkAway} euro, tenzij er aantoonbaar recent onderhoud met facturen aanwezig is. Reserveer direct ${args.context.reserveMin} tot ${args.context.reserveMax} euro voor onverwachte kosten in het eerste jaar.`
      : `Start negotiation between EUR ${args.context.offerMin} and EUR ${args.context.offerMax}, anchored in maintenance and inspection signals. Stay below the walk-away threshold of EUR ${args.context.walkAway} unless there is documented recent maintenance with invoices. Keep EUR ${args.context.reserveMin} to EUR ${args.context.reserveMax} as first-year contingency reserve.`,
    offerStrategy: isNl
      ? "Open met onderkant biedrange, verhoog alleen bij hard bewijs van staat."
      : "Open at lower offer band, increase only with hard condition evidence.",
    walkAwayReason: isNl
      ? "Boven deze grens is risico-rendement ongunstig versus marktwaarde."
      : "Above this threshold, risk-adjusted value becomes unattractive.",
    repairReserveAdvice: isNl
      ? "Houd reserve apart voor slijtage, keuring en onverwachte reparaties."
      : "Keep reserve for wear-and-tear, inspection follow-ups, and surprise repairs.",
    talkingPoints: [
      isNl ? "Vraag onderhoudsfacturen en koppel ontbrekende historie aan prijsverlaging." : "Request maintenance invoices and tie missing history to price reduction.",
      isNl ? "Gebruik risicoscore en defecthistorie als onderhandelingshefboom." : "Use risk score and defect history as leverage.",
      isNl ? "Hanteer walk-away grens zonder uitzonderingen." : "Apply walk-away threshold with no exceptions.",
      isNl ? "Reservebudget opnemen in totale aankoopbeslissing." : "Include reserve budget in total purchase decision."
    ]
  };
}

function readNestedNumber(record: Record<string, unknown>, path: string[]): number | null {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  const value = Number(current);
  return Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildFallbackVehicleAiReport(args: {
  locale: "nl" | "en";
  vehicleData: unknown;
}): ClaudeVehicleReportResult {
  const isNl = args.locale === "nl";
  const data = (args.vehicleData ?? {}) as Record<string, unknown>;
  const vehicle = (data.vehicle ?? {}) as Record<string, unknown>;
  const enriched = (data.enriched ?? {}) as Record<string, unknown>;
  const defects = Array.isArray(data.defects) ? data.defects.length : 0;
  const inspections = Array.isArray(data.inspections) ? (data.inspections as Array<Record<string, unknown>>) : [];
  const defectDescriptions = (data.defectDescriptions ?? {}) as Record<string, string>;
  const recalls = Array.isArray(data.recalls) ? data.recalls.length : 0;
  const ageMonths = readNestedNumber(data, ["enriched", "ageInMonths"]) ?? 0;
  const brand = String(vehicle.brand ?? "").trim();
  const tradeName = String(vehicle.tradeName ?? "").trim();
  const year = readNestedNumber(vehicle, ["year"]);

  const directEstimate = readNestedNumber(enriched, ["estimatedValueNow"]);
  const directMin = readNestedNumber(enriched, ["estimatedValueMin"]);
  const directMax = readNestedNumber(enriched, ["estimatedValueMax"]);
  const maintenanceRisk = readNestedNumber(enriched, ["maintenanceRiskScore"]) ?? 6;
  const apkPassChance = readNestedNumber(enriched, ["apkPassChance"]) ?? 70;
  const cataloguePrice = readNestedNumber(vehicle, ["cataloguePrice"]);

  const ageYears = ageMonths > 0 ? ageMonths / 12 : 10;
  const depreciation = clamp(1 - ageYears * 0.06, 0.18, 0.75);
  const derivedFromCatalogue = cataloguePrice ? Math.round(cataloguePrice * depreciation) : null;
  const estimatedValueNow = Math.max(1500, Math.round(directEstimate ?? derivedFromCatalogue ?? 6500));

  const defectPenalty = defects * 0.03;
  const recallPenalty = recalls > 0 ? 0.04 : 0;
  const riskPenalty = maintenanceRisk * 0.01;
  const uncertainty = clamp(0.14 + defectPenalty + recallPenalty + riskPenalty, 0.14, 0.38);
  // Prefer the formula range from enriched data; only derive one when missing.
  const estimatedValueMin = Math.max(1000, Math.round(directMin ?? estimatedValueNow * (1 - uncertainty)));
  const estimatedValueMax = Math.round(directMax ?? estimatedValueNow * (1 + uncertainty));
  const confidence: "LOW" | "MEDIUM" | "HIGH" = uncertainty > 0.28 ? "LOW" : uncertainty > 0.2 ? "MEDIUM" : "HIGH";

  const positives: string[] = [];
  const risks: string[] = [];
  const factors: string[] = [];
  const inspectionDefectCodes = Array.from(
    new Set(
      inspections
        .map((item) => String(item.gebrek_identificatie ?? "").trim())
        .filter((code) => code.length > 0)
    )
  );
  const effectiveDefectCount = Math.max(defects, inspectionDefectCodes.length);

  if (apkPassChance >= 70) {
    positives.push(isNl ? "APK slagingskans ligt relatief hoog." : "APK pass chance is relatively strong.");
  }
  const ownersCount = readNestedNumber(vehicle, ["owners", "count"]);
  if (ownersCount !== null) {
    positives.push(
      isNl
        ? `Aantal vorige eigenaren bekend: ${ownersCount}.`
        : `Previous owner count available: ${ownersCount}.`
    );
  }
  if (recalls === 0) {
    positives.push(isNl ? "Geen openstaande terugroepacties zichtbaar." : "No open recalls currently visible.");
  }

  if (effectiveDefectCount > 0) {
    const topCode = inspectionDefectCodes[0] ?? "";
    const topDescription = topCode ? defectDescriptions[topCode] ?? topCode : null;
    risks.push(
      isNl
        ? `${effectiveDefectCount} defectcode(s) in APK-historie kunnen herstelkosten verhogen${topDescription ? ` (o.a. ${topDescription})` : ""}.`
        : `${effectiveDefectCount} defect code(s) in inspection history may increase repair costs${topDescription ? ` (including ${topDescription})` : ""}.`
    );
  }
  if (maintenanceRisk >= 7) {
    risks.push(
      isNl
        ? "Onderhoudsrisico is bovengemiddeld volgens het profiel."
        : "Maintenance risk is above average based on profile indicators."
    );
  }
  if (ageYears >= 12) {
    risks.push(isNl ? "Hogere leeftijd verhoogt kans op slijtagecomponenten." : "Vehicle age raises wear-and-tear probability.");
  }
  if (apkPassChance < 60) {
    risks.push(isNl ? "APK slagingskans onder gemiddelde bandbreedte." : "APK pass chance is below average range.");
  }

  factors.push(
    isNl ? `Leeftijd: ${Math.round(ageYears * 10) / 10} jaar` : `Age: ${Math.round(ageYears * 10) / 10} years`,
    isNl ? `Onderhoudsrisico: ${maintenanceRisk}/10` : `Maintenance risk: ${maintenanceRisk}/10`,
    isNl ? `APK kans: ${apkPassChance}%` : `APK pass chance: ${apkPassChance}%`,
    isNl ? `Defectcodes in historie: ${effectiveDefectCount}` : `Defect codes in history: ${effectiveDefectCount}`,
    isNl ? `Terugroepacties: ${recalls}` : `Recalls: ${recalls}`
  );
  if (cataloguePrice) {
    factors.push(isNl ? `Catalogusprijs: EUR ${cataloguePrice}` : `Catalogue price: EUR ${cataloguePrice}`);
  }

  const summary = isNl
    ? `${brand || "Voertuig"} ${tradeName}`.trim() +
      `${year ? ` (${year})` : ""}: geschatte marktwaarde rond EUR ${estimatedValueNow} met bandbreedte EUR ${estimatedValueMin}-${estimatedValueMax}, gebaseerd op leeftijd, APK-signalen en onderhoudsprofiel.`
    : `${brand || "Vehicle"} ${tradeName}`.trim() +
      `${year ? ` (${year})` : ""}: estimated market value around EUR ${estimatedValueNow} with range EUR ${estimatedValueMin}-${estimatedValueMax}, based on age, inspection signals, and maintenance profile.`;
  const recommendation = isNl
    ? "Gebruik deze indicatie als onderhandelingsbasis en combineer met fysieke inspectie en proefrit."
    : "Use this estimate as negotiation guidance and combine it with physical inspection and test drive.";
  const explanation = isNl
    ? "Dit is een data-gedreven schatting, geen taxatierapport. Bandbreedte is vergroot bij hogere onzekerheid."
    : "This is a data-driven estimate, not a formal appraisal. The range widens as uncertainty increases.";

  return {
    insights: {
      summary,
      positives: positives.slice(0, 4),
      risks: risks.slice(0, 4),
      recommendation,
      purchaseVerdict: maintenanceRisk < 5.5 && effectiveDefectCount < 2 ? "BUY" : maintenanceRisk < 7 ? "CONSIDER" : maintenanceRisk < 8.5 ? "CAUTION" : "AVOID",
      riskLevel: maintenanceRisk < 5.5 ? "LOW" : maintenanceRisk < 7.5 ? "MEDIUM" : "HIGH",
      recommendations: [
        isNl ? "Controleer onderhoudsboekje en facturen op volledigheid." : "Verify maintenance history and invoices for consistency.",
        isNl ? "Plan een onafhankelijke aankoopkeuring voor definitieve beslissing." : "Schedule an independent pre-purchase inspection before final decision.",
        isNl ? "Gebruik de geschatte marktwaarde actief in de prijsonderhandeling." : "Use the estimated market value actively during negotiation."
      ]
    },
    valuation: {
      currency: "EUR",
      estimatedValueNow,
      estimatedValueMin,
      estimatedValueMax,
      confidence,
      factors: factors.slice(0, 8),
      explanation
    }
  };
}
