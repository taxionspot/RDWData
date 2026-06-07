import Anthropic from "@anthropic-ai/sdk";

// Model tiering: narrow specialists run on the fast/cheap Haiku tier; the final
// synthesis (analyst) runs on the flagship Opus tier. Both overridable via env.
const MODEL_IDS: Record<AgentTier, string> = {
  haiku: process.env.ANTHROPIC_HAIKU_MODEL ?? "claude-haiku-4-5",
  opus: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8"
};

export type AgentTier = "haiku" | "opus";

function extractText(content: Anthropic.Message["content"]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Robustly pull a JSON object out of a model response (direct, fenced, or braces). */
export function extractJson(text: string): unknown {
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const direct = tryParse(text);
  if (direct !== undefined) return direct;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) {
    const fromFence = tryParse(fence[1].trim());
    if (fromFence !== undefined) return fromFence;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const extracted = tryParse(text.slice(start, end + 1));
    if (extracted !== undefined) return extracted;
  }
  return undefined;
}

/**
 * Run one specialist/analyst agent. The shared context block is marked cacheable
 * so repeated generations (and the later analyst call) reuse it cheaply. Returns
 * the parsed JSON object, or null on any failure (the caller supplies a
 * deterministic fallback so the report is never blank).
 */
export async function runAgent(args: {
  apiKey: string;
  tier: AgentTier;
  persona: string;
  sharedContext: string;
  task: string;
  maxTokens?: number;
  debug?: boolean;
}): Promise<unknown | null> {
  if (!args.apiKey) return null;

  const client = new Anthropic({ apiKey: args.apiKey, maxRetries: 1, logLevel: args.debug ? "debug" : "warn" });
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: args.sharedContext, cache_control: { type: "ephemeral" } },
    { type: "text", text: args.persona }
  ];

  const call = async (task: string): Promise<unknown> => {
    const message = await client.messages.create({
      model: MODEL_IDS[args.tier],
      max_tokens: args.maxTokens ?? 1100,
      system,
      messages: [{ role: "user", content: task }]
    });
    return extractJson(extractText(message.content));
  };

  try {
    const first = await call(args.task);
    if (first != null) return first;
    const retry = await call(`${args.task}\n\nBELANGRIJK: Antwoord met EEN enkel ruw JSON-object, zonder markdown of extra tekst.`);
    return retry ?? null;
  } catch {
    return null;
  }
}
