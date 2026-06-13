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

  const completedFields = {
    plate: args.plate,
    orderId: args.orderId,
    captureId: firstCapture?.id ?? args.capture.id ?? args.orderId,
    amount,
    currency,
    status: "COMPLETED" as const,
    provider: "paypal" as const
  };

  // Atomically flip a not-yet-COMPLETED record to COMPLETED. The status filter
  // means exactly one caller (the iDEAL return handler OR the webhook, which can
  // both fire for the same order) wins the right to run the one-time side
  // effects (thank-you email + lead conversion). findOneAndUpdate is atomic, so
  // there is no check-then-act race that could send two emails.
  let email = (args.email ?? "").trim().toLowerCase();
  let weFulfilled = false;

  const prior = await PlatePaymentModel.findOneAndUpdate(
    { orderId: args.orderId, status: { $ne: "COMPLETED" } },
    { $set: completedFields },
    { new: false }
  );

  if (prior) {
    // We flipped an existing PENDING record to COMPLETED.
    weFulfilled = true;
    if (!email) email = (prior.email ?? "").trim().toLowerCase();
  } else {
    // No not-yet-COMPLETED record matched: it is either already COMPLETED, or no
    // record exists at all (the synchronous card/wallet path has no PENDING row).
    const existing = await PlatePaymentModel.findOne({ orderId: args.orderId });
    if (existing) {
      return {
        ok: true,
        status: "COMPLETED",
        amount: existing.amount ?? amount,
        currency: existing.currency ?? currency,
        alreadyFulfilled: true
      };
    }
    try {
      await PlatePaymentModel.create({
        ...completedFields,
        ...(email ? { email } : {}),
        createdAt: new Date()
      });
      weFulfilled = true;
    } catch {
      // Unique-orderId violation: a concurrent caller inserted first and owns
      // the side effects.
      return { ok: true, status: "COMPLETED", amount, currency, alreadyFulfilled: true };
    }
  }

  if (!weFulfilled) {
    return { ok: true, status: "COMPLETED", amount, currency, alreadyFulfilled: true };
  }

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
