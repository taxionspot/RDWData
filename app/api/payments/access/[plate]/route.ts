import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { CheckoutLeadModel } from "@/models/CheckoutLead";
import { hasPaidPlateAccess, isDemoAccessEnabled, isCompEmail } from "@/lib/payments/server-access";
import { getSiteSettings } from "@/lib/site-settings/service";

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

    // The public sample plate is always open; every other plate needs a real
    // (non-demo) completed payment. Old demo records must never unlock plates.
    const paid = await hasPaidPlateAccess(plate);
    return NextResponse.json({ paid });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check access.";
    return NextResponse.json({ paid: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    // Comp grant: an allowlisted owner email may unlock the real (paid) flow
    // without paying, even in production. This writes a non-demo, non-zero
    // record so it counts under hasCompletedPlatePayment, but does not open
    // the paywall for anyone else. Demo grants stay free/0.00 and only work
    // when demo access is enabled.
    const comp = isCompEmail(email);

    // Demo grant: free access without payment. Never available in production
    // unless explicitly enabled, otherwise anyone could unlock reports for free.
    if (!comp && !isDemoAccessEnabled()) {
      return NextResponse.json({ ok: false, error: "Demo access is disabled." }, { status: 403 });
    }

    const plate = normalizePlate(params.plate ?? "");
    if (!plate) {
      return NextResponse.json({ ok: false, error: "Invalid plate." }, { status: 400 });
    }

    await connectMongo();

    if (comp) {
      // Use the real site price so the record passes the production access
      // check (which excludes demo- and amount "0.00").
      let amount = "6.95";
      let currency = "EUR";
      try {
        const settings = await getSiteSettings();
        if (settings.payment.amount) amount = settings.payment.amount;
        if (settings.payment.currency) currency = settings.payment.currency;
      } catch {
        // Fall back to the default price if settings cannot be read.
      }
      const orderId = `comp-${plate}-${Date.now()}`;
      await PlatePaymentModel.create({
        plate,
        orderId,
        captureId: orderId,
        ...(email ? { email } : {}),
        amount,
        currency,
        status: "COMPLETED",
        provider: "paypal",
        createdAt: new Date()
      });
    } else {
      const orderId = `demo-${plate}-${Date.now()}`;
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
    }

    if (email) {
      await CheckoutLeadModel.updateMany({ email, plate }, { $set: { status: "converted" } }).catch(() => {});
    }

    return NextResponse.json({ ok: true, paid: true, plate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to grant demo access.";
    return NextResponse.json({ ok: false, paid: false, error: message }, { status: 500 });
  }
}
