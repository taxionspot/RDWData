import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongodb";
import { CheckoutLeadModel } from "@/models/CheckoutLead";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { sendEmail } from "@/lib/email/resend";
import { buildFollowUpEmail, type FollowUpStage } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hours after checkout abandonment at which follow-up stages 1, 2 and 3 are due.
// Matches the annuleren.com cadence (about 1 hour, 24 hours, 72 hours).
// NOTE: precise 1h/24h timing needs this endpoint triggered hourly. The Vercel
// Hobby plan only allows a DAILY cron, so the built-in cron approximates the
// cadence (one stage per day). Trigger this URL hourly from an external
// scheduler (with the CRON_SECRET bearer) for the exact 1h/24h/72h timing.
const STAGE_DELAYS_HOURS = [1, 24, 72];
const MAX_STAGE = STAGE_DELAYS_HOURS.length;
const MAX_LEAD_AGE_DAYS = 10; // must cover the 72h (3 day) window plus slack
const BATCH_SIZE = 100;

function currentStage(lead: { followUpCount?: number; followUpSentAt?: Date | null }): number {
  if (typeof lead.followUpCount === "number") return lead.followUpCount;
  // Legacy leads only had a single followUpSentAt flag.
  return lead.followUpSentAt ? 1 : 0;
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
    const minCreatedAt = new Date(now - MAX_LEAD_AGE_DAYS * 24 * 60 * 60_000);

    const leads = await CheckoutLeadModel.find({
      status: "pending",
      createdAt: { $gte: minCreatedAt }
    })
      .sort({ createdAt: 1 })
      .limit(BATCH_SIZE)
      .lean();

    let sent = 0;
    let converted = 0;
    let failed = 0;
    let skipped = 0;

    for (const lead of leads) {
      try {
        // Convert if a payment came in since the lead was captured.
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

        const count = currentStage(lead);
        if (count >= MAX_STAGE) {
          await CheckoutLeadModel.updateOne({ _id: lead._id }, { $set: { status: "completed" } });
          continue;
        }

        // Stage is due when enough time has passed since abandonment.
        const dueAt = new Date(lead.createdAt).getTime() + STAGE_DELAYS_HOURS[count] * 60 * 60_000;
        if (now < dueAt) {
          skipped += 1;
          continue;
        }

        const newCount = count + 1;

        // Atomically CLAIM this stage before sending, so an overlapping or
        // retried run can never send the same stage twice (the user's main
        // complaint was too many emails). The $exists:false branch claims
        // legacy leads that predate followUpCount. Only one caller wins.
        const claimed = await CheckoutLeadModel.findOneAndUpdate(
          {
            _id: lead._id,
            status: "pending",
            $or: [{ followUpCount: count }, { followUpCount: { $exists: false } }]
          },
          {
            $set: {
              followUpCount: newCount,
              lastFollowUpAt: new Date(),
              // Keep the legacy single-send sentinel meaningful: set it only on the first stage.
              ...(newCount === 1 ? { followUpSentAt: new Date() } : {}),
              ...(newCount >= MAX_STAGE ? { status: "completed" } : {})
            }
          }
        );
        if (!claimed) {
          skipped += 1;
          continue;
        }

        const stage = newCount as FollowUpStage;
        const { subject, html } = buildFollowUpEmail({ plate: lead.plate, locale: lead.locale, stage });
        const result = await sendEmail({ to: lead.email, subject, html });

        if (result.delivered) {
          sent += 1;
        } else {
          failed += 1;
          // Mailer is down/misconfigured: stop the batch (stage already claimed
          // for this lead; the remaining leads will be retried next run).
          if (result.reason === "EMAIL_PROVIDER_NOT_CONFIGURED") break;
        }
      } catch (err) {
        // One lead's failure must never abort the whole batch.
        failed += 1;
        console.error("abandoned-checkout: lead processing failed", { id: String(lead._id), err });
      }
    }

    return NextResponse.json({ ok: true, processed: leads.length, sent, converted, failed, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Abandoned checkout job failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
