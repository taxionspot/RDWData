import { NextResponse } from "next/server";
import { verifyPaypalWebhook } from "@/lib/payments/paypal";
import { fulfillFromCapture, type PaypalCaptureLike } from "@/lib/payments/fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CaptureCompletedEvent = {
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    amount?: { value?: string; currency_code?: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
};

function plateFromCustomId(customId?: string): string {
  if (!customId) return "";
  return customId.startsWith("plate:") ? customId.slice("plate:".length) : "";
}

/**
 * PayPal webhook backstop for redirect-based payments (iDEAL): if the buyer
 * pays but never lands back on the return URL, this still grants access.
 * Fails closed: an unverified signature is rejected, so it cannot be used to
 * forge paid access. fulfilment is idempotent with the return handler.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const verified = await verifyPaypalWebhook({
    headers: {
      authAlgo: request.headers.get("paypal-auth-algo"),
      certUrl: request.headers.get("paypal-cert-url"),
      transmissionId: request.headers.get("paypal-transmission-id"),
      transmissionSig: request.headers.get("paypal-transmission-sig"),
      transmissionTime: request.headers.get("paypal-transmission-time")
    },
    rawBody
  });

  if (!verified) {
    return NextResponse.json({ error: "Webhook signature not verified." }, { status: 401 });
  }

  let event: CaptureCompletedEvent;
  try {
    event = JSON.parse(rawBody) as CaptureCompletedEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const resource = event.resource;
    const orderId = resource?.supplementary_data?.related_ids?.order_id?.trim();
    const plate = plateFromCustomId(resource?.custom_id);

    if (orderId && plate) {
      const capture: PaypalCaptureLike = {
        status: "COMPLETED",
        id: orderId,
        purchase_units: [
          {
            payments: {
              captures: [
                {
                  id: resource?.id,
                  amount: resource?.amount,
                  status: resource?.status ?? "COMPLETED"
                }
              ]
            }
          }
        ]
      };
      try {
        await fulfillFromCapture({ orderId, plate, locale: "nl", capture });
      } catch {
        // Acknowledge anyway; PayPal retries on a non-2xx and the return handler
        // is the other path to fulfilment.
      }
    }
  }

  return NextResponse.json({ ok: true });
}
