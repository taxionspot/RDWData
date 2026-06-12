import { NextResponse } from "next/server";
import { capturePaypalOrder } from "@/lib/payments/paypal";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { CheckoutLeadModel } from "@/models/CheckoutLead";
import { sendEmail } from "@/lib/email/resend";
import { buildThankYouEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

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

    const capture = (await capturePaypalOrder(orderId)) as {
      status?: string;
      id?: string;
      purchase_units?: Array<{
        payments?: {
          captures?: Array<{
            id?: string;
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
        { error: `PayPal capture not completed: ${captureStatus}` },
        { status: 402 }
      );
    }

    await connectMongo();
    await PlatePaymentModel.updateOne(
      { orderId },
      {
        $set: {
          plate,
          orderId,
          ...(email ? { email } : {}),
          captureId: firstCapture?.id ?? capture.id ?? orderId,
          amount: firstCapture?.amount?.value ?? "9.95",
          currency: firstCapture?.amount?.currency_code ?? "EUR",
          status: "COMPLETED",
          provider: "paypal",
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    const amount = firstCapture?.amount?.value ?? "9.95";
    const currency = firstCapture?.amount?.currency_code ?? "EUR";

    if (email) {
      // Post-payment extras must never fail the capture response.
      try {
        await CheckoutLeadModel.updateMany({ email, plate }, { $set: { status: "converted" } });
      } catch {
        // no-op
      }
      try {
        const { subject, html } = buildThankYouEmail({ plate, amount, currency, orderId, locale });
        await sendEmail({ to: email, subject, html });
      } catch {
        // no-op
      }
    }

    return NextResponse.json({
      ok: true,
      plate,
      orderId,
      status: "COMPLETED",
      amount,
      currency
    });
  } catch (error) {
    const mapped = mapCaptureError(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}
