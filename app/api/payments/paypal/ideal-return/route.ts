import { NextResponse } from "next/server";
import { capturePaypalOrder, getPaypalOrder } from "@/lib/payments/paypal";
import { fulfillFromCapture, type PaypalCaptureLike } from "@/lib/payments/fulfill";
import { PAID_COOKIE, PAID_COOKIE_OPTIONS, paidCookieValueWith } from "@/lib/payments/server-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF build (<=6s) + one email send (<=7.5s) run on the iDEAL return path.
export const maxDuration = 30;

function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/**
 * Landing page PayPal redirects the buyer to after the iDEAL bank step. We
 * capture the order (or read it back if PayPal already auto-captured), grant
 * access, then bounce the browser to the report. If anything is not yet
 * COMPLETED we still send them to the report: the webhook finishes the job and
 * a refresh unlocks. We never show a raw API response to the buyer.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const plate = normalizePlate(url.searchParams.get("plate") ?? "");
  // PayPal appends the order id as `token` on the return_url.
  const orderId = (url.searchParams.get("token") ?? url.searchParams.get("orderId") ?? "").trim();
  const origin = url.origin;

  const reportUrl = (suffix: string) =>
    `${origin}/search/${encodeURIComponent(plate || "")}${suffix}`;

  if (!plate || !orderId) {
    return NextResponse.redirect(reportUrl("?checkout=error"), { status: 303 });
  }

  const tryFulfill = async (capture: PaypalCaptureLike | null): Promise<boolean> => {
    if (!capture) return false;
    try {
      const result = await fulfillFromCapture({ orderId, plate, locale: "nl", capture });
      return result.ok;
    } catch {
      return false;
    }
  };

  // The order auto-captures on approval (ORDER_COMPLETE_ON_PAYMENT_APPROVAL),
  // so reading it back is normally enough.
  let ok = false;
  try {
    ok = await tryFulfill((await getPaypalOrder(orderId)) as PaypalCaptureLike);
  } catch {
    ok = false;
  }

  // Rare race: the buyer returned before PayPal finished auto-capturing. Capture
  // explicitly; if that also fails, the webhook is the backstop.
  if (!ok) {
    try {
      ok = await tryFulfill((await capturePaypalOrder(orderId)) as PaypalCaptureLike);
    } catch {
      // already captured or not yet payable; leave it to the webhook
    }
  }

  let paidSuffix = ok ? "?paid=1" : "?checkout=pending";
  if (ok) {
    // Retrieve amount/currency from the order so the client can fire the GTM
    // purchase event without a second round-trip. We already have the order
    // from the tryFulfill calls above, but re-reading it here is the simplest
    // safe approach: the order is already captured at this point.
    try {
      const order = (await getPaypalOrder(orderId)) as PaypalCaptureLike;
      const firstCapture = order?.purchase_units?.[0]?.payments?.captures?.[0];
      const amt = firstCapture?.amount?.value ?? "";
      const cur = firstCapture?.amount?.currency_code ?? "EUR";
      if (amt) {
        paidSuffix = `?paid=1&oid=${encodeURIComponent(orderId)}&amt=${encodeURIComponent(amt)}&cur=${encodeURIComponent(cur)}`;
      }
    } catch {
      // If we can't read back the order, fall through with bare ?paid=1.
      // The client falls back to the settings amount.
    }
  }
  const res = NextResponse.redirect(reportUrl(paidSuffix), { status: 303 });
  if (ok) {
    // Grant access to THIS browser only (per-buyer signed cookie), never globally.
    res.cookies.set(PAID_COOKIE, paidCookieValueWith(plate), PAID_COOKIE_OPTIONS);
  }
  return res;
}
