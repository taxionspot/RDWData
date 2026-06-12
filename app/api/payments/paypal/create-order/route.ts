import { NextResponse } from "next/server";
import { createPaypalOrder } from "@/lib/payments/paypal";
import { getSiteSettings } from "@/lib/site-settings/service";

export const runtime = "nodejs";

type CreateOrderBody = {
  plate: string;
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
  try {
    const body = (await request.json()) as CreateOrderBody;
    const plate = normalizePlate(body.plate ?? "");
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

    return NextResponse.json(order);
  } catch (error) {
    const mapped = mapCreateOrderError(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}
