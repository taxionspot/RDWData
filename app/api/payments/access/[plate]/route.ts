import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { hasPaidPlateAccess, isDemoBypassEnabled } from "@/lib/payments/server-access";

export const runtime = "nodejs";

type Params = { params: { plate: string } };

function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export async function GET(_: Request, { params }: Params) {
  try {
    const plate = normalizePlate(params.plate ?? "");
    if (!plate) {
      return NextResponse.json({ paid: false }, { status: 400 });
    }
    const paid = await hasPaidPlateAccess(plate);
    return NextResponse.json({ paid });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check access.";
    return NextResponse.json({ paid: false, error: message }, { status: 500 });
  }
}

/**
 * Demo-only access grant.
 *
 * Previously this endpoint unconditionally created a COMPLETED "paypal" payment
 * for ANY plate with no authentication — making every paid report free. It is
 * now hard-gated behind the server-side demo bypass and writes a clearly
 * labelled "demo" record (which never counts as a real entitlement once the
 * bypass is turned off).
 */
export async function POST(request: Request, { params }: Params) {
  try {
    if (!isDemoBypassEnabled()) {
      return NextResponse.json(
        { ok: false, error: "Demo access is disabled.", code: "DEMO_DISABLED" },
        { status: 403 }
      );
    }

    const plate = normalizePlate(params.plate ?? "");
    if (!plate) {
      return NextResponse.json({ ok: false, error: "Invalid plate." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const orderId = `demo-${plate}-${Date.now()}`;

    await connectMongo();
    await PlatePaymentModel.create({
      plate,
      orderId,
      captureId: orderId,
      ...(email ? { email } : {}),
      amount: "0.00",
      currency: "EUR",
      status: "COMPLETED",
      provider: "demo",
      createdAt: new Date()
    });

    return NextResponse.json({ ok: true, paid: true, plate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to grant demo access.";
    return NextResponse.json({ ok: false, paid: false, error: message }, { status: 500 });
  }
}
