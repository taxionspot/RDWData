import { NextResponse } from "next/server";
import { capturePaypalOrder } from "@/lib/payments/paypal";
import { fulfillFromCapture, type PaypalCaptureLike } from "@/lib/payments/fulfill";
import { PAID_COOKIE, PAID_COOKIE_OPTIONS, paidCookieValueWith } from "@/lib/payments/server-access";

export const runtime = "nodejs";
// PDF build (<=6s) + one email send (<=7.5s) run on the capture path.
export const maxDuration = 30;

type CaptureBody = {
  orderId: string;
  plate: string;
  email?: string;
  lang?: string;
};

function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function mapCaptureError(error: unknown): { status: number; code: string; error: string } {
  const message = error instanceof Error ? error.message : "Failed to capture PayPal order.";
  const upper = message.toUpperCase();

  if (upper.includes("INSTRUMENT_DECLINED")) {
    return {
      status: 402,
      code: "INSTRUMENT_DECLINED",
      error: "Payment method was declined. Please try a different PayPal method."
    };
  }

  if (upper.includes("UNPROCESSABLE_ENTITY")) {
    return {
      status: 422,
      code: "PAYPAL_UNPROCESSABLE_ENTITY",
      error: "Payment could not be completed. Please try again."
    };
  }

  return {
    status: 500,
    code: "PAYPAL_CAPTURE_FAILED",
    error: "Payment capture failed. Please try again."
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CaptureBody;
    const orderId = body.orderId?.trim();
    const plate = normalizePlate(body.plate ?? "");
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const locale = body.lang === "en" ? ("en" as const) : ("nl" as const);

    if (!orderId || !plate) {
      return NextResponse.json({ error: "Missing orderId or plate." }, { status: 400 });
    }

    const capture = (await capturePaypalOrder(orderId)) as PaypalCaptureLike;

    // One shared, idempotent fulfilment path for every method: marks the plate
    // paid, converts the lead and sends the thank-you mail exactly once. The
    // PAYMENT.CAPTURE.COMPLETED webhook also fires for these captures; the
    // idempotency guard in fulfillFromCapture makes that a no-op (no second mail).
    const result = await fulfillFromCapture({
      orderId,
      plate,
      email: email || undefined,
      locale,
      capture
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: `PayPal capture not completed: ${result.status}` },
        { status: 402 }
      );
    }

    // Grant access to THIS browser only (per-buyer signed cookie), never globally.
    const res = NextResponse.json({
      ok: true,
      plate,
      orderId,
      status: "COMPLETED",
      amount: result.amount,
      currency: result.currency
    });
    res.cookies.set(PAID_COOKIE, paidCookieValueWith(plate), PAID_COOKIE_OPTIONS);
    return res;
  } catch (error) {
    const mapped = mapCaptureError(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}
