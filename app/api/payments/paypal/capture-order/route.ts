import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { capturePaypalOrder } from "@/lib/payments/paypal";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { getExpectedReportPrice, isCapturedAmountSufficient } from "@/lib/payments/server-access";
import { USER_SESSION_COOKIE, verifyUserSession } from "@/lib/user/auth";

export const runtime = "nodejs";

type CaptureBody = {
  orderId: string;
  plate: string;
  email?: string;
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

    if (!orderId || !plate) {
      return NextResponse.json({ error: "Missing orderId or plate." }, { status: 400 });
    }

    const capture = (await capturePaypalOrder(orderId)) as {
      status?: string;
      id?: string;
      purchase_units?: Array<{
        custom_id?: string;
        payments?: {
          captures?: Array<{
            id?: string;
            custom_id?: string;
            amount?: { value?: string; currency_code?: string };
            status?: string;
          }>;
        };
      }>;
    };

    const unit = capture.purchase_units?.[0];
    const firstCapture = unit?.payments?.captures?.[0];
    const captureStatus = firstCapture?.status ?? capture.status ?? "UNKNOWN";

    if (captureStatus !== "COMPLETED") {
      return NextResponse.json(
        { error: `PayPal capture not completed: ${captureStatus}`, code: "CAPTURE_NOT_COMPLETED" },
        { status: 402 }
      );
    }

    // 1) The order must be bound to the plate it was created for. The order's
    //    custom_id is "plate:<PLATE>" (see create-order). This prevents paying
    //    once and then unlocking a different plate by passing another value.
    // With Prefer: return=representation the capture echoes the order's
    // custom_id ("plate:<PLATE>"). Enforce the binding when present; if a
    // minimal/edge response omits it, fail open here and rely on the amount
    // check below rather than rejecting an already-paid order.
    const customId = unit?.custom_id ?? firstCapture?.custom_id ?? "";
    if (customId && customId !== `plate:${plate}`) {
      return NextResponse.json(
        { error: "Payment does not match the requested plate.", code: "PLATE_MISMATCH" },
        { status: 400 }
      );
    }

    // 2) The captured amount must at least cover the server-side price. This
    //    blocks the create-order amount-tampering path (e.g. capturing €0.01).
    const expected = await getExpectedReportPrice();
    const capturedAmount = firstCapture?.amount?.value;
    const capturedCurrency = firstCapture?.amount?.currency_code;
    if (!isCapturedAmountSufficient({ amount: capturedAmount, currency: capturedCurrency }, expected)) {
      return NextResponse.json(
        { error: "Captured amount does not match the report price.", code: "AMOUNT_MISMATCH" },
        { status: 402 }
      );
    }

    // Bind the purchase to a logged-in buyer when we have a session (best-effort).
    const session = verifyUserSession(cookies().get(USER_SESSION_COOKIE)?.value);

    await connectMongo();
    await PlatePaymentModel.updateOne(
      { orderId },
      {
        $set: {
          plate,
          orderId,
          ...(email ? { email } : {}),
          ...(session ? { userId: session.sub } : {}),
          captureId: firstCapture?.id ?? capture.id ?? orderId,
          amount: capturedAmount,
          currency: capturedCurrency ?? expected.currency,
          status: "COMPLETED",
          provider: "paypal"
        },
        // Preserve the original capture timestamp across idempotent retries.
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, plate, orderId, status: "COMPLETED" });
  } catch (error) {
    const mapped = mapCaptureError(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}
