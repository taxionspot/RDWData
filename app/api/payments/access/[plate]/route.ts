import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { CheckoutLeadModel } from "@/models/CheckoutLead";
import { hasPaidPlateAccess, isDemoAccessEnabled, isCompEmail, COMP_COOKIE } from "@/lib/payments/server-access";
import { sendEmail } from "@/lib/email/resend";
import { buildThankYouEmail } from "@/lib/email/templates";
import { buildReportPdfForEmail } from "@/lib/api/report-email";

export const runtime = "nodejs";
// PDF build (<=6s) + one email send (<=7.5s) on the comp path; give it headroom.
export const maxDuration = 30;

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

    // Comp (owner test) access: an allowlisted owner email unlocks the real
    // paid flow without paying. It is SESSION-scoped via a cookie (set below),
    // NOT a global plate record, so it can never unlock the plate for anyone
    // else. Demo grants stay free/0.00 and only work when demo access is on.
    const comp = isCompEmail(email);

    if (!comp && !isDemoAccessEnabled()) {
      return NextResponse.json({ ok: false, error: "Demo access is disabled." }, { status: 403 });
    }

    const plate = normalizePlate(params.plate ?? "");
    if (!plate) {
      return NextResponse.json({ ok: false, error: "Invalid plate." }, { status: 400 });
    }

    if (email) {
      try {
        await connectMongo();
        await CheckoutLeadModel.updateMany({ email, plate }, { $set: { status: "converted" } });
      } catch {
        // Lead bookkeeping must never block the grant.
      }
    }

    if (comp) {
      const res = NextResponse.json({ ok: true, paid: true, plate });
      res.cookies.set(COMP_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 180
      });

      // Send the report email to the owner's allowlisted address so they can
      // verify delivery and the Gmail/Vercel config. Mirrors the pattern in
      // lib/payments/fulfill.ts (link mail + best-effort PDF, both non-blocking,
      // failures logged but never thrown). The grant cookie above is already set
      // so even a total mail failure returns ok:true.
      if (email) {
        const orderId = `comp-${plate}-${Date.now()}`;
        const locale = "nl" as const;

        // buildReportPdfForEmail is already capped (~8s) and returns null on a
        // slow/failed build. Send EXACTLY ONE email with the PDF attached when it
        // built in time, link-only otherwise (no separate PDF mail).
        const pdfBase64 = await buildReportPdfForEmail(plate, locale);

        try {
          const { subject, html } = buildThankYouEmail({ plate, amount: "0.00", currency: "EUR", orderId, locale, hasPdf: pdfBase64 !== null });
          const result = await sendEmail({
            to: email,
            subject,
            html,
            attachments: pdfBase64 ? [{ filename: `kentekenrapport-${plate}.pdf`, content: pdfBase64 }] : undefined
          });
          if (!result.delivered) {
            console.error("comp access: thank-you mail not delivered", { plate, email, reason: result.reason });
          }
        } catch (err) {
          console.error("comp access: thank-you mail threw", { plate, email, err });
        }
      }

      return res;
    }

    // Demo grant: a free per-plate record, only when demo access is enabled.
    await connectMongo();
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

    return NextResponse.json({ ok: true, paid: true, plate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to grant demo access.";
    return NextResponse.json({ ok: false, paid: false, error: message }, { status: 500 });
  }
}
