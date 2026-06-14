/**
 * The market value (our own computeMarketValueV3 output) is premium content.
 * These enriched fields are stripped from any API response for visitors without
 * paid access for the plate, so the value is never present in the JSON / network
 * tab (the UI blur alone left it readable via devtools). The RDW catalogusprijs
 * and all cost estimates (tax/fuel/insurance) stay free. Shared by the
 * single-plate route and the comparison route so both doors enforce one rule.
 */
export const PREMIUM_VALUE_FIELDS = [
  "estimatedValueNow",
  "estimatedValueMin",
  "estimatedValueMax",
  "estimatedValueNextYear",
  "marketValueConfidence",
  "marketValueSe"
] as const;

export function redactPremiumValue<T extends Record<string, unknown>>(localized: T, hasAccess: boolean): T {
  if (hasAccess) return localized;
  const enriched = localized.enriched as Record<string, unknown> | undefined;
  if (!enriched) return localized;
  const cleaned: Record<string, unknown> = { ...enriched };
  for (const field of PREMIUM_VALUE_FIELDS) cleaned[field] = null;
  return { ...localized, enriched: cleaned };
}
