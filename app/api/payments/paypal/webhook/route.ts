import { NextResponse } from "next/server";
import { verifyPaypalWebhook, getPaypalOrder } from "@/lib/payments/paypal";
import { fulfillFromCapture, type PaypalCaptureLike } from "@/lib/payments/fulfill";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF build (<=6s) + one email send (<=7.5s) run on the webhook fulfilment path.
export const maxDuration = 30;

type CaptureEvent = {
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
 * Recover the plate when the capture event omits custom_id: first from the
 * PENDING PlatePayment row written at order creation, then from the order itself
 * via the PayPal API. This keeps the webhook working as the backstop even on a
 * sparse payload.
 */
async function resolvePlate(customId: string | undefined, orderId: string): Promise<string> {
  const fromCustom = plateFromCustomId(customId);
  if (fromCustom) return fromCustom;
  if (!orderId) return "";
  try {
    await connectMongo();
    const record = await PlatePaymentModel.findOne({ orderId });
    if (record?.plate) return record.plate;
  } catch {
    // fall through to the API lookup
  }
  try {
    const order = (await getPaypalOrder(orderId)) as { purchase_units?: Array<{ custom_id?: string }> };
    return plateFromCustomId(order.purchase_units?.[0]?.custom_id);
  } catch {
    return "";
  }
}

/**
 * PayPal webhook backstop for redirect-based payments (iDEAL): if the buyer pays
 * but never lands on the return URL, this still grants access. Fails closed: an
 * unverified signature is rejected (403), so it cannot forge paid access.
 * fulfilment is idempotent with the return handler and the synchronous capture.
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
    return NextResponse.json({ error: "Webhook signature not verified." }, { status: 403 });
  }

  let event: CaptureEvent;
  try {
    event = JSON.parse(rawBody) as CaptureEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const resource = event.resource;
  const orderId = resource?.supplementary_data?.related_ids?.order_id?.trim() ?? "";

  // Successful capture -> grant access.
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const plate = await resolvePlate(resource?.custom_id, orderId);
    if (!orderId || !plate) {
      // Cannot identify the order; retrying a malformed event will not help, so
      // acknowledge but log loudly for diagnosis.
      console.error("PayPal webhook: cannot resolve order/plate for capture", {
        captureId: resource?.id,
        orderId,
        customId: resource?.custom_id
      });
      return NextResponse.json({ ok: true, skipped: "unresolved" });
    }

    const capture: PaypalCaptureLike = {
      status: "COMPLETED",
      id: resource?.id,
      purchase_units: [
        {
          payments: {
            captures: [{ id: resource?.id, amount: resource?.amount, status: resource?.status ?? "COMPLETED" }]
          }
        }
      ]
    };

    try {
      await fulfillFromCapture({ orderId, plate, locale: "nl", capture });
    } catch (error) {
      // Transient failure (e.g. DB unavailable): a non-2xx makes PayPal retry.
      console.error("PayPal webhook: fulfilment failed, requesting retry", { orderId, plate, error });
      return NextResponse.json({ error: "Fulfilment failed." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  // Failed capture -> record FAILED (never grants access). Best-effort bookkeeping.
  if (event.event_type === "PAYMENT.CAPTURE.DENIED" || event.event_type === "PAYMENT.CAPTURE.DECLINED") {
    if (orderId) {
      try {
        await connectMongo();
        await PlatePaymentModel.updateOne(
          { orderId, status: { $ne: "COMPLETED" } },
          { $set: { status: "FAILED" } }
        );
      } catch {
        // no-op
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
