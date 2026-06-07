import Anthropic from "@anthropic-ai/sdk";

export type VehicleComparisonAiResult = {
  verdict: "BASE" | "COMPARE" | "TIE";
  summary: string;
  basePros: string[];
  comparePros: string[];
  keyRisks: string[];
  recommendation: string;
};

function safeTruncate(value: string, max = 14000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const chunks: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if ((part as { type?: string }).type === "text" && typeof (part as { text?: string }).text === "string") {
      chunks.push((part as { text: string }).text);
    }
  }
  return chunks.join("\n").trim();
}

function parseCandidate(raw: string): VehicleComparisonAiResult | null {
  try {
    const parsed = JSON.parse(raw) as Partial<VehicleComparisonAiResult>;
    if (!parsed || typeof parsed !== "object") return null;
    const verdict = parsed.verdict === "BASE" || parsed.verdict === "COMPARE" ? parsed.verdict : "TIE";
    const summary = typeof parsed.summary === "string" ? parsed.summary : "";
    const recommendation = typeof parsed.recommendation === "string" ? parsed.recommendation : "";
    const basePros = Array.isArray(parsed.basePros) ? parsed.basePros.filter((v): v is string => typeof v === "string").slice(0, 6) : [];
    const comparePros = Array.isArray(parsed.comparePros) ? parsed.comparePros.filter((v): v is string => typeof v === "string").slice(0, 6) : [];
    const keyRisks = Array.isArray(parsed.keyRisks) ? parsed.keyRisks.filter((v): v is string => typeof v === "string").slice(0, 8) : [];
    if (!summary || !recommendation) return null;
    return { verdict, summary, recommendation, basePros, comparePros, keyRisks };
  } catch {
    return null;
  }
}

function parseJson(raw: string): VehicleComparisonAiResult | null {
  const direct = parseCandidate(raw);
  if (direct) return direct;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fence) {
    const fromFence = parseCandidate(fence.trim());
    if (fromFence) return fromFence;
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return parseCandidate(raw.slice(start, end + 1));
  }
  return null;
}

function buildFallback(locale: "nl" | "en", args: { base: Record<string, unknown>; compare: Record<string, unknown> }): VehicleComparisonAiResult {
  const b = (args.base.enriched ?? {}) as Record<string, unknown>;
  const c = (args.compare.enriched ?? {}) as Record<string, unknown>;
  const bValue = Number(b.estimatedValueNow ?? 0);
  const cValue = Number(c.estimatedValueNow ?? 0);
  const bRisk = Number(b.maintenanceRiskScore ?? 6);
  const cRisk = Number(c.maintenanceRiskScore ?? 6);
  const bDefects = Array.isArray(args.base.defects) ? args.base.defects.length : 0;
  const cDefects = Array.isArray(args.compare.defects) ? args.compare.defects.length : 0;

  let verdict: VehicleComparisonAiResult["verdict"] = "TIE";
  if (bRisk + bDefects < cRisk + cDefects) verdict = "BASE";
  if (cRisk + cDefects < bRisk + bDefects) verdict = "COMPARE";

  return {
    verdict,
    summary:
      locale === "nl"
        ? "Vergelijking is gebaseerd op onderhoudsrisico, defecthistorie en marktwaarde. Controleer altijd onderhoudsbewijs en plan een onafhankelijke inspectie."
        : "Comparison is based on maintenance risk, defect history, and market value. Always verify maintenance records and perform an independent inspection.",
    basePros: [
      locale === "nl" ? `Onderhoudsrisico: ${bRisk.toFixed(1)}/10` : `Maintenance risk: ${bRisk.toFixed(1)}/10`,
      locale === "nl" ? `Geschatte marktwaarde: EUR ${Math.round(bValue).toLocaleString("nl-NL")}` : `Estimated market value: EUR ${Math.round(bValue).toLocaleString("nl-NL")}`
    ],
    comparePros: [
      locale === "nl" ? `Onderhoudsrisico: ${cRisk.toFixed(1)}/10` : `Maintenance risk: ${cRisk.toFixed(1)}/10`,
      locale === "nl" ? `Geschatte marktwaarde: EUR ${Math.round(cValue).toLocaleString("nl-NL")}` : `Estimated market value: EUR ${Math.round(cValue).toLocaleString("nl-NL")}`
    ],
    keyRisks: [
      locale === "nl" ? `Voertuig A defectrecords: ${bDefects}` : `Vehicle A defect records: ${bDefects}`,
      locale === "nl" ? `Voertuig B defectrecords: ${cDefects}` : `Vehicle B defect records: ${cDefects}`
    ],
    recommendation:
      locale === "nl"
        ? "Kies het voertuig met lagere gecombineerde risico-indicatoren en gebruik de zwakke punten als onderhandelhefboom."
        : "Choose the vehicle with lower combined risk indicators and use weaknesses as negotiation leverage."
  };
}

export async function generateVehicleComparisonAi(args: {
  locale: "nl" | "en";
  basePlate: string;
  comparePlate: string;
  base: Record<string, unknown>;
  compare: Record<string, unknown>;
}): Promise<VehicleComparisonAiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey) {
    return buildFallback(args.locale, { base: args.base, compare: args.compare });
  }

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const systemPrompt =
    args.locale === "nl"
      ? "Je bent een senior auto-inkoopadviseur. Antwoord uitsluitend met geldige JSON."
      : "You are a senior used-car comparison advisor. Respond only with valid JSON.";

  const payload = safeTruncate(
    JSON.stringify(
      {
        basePlate: args.basePlate,
        comparePlate: args.comparePlate,
        baseVehicle: args.base,
        compareVehicle: args.compare
      },
      null,
      2
    )
  );

  const userPrompt =
    args.locale === "nl"
      ? `Vergelijk deze twee gebruikte auto's en geef aankoopadvies.\nAntwoord met exact dit JSON-formaat:\n{\n  "verdict": "BASE|COMPARE|TIE",\n  "summary": "...",\n  "basePros": ["..."],\n  "comparePros": ["..."],\n  "keyRisks": ["..."],\n  "recommendation": "..."\n}\nRegels:\n- summary: 90-180 woorden\n- basePros/comparePros: max 6\n- keyRisks: max 8\n- geef concrete keuzehulp voor gebruikte auto koop\n- alleen JSON\nDATA:\n${payload}`
      : `Compare these two used cars and provide purchase guidance.\nReturn exactly this JSON shape:\n{\n  "verdict": "BASE|COMPARE|TIE",\n  "summary": "...",\n  "basePros": ["..."],\n  "comparePros": ["..."],\n  "keyRisks": ["..."],\n  "recommendation": "..."\n}\nRules:\n- summary: 90-180 words\n- max 6 pros per side\n- max 8 key risks\n- provide concrete used-car buying guidance\n- JSON only\nDATA:\n${payload}`;

  try {
    const client = new Anthropic({ apiKey, maxRetries: 2 });
    const response = await client.messages.create({
      model,
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    });

    const parsed = parseJson(extractTextContent(response.content));
    if (parsed) return parsed;

    return buildFallback(args.locale, { base: args.base, compare: args.compare });
  } catch {
    return buildFallback(args.locale, { base: args.base, compare: args.compare });
  }
}
