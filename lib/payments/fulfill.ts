import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { CheckoutLeadModel } from "@/models/CheckoutLead";
import { sendEmail } from "@/lib/email/resend";
import { buildThankYouEmail } from "@/lib/email/templates";

/** The shape we read from both a capture response and a get-order response. */
export type PaypalCaptureLike = {
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

export type FulfillResult = {
  ok: boolean;
  status: string;
  amount: string;
  currency: string;
  alreadyFulfilled?: boolean;
};

/**
 * Idempotently turn a completed PayPal capture into paid plate access: marks the
 * PlatePayment COMPLETED, converts the abandoned-checkout lead, and sends the
 * thank-you mail exactly once. Used by the iDEAL return handler and the webhook
 * (which can both fire for the same order); the COMPLETED guard makes a second
 * call a no-op so the buyer never gets two emails.
 */
export async function fulfillFromCapture(args: {
  orderId: string;
  plate: string;
  email?: string;
  locale: "nl" | "en";
  capture: PaypalCaptureLike;
}): Promise<FulfillResult> {
  const unit = args.capture.purchase_units?.[0];
  const firstCapture = unit?.payments?.captures?.[0];
  const captureStatus = firstCapture?.status ?? args.capture.status ?? "UNKNOWN";
  const amount = firstCapture?.amount?.value ?? "0.00";
  const currency = firstCapture?.amount?.currency_code ?? "EUR";

  if (captureStatus !== "COMPLETED") {
    return { ok: false, status: captureStatus, amount, currency };
  }

  await connectMongo();

  // Already fulfilled? Skip the side effects (no second thank-you email).
  const existing = await PlatePaymentModel.findOne({ orderId: args.orderId });
  if (existing?.status === "COMPLETED") {
    return {
      ok: true,
      status: "COMPLETED",
      amount: existing.amount ?? amount,
      currency: existing.currency ?? currency,
      alreadyFulfilled: true
    };
  }

  // Prefer the email captured when the iDEAL order was created.
  const email = (args.email ?? existing?.email ?? "").trim().toLowerCase();

  await PlatePaymentModel.updateOne(
    { orderId: args.orderId },
    {
      $set: {
        plate: args.plate,
        orderId: args.orderId,
        ...(email ? { email } : {}),
        captureId: firstCapture?.id ?? args.capture.id ?? args.orderId,
        amount,
        currency,
        status: "COMPLETED",
        provider: "paypal"
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );

  if (email) {
    // Post-payment extras must never fail fulfilment.
    try {
      await CheckoutLeadModel.updateMany({ email, plate: args.plate }, { $set: { status: "converted" } });
    } catch {
      // no-op
    }
    try {
      const { subject, html } = buildThankYouEmail({
        plate: args.plate,
        amount,
        currency,
        orderId: args.orderId,
        locale: args.locale
      });
      await sendEmail({ to: email, subject, html });
    } catch {
      // no-op
    }
  }

  return { ok: true, status: "COMPLETED", amount, currency };
}
