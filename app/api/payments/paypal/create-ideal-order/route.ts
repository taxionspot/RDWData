import { NextResponse } from "next/server";
import { createPaypalIdealOrder } from "@/lib/payments/paypal";
import { getSiteSettings } from "@/lib/site-settings/service";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateIdealBody = {
  plate: string;
  name: string;
  email?: string;
};

function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateIdealBody;
    const plate = normalizePlate(body.plate ?? "");
    const name = (body.name ?? "").trim();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!plate) {
      return NextResponse.json({ error: "Missing plate." }, { status: 400 });
    }
    if (name.length < 2) {
      return NextResponse.json(
        { error: "Vul je naam in om met iDEAL te betalen.", code: "IDEAL_NAME_REQUIRED" },
        { status: 400 }
      );
    }

    // Price always comes from server-side settings; never trust a client amount.
    const settings = await getSiteSettings();
    const amount = settings.payment.amount;
    const currency = settings.payment.currency;
    const customId = `plate:${plate}`;

    // Hand the buyer back to us after the bank step. The webhook is the backstop
    // when the buyer never returns (closed tab), so this stays best-effort.
    const origin = new URL(request.url).origin;
    const returnUrl = `${origin}/api/payments/paypal/ideal-return?plate=${encodeURIComponent(plate)}`;
    const cancelUrl = `${origin}/search/${encodeURIComponent(plate)}?checkout=cancelled`;

    const order = await createPaypalIdealOrder({
      amount,
      currency,
      customId,
      description: `Kentekenrapport full unlock for ${plate}`,
      name,
      returnUrl,
      cancelUrl
    });

    // Stash a PENDING record so the return handler / webhook can recover the
    // buyer's email for the thank-you mail. PENDING never grants access
    // (hasCompletedPlatePayment requires COMPLETED).
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
    } catch {
      // A failed PENDING write must not block starting the payment; the webhook
      // can still fulfil from the order's custom_id.
    }

    return NextResponse.json({ id: order.id, redirect: order.payerActionUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create iDEAL order.";
    const upper = message.toUpperCase();
    if (upper.includes("PAYPAL AUTH FAILED") || upper.includes("MISSING PAYPAL_CLIENT_ID")) {
      return NextResponse.json(
        { error: "Betalen is tijdelijk niet beschikbaar. Probeer het zo opnieuw.", code: "PAYPAL_CONFIG_ERROR" },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "iDEAL kon niet worden gestart. Kies een andere methode of probeer opnieuw.", code: "IDEAL_CREATE_FAILED" },
      { status: 500 }
    );
  }
}
