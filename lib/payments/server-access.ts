import crypto from "crypto";
import { cookies } from "next/headers";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { getSiteSettings } from "@/lib/site-settings/service";
import { isSamplePlate } from "@/lib/sample";

/**
 * Comp access is SESSION-scoped via this cookie (set after the owner email is
 * verified), never a global plate record, so it unlocks reports only in the
 * owner's own browser and can never leak the paywall to other visitors.
 */
export const COMP_COOKIE = "kr_comp";

export function hasCompCookie(): boolean {
  try {
    return cookies().get(COMP_COOKIE)?.value === "1";
  } catch {
    return false;
  }
}

/**
 * Per-buyer paid access. A real payment unlocks a plate for the BUYER's browser
 * only, via this signed cookie, NOT a global per-plate record. That closes the
 * leak where one payment made a plate free for every visitor (incognito too).
 * The signature (HMAC over the plate list) prevents a visitor from forging it.
 */
export const PAID_COOKIE = "kr_paid";

export const PAID_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 180
};

function normalizePlateValue(plate: string): string {
  return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

// Used ONLY when no real secret is configured. It is a per-process RANDOM value,
// never a published constant, so a forged cookie can never verify. The trade-off
// is that without a configured secret, cookies do not survive a restart or span
// instances. In production PAYPAL_CLIENT_SECRET is set, so this never applies.
const PROCESS_FALLBACK_SECRET = crypto.randomBytes(32).toString("hex");

function paidCookieSecret(): string {
  const secret = (process.env.PAID_COOKIE_SECRET || process.env.PAYPAL_CLIENT_SECRET || "").trim();
  return secret.length >= 16 ? secret : PROCESS_FALLBACK_SECRET;
}

function signPaidPayload(encoded: string): string {
  return crypto.createHmac("sha256", paidCookieSecret()).update(encoded).digest("base64url");
}

/** Constant-time string compare (defends the HMAC check against timing analysis). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** Build the signed kr_paid cookie value from a list of plates. */
export function buildPaidCookieValue(plates: string[]): string {
  const unique = Array.from(new Set(plates.map(normalizePlateValue).filter(Boolean)));
  const encoded = Buffer.from(unique.join(","), "utf8").toString("base64url");
  return `${encoded}.${signPaidPayload(encoded)}`;
}

/** Read + verify the plates this browser has paid for. Tampered or unsigned
 * cookies verify to an empty list, so they grant nothing. */
export function readPaidPlates(): string[] {
  try {
    const raw = cookies().get(PAID_COOKIE)?.value;
    if (!raw) return [];
    const dot = raw.lastIndexOf(".");
    if (dot <= 0) return [];
    const encoded = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    if (!sig || !safeEqual(signPaidPayload(encoded), sig)) return [];
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    return decoded ? decoded.split(",") : [];
  } catch {
    return [];
  }
}

/** True when THIS browser paid for the plate (per-buyer, not global). */
export function hasPaidPlateCookie(plate: string): boolean {
  return readPaidPlates().includes(normalizePlateValue(plate));
}

/**
 * The cookie value that grants this browser access to `plate`, merged with the
 * plates it already paid for. Set it on a payment response with
 * res.cookies.set(PAID_COOKIE, paidCookieValueWith(plate), PAID_COOKIE_OPTIONS).
 */
export function paidCookieValueWith(plate: string): string {
  const plates = readPaidPlates();
  const norm = normalizePlateValue(plate);
  if (norm && !plates.includes(norm)) plates.push(norm);
  return buildPaidCookieValue(plates);
}

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
    // Exclude demo- AND comp- grants: neither is a real customer payment, so
    // they must never count as global per-plate access.
    query.orderId = { $not: /^(demo|comp)-/ };
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
  if (hasCompCookie()) return true;
  // Per-buyer paid access (a signed cookie set on payment), NOT a global
  // per-plate record. This closes the leak where one payment unlocked the plate
  // for every visitor, incognito included.
  if (hasPaidPlateCookie(plate)) return true;
  if (isDemoAccessEnabled()) return true;
  const settings = await getSiteSettings();
  if (!settings.paymentEnabled) return true;
  return false;
}
