import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { getSiteSettings } from "@/lib/site-settings/service";
import { isSamplePlate } from "@/lib/sample";

/**
 * Demo grants (the "skip payment" button) write PlatePayment records with an
 * orderId that starts with "demo-" and amount "0.00". The production database
 * still contains such records from the period the demo button was always
 * enabled; they must never unlock a plate for real visitors.
 */
export function isDemoAccessEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEMO_SKIP_PAYMENT === "true";
}

/** Matches every demo grant ever written, for cleanup and reporting. */
export const DEMO_PAYMENT_FILTER = { $or: [{ orderId: { $regex: /^demo-/ } }, { amount: "0.00" }] };

/**
 * Comp (complimentary) access: lets the owner test the paid customer flow
 * without paying, scoped to specific emails. Comp grants write a real,
 * non-zero PlatePayment record (orderId "comp-", not "demo-"), so they pass
 * the production hasCompletedPlatePayment check without opening the paywall
 * for anyone else. The allowlist is the env COMP_ACCESS_EMAILS (comma
 * separated) plus the hardcoded owner email.
 */
export function isCompEmail(email?: string | null): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const allowlist = new Set<string>(["saburm1997@gmail.com"]);
  for (const entry of (process.env.COMP_ACCESS_EMAILS ?? "").split(",")) {
    const trimmed = entry.trim().toLowerCase();
    if (trimmed) allowlist.add(trimmed);
  }
  return allowlist.has(normalized);
}

/**
 * True when a real (non-demo) completed payment exists for this plate.
 * Demo records only count while demo access is explicitly enabled.
 */
export async function hasCompletedPlatePayment(plate: string): Promise<boolean> {
  await connectMongo();
  const query: Record<string, unknown> = { plate, status: "COMPLETED", provider: "paypal" };
  if (!isDemoAccessEnabled()) {
    query.orderId = { $not: /^demo-/ };
    query.amount = { $ne: "0.00" };
  }
  const exists = await PlatePaymentModel.exists(query);
  return Boolean(exists);
}

/**
 * Full server-side access decision for premium content on a plate: the
 * sample plate is always open, demo mode bypasses payment, and otherwise a
 * real completed payment is required (when payments are enabled at all).
 */
export async function hasPaidPlateAccess(plate: string): Promise<boolean> {
  if (isSamplePlate(plate)) return true;
  if (isDemoAccessEnabled()) return true;
  const settings = await getSiteSettings();
  if (!settings.paymentEnabled) return true;
  return hasCompletedPlatePayment(plate);
}
