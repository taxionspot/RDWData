import { NextResponse } from "next/server";
import { capturePaypalOrder, getPaypalOrder } from "@/lib/payments/paypal";
import { fulfillFromCapture, type PaypalCaptureLike } from "@/lib/payments/fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let capture: PaypalCaptureLike | null = null;
  try {
    capture = (await capturePaypalOrder(orderId)) as PaypalCaptureLike;
  } catch {
    // Likely ORDER_ALREADY_CAPTURED (PayPal auto-captured iDEAL on approval):
    // read the order back and fulfil from that.
    try {
      capture = (await getPaypalOrder(orderId)) as PaypalCaptureLike;
    } catch {
      capture = null;
    }
  }

  if (capture) {
    try {
      const result = await fulfillFromCapture({ orderId, plate, locale: "nl", capture });
      if (result.ok) {
        return NextResponse.redirect(reportUrl("?paid=1"), { status: 303 });
      }
    } catch {
      // fall through to the pending path
    }
  }

  // Not confirmed yet: the webhook will complete it shortly.
  return NextResponse.redirect(reportUrl("?checkout=pending"), { status: 303 });
}
