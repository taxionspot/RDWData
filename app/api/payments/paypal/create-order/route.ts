import { NextResponse } from "next/server";
import { createPaypalOrder, getPaypalDiagnostics, probePaypalAuth } from "@/lib/payments/paypal";
import { getSiteSettings } from "@/lib/site-settings/service";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";

export const runtime = "nodejs";

type CreateOrderBody = {
  plate: string;
  email?: string;
};

function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function mapCreateOrderError(error: unknown): { status: number; code: string; error: string } {
  const message = error instanceof Error ? error.message : "Failed to create PayPal order.";
  const upper = message.toUpperCase();
  if (upper.includes("PAYPAL AUTH FAILED") || upper.includes("MISSING PAYPAL_CLIENT_ID")) {
    return {
      status: 500,
      code: "PAYPAL_CONFIG_ERROR",
      error: "Payment is temporarily unavailable. Please try again shortly."
    };
  }
  return {
    status: 500,
    code: "PAYPAL_CREATE_ORDER_FAILED",
    error: "Unable to start payment right now. Please try again."
  };
}

export async function POST(request: Request) {
  // Safe, secret-free diagnostics for pinpointing a live/sandbox mismatch.
  if (new URL(request.url).searchParams.get("diag") === "1") {
    return NextResponse.json({ diagnostics: getPaypalDiagnostics(), auth: await probePaypalAuth() });
  }
  try {
    const body = (await request.json()) as CreateOrderBody;
    const plate = normalizePlate(body.plate ?? "");
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!plate) {
      return NextResponse.json({ error: "Missing plate." }, { status: 400 });
    }

    // Price always comes from server-side settings; never trust a client-supplied amount.
    const settings = await getSiteSettings();
    const amount = settings.payment.amount;
    const currency = settings.payment.currency;
    const customId = `plate:${plate}`;

    const order = await createPaypalOrder({
      amount,
      currency,
      customId,
      description: `Kentekenrapport full unlock for ${plate}`
    });

    // Stash a PENDING row so the capture handler / webhook can recover the
    // buyer's email for the thank-you mail when the card/wallet path is used.
    // PENDING never grants access (hasCompletedPlatePayment requires COMPLETED).
    try {
      await connectMongo();
      await PlatePaymentModel.updateOne(
        { orderId: order.id },
        {
          $set: {
            plate,
            orderId: order.id,
            ...(email ? { email } : {}),
            captureId: order.id,
            amount,
            currency,
            status: "PENDING",
            provider: "paypal"
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );
    } catch (pendingErr) {
      // A failed PENDING write must not block payment; access is still granted
      // on capture. Only the thank-you email address could be lost, so log it.
      console.error("create-order: PENDING record write failed", { orderId: order.id, error: pendingErr });
    }

    return NextResponse.json(order);
  } catch (error) {
    const mapped = mapCreateOrderError(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}
