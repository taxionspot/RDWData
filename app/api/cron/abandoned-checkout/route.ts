import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongodb";
import { CheckoutLeadModel } from "@/models/CheckoutLead";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { sendEmail } from "@/lib/email/resend";
import { buildFollowUpEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEAD_AGE_DAYS = 7;
const BATCH_SIZE = 50;

function getFollowUpDelayMinutes(): number {
  const parsed = Number(process.env.ABANDONED_CHECKOUT_DELAY_MINUTES ?? "60");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  if (secret) {
    if (authorization !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }

  try {
    await connectMongo();

    const now = Date.now();
    const cutoff = new Date(now - getFollowUpDelayMinutes() * 60_000);
    const minCreatedAt = new Date(now - MAX_LEAD_AGE_DAYS * 24 * 60 * 60_000);

    const leads = await CheckoutLeadModel.find({
      status: "pending",
      followUpSentAt: null,
      updatedAt: { $lte: cutoff },
      createdAt: { $gte: minCreatedAt }
    })
      .limit(BATCH_SIZE)
      .lean();

    let sent = 0;
    let converted = 0;
    let failed = 0;

    for (const lead of leads) {
      const paid = await PlatePaymentModel.exists({
        plate: lead.plate,
        email: lead.email,
        status: "COMPLETED"
      });
      if (paid) {
        await CheckoutLeadModel.updateOne({ _id: lead._id }, { $set: { status: "converted" } });
        converted += 1;
        continue;
      }

      const { subject, html } = buildFollowUpEmail({ plate: lead.plate, locale: lead.locale });
      const result = await sendEmail({ to: lead.email, subject, html });
      if (result.delivered) {
        await CheckoutLeadModel.updateOne({ _id: lead._id }, { $set: { followUpSentAt: new Date() } });
        sent += 1;
      } else {
        failed += 1;
        if (result.reason === "EMAIL_PROVIDER_NOT_CONFIGURED") break;
      }
    }

    return NextResponse.json({ ok: true, processed: leads.length, sent, converted, failed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Abandoned checkout job failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
