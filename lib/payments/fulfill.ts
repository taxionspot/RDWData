import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { CheckoutLeadModel } from "@/models/CheckoutLead";
import { sendEmail } from "@/lib/email/resend";
import { buildThankYouEmail } from "@/lib/email/templates";
import { buildReportPdfForEmail } from "@/lib/api/report-email";

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

  // Recover email from the PENDING row when not passed in from the caller.
  // This is the primary recovery path for the card/wallet capture path.
  if (!email) {
    try {
      const row = await PlatePaymentModel.findOne({ orderId: args.orderId }).lean();
      if (row?.email) email = row.email.trim().toLowerCase();
    } catch {
      // best effort
    }
  }

  // comp-/demo- orders: grant access, send nothing.
  const isCompOrder = args.orderId.startsWith("comp-") || args.orderId.startsWith("demo-");

  if (!isCompOrder && email) {
    // Post-payment extras must never fail fulfilment. Each step is independent.

    // Convert abandoned-checkout lead.
    try {
      await CheckoutLeadModel.updateMany({ email, plate: args.plate }, { $set: { status: "converted" } });
    } catch {
      // best effort
    }

    // Step A: guaranteed link-only thank-you email (fast, no AI/PDF).
    const { subject, html } = buildThankYouEmail({
      plate: args.plate,
      amount,
      currency,
      orderId: args.orderId,
      locale: args.locale
    });
    const linkMailResult = await sendEmail({ to: email, subject, html });
    if (!linkMailResult.delivered) {
      console.error("fulfill: thank-you link mail not delivered", {
        orderId: args.orderId,
        plate: args.plate,
        reason: linkMailResult.reason
      });
    }

    // Persist email delivery outcome on the PlatePayment record.
    const emailDelivered = linkMailResult.delivered;
    const emailReason = linkMailResult.reason;
    try {
      await PlatePaymentModel.updateOne(
        { orderId: args.orderId },
        { $set: { emailDelivered, ...(emailReason ? { emailReason } : {}) } }
      );
    } catch {
      // best effort: persisting the delivery status must not block the response
    }

    // Step B: best-effort PDF attachment. Capped at a hard 6s wall-clock limit
    // so the capture HTTP response is never blocked for more than ~6s total
    // (link mail already sent; PDF is bonus-only). This replaces a bare
    // await that could hold the response for 10-18s.
    //
    // Note: unstable_after (Next.js 15+) is not available in this codebase
    // (Next 14.2.x), so we use the timeout-race fallback instead.
    await sendPdfEmailWithTimeout({
      plate: args.plate,
      locale: args.locale,
      email,
      amount,
      currency,
      orderId: args.orderId
    });
  }

  return { ok: true, status: "COMPLETED", amount, currency };
}

/** Maximum wall-clock time the PDF build + PDF send may consume on the capture path. */
const PDF_EMAIL_TIMEOUT_MS = 6000;

/**
 * Build and send the PDF thank-you email, bounded by a hard 6s timeout.
 * Races the real work against a timer; whichever resolves first wins and
 * the capture response is unblocked. Failures are swallowed (link mail
 * in Step A already guaranteed delivery).
 */
async function sendPdfEmailWithTimeout(args: {
  plate: string;
  locale: "nl" | "en";
  email: string;
  amount: string;
  currency: string;
  orderId: string;
}): Promise<void> {
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, PDF_EMAIL_TIMEOUT_MS));
  const work = (async () => {
    try {
      const pdfBase64 = await buildReportPdfForEmail(args.plate, args.locale);
      if (pdfBase64) {
        const pdfSubject = args.locale === "nl"
          ? `Je kentekenrapport ${args.plate} (PDF)`
          : `Your vehicle report ${args.plate} (PDF)`;
        const pdfHtml = buildThankYouEmail({
          plate: args.plate,
          amount: args.amount,
          currency: args.currency,
          orderId: args.orderId,
          locale: args.locale
        }).html;
        await sendEmail({
          to: args.email,
          subject: pdfSubject,
          html: pdfHtml,
          attachments: [{ filename: `kentekenrapport-${args.plate}.pdf`, content: pdfBase64 }]
        });
      }
    } catch {
      // PDF mail failure must never affect the capture response or the link mail.
    }
  })();
  // Race: whichever settles first wins; the other branch is abandoned.
  await Promise.race([work, deadline]);
}
