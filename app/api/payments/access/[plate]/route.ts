import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { CheckoutLeadModel } from "@/models/CheckoutLead";
import { hasCompletedPlatePayment, isDemoAccessEnabled } from "@/lib/payments/server-access";

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

    // Old demo records in the database must not unlock plates for everyone.
    const paid = await hasCompletedPlatePayment(plate);
    return NextResponse.json({ paid });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check access.";
    return NextResponse.json({ paid: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    // Demo grant: free access without payment. Never available in production
    // unless explicitly enabled, otherwise anyone could unlock reports for free.
    if (!isDemoAccessEnabled()) {
      return NextResponse.json({ ok: false, error: "Demo access is disabled." }, { status: 403 });
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
      provider: "paypal",
      createdAt: new Date()
    });

    if (email) {
      await CheckoutLeadModel.updateMany({ email, plate }, { $set: { status: "converted" } }).catch(() => {});
    }

    return NextResponse.json({ ok: true, paid: true, plate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to grant demo access.";
    return NextResponse.json({ ok: false, paid: false, error: message }, { status: 500 });
  }
}
