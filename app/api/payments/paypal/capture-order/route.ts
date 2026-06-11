import { NextResponse } from "next/server";
import { capturePaypalOrder } from "@/lib/payments/paypal";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";

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

    // Confirmation email (best effort): payment received + link to the report.
    if (email && process.env.RESEND_API_KEY) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://kentekenrapport.nl";
      const from = process.env.REPORT_EMAIL_FROM ?? "Kentekenrapport <noreply@kentekenrapport.nl>";
      const reportUrl = `${baseUrl}/search/${encodeURIComponent(plate)}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
          <h2 style="color:#1d4ed8">Bedankt voor je aankoop</h2>
          <p>Je betaling van € ${firstCapture?.amount?.value ?? "6,95"} is ontvangen. Het volledige kentekenrapport voor <strong>${plate}</strong> is ontgrendeld.</p>
          <p style="margin:24px 0">
            <a href="${reportUrl}" style="background:#1d4ed8;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Bekijk je rapport</a>
          </p>
          <p>Je kunt het rapport ook als PDF downloaden via de knop in het rapport.</p>
          <p style="color:#64748b;font-size:12px;margin-top:28px">Dit rapport is gebaseerd op officiële RDW open data en eigen rekenmodellen. Waardes zijn indicatief en vormen geen aankoopadvies. Vragen? Beantwoord deze e-mail.</p>
        </div>`;
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from,
            to: [email],
            subject: `Betaling ontvangen: kentekenrapport ${plate}`,
            html
          }),
          cache: "no-store"
        });
      } catch {
        // never block the unlock on email failure
      }
    }

    return NextResponse.json({ ok: true, plate, orderId, status: "COMPLETED" });
  } catch (error) {
    const mapped = mapCaptureError(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}
