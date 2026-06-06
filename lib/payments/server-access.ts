import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { getSiteSettings } from "@/lib/site-settings/service";

/**
 * Server-side demo bypass.
 *
 * Intentionally driven ONLY by an explicit, server-only env flag:
 *  - It is NOT tied to NODE_ENV — preview/staging deploys run as "production"
 *    in some hosts but should still be able to enable a demo, and a non-prod
 *    build should NOT silently hand out paid reports for free.
 *  - It is NOT a NEXT_PUBLIC_* variable — those are inlined into the browser
 *    bundle and must never gate server-side payment enforcement.
 *
 * Default: disabled. Set PAYMENT_DEMO_BYPASS=true to allow free unlocks.
 */
export function isDemoBypassEnabled(): boolean {
  return process.env.PAYMENT_DEMO_BYPASS === "true";
}

export type ExpectedPrice = { amount: string; currency: string };

/** The single source of truth for the report price (from site settings). */
export async function getExpectedReportPrice(): Promise<ExpectedPrice> {
  const settings = await getSiteSettings();
  return { amount: settings.payment.amount, currency: settings.payment.currency };
}

/** Whether a completed payment is required before a report can be unlocked. */
export async function isReportPaymentRequired(): Promise<boolean> {
  const settings = await getSiteSettings();
  return Boolean(settings.paymentEnabled && settings.lockSections.reportDownload);
}

async function plateHasCompletedPayment(plate: string): Promise<boolean> {
  await connectMongo();
  // Only real provider payments count. "demo" records never grant access on
  // their own — demo access is a runtime flag, not a persisted entitlement.
  const exists = await PlatePaymentModel.exists({ plate, status: "COMPLETED", provider: "paypal" });
  return Boolean(exists);
}

/** True if the given plate may be unlocked (demo on, gating off, or paid). */
export async function hasPaidPlateAccess(plate: string): Promise<boolean> {
  if (isDemoBypassEnabled()) return true;
  if (!(await isReportPaymentRequired())) return true;
  return plateHasCompletedPayment(plate);
}

/** True if ANY of the given plates is unlocked (used by the comparison report). */
export async function hasPaidAccessForAnyPlate(plates: string[]): Promise<boolean> {
  if (isDemoBypassEnabled()) return true;
  if (!(await isReportPaymentRequired())) return true;
  for (const plate of plates) {
    if (await plateHasCompletedPayment(plate)) return true;
  }
  return false;
}

/**
 * Returns true when the captured amount/currency at least covers the expected
 * price. Compared as fixed-2 decimals to avoid string/float mismatches; an
 * overpayment is accepted, an underpayment (e.g. the €0.01 tampering attack)
 * is rejected.
 */
export function isCapturedAmountSufficient(
  captured: { amount?: string | null; currency?: string | null },
  expected: ExpectedPrice
): boolean {
  const capturedValue = Number(captured.amount);
  const expectedValue = Number(expected.amount);
  if (!Number.isFinite(capturedValue) || !Number.isFinite(expectedValue)) return false;
  const capturedCurrency = String(captured.currency ?? "").toUpperCase();
  const expectedCurrency = String(expected.currency ?? "").toUpperCase();
  if (capturedCurrency !== expectedCurrency) return false;
  // 1 cent tolerance for rounding; blocks meaningful underpayment.
  return capturedValue + 0.005 >= expectedValue;
}
