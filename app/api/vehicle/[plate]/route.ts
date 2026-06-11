import { NextResponse } from "next/server";
import { getVehicleProfile } from "@/lib/rdw/service";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { errorResponse } from "@/lib/api/errors";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { buildFallbackVehicleAiReport, generateVehicleAiReport } from "@/lib/api/claude";
import { getSiteSettings } from "@/lib/site-settings/service";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { generateVehicleReportHtml } from "@/lib/api/report-template";
import { generateVehicleReportPdf } from "@/lib/api/pdf-report";
import { applyMileageValuationOverride } from "@/lib/api/market-value";
import { cookies } from "next/headers";
import { USER_SESSION_COOKIE, verifyUserSession } from "@/lib/user/auth";
import { ReportDownloadModel } from "@/models/ReportDownload";
import { isSamplePlate } from "@/lib/sample";

type Params = { params: { plate: string } };

function parseLocale(input: string | null): Locale {
  return input === "en" ? "en" : "nl";
}

function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

function parseUserMileage(input: string | null): number | null {
  if (!input) return null;
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

async function hasPaidReportAccess(plate: string): Promise<boolean> {
  // The public sample report is always free, like carfax.eu's example report.
  if (isSamplePlate(plate)) return true;

  const demoBypassEnabled =
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEMO_SKIP_PAYMENT === "true";
  if (demoBypassEnabled) return true;

  const settings = await getSiteSettings();
  const paymentRequired = settings.paymentEnabled && settings.lockSections.reportDownload;
  if (!paymentRequired) return true;
  await connectMongo();
  const hasPaid = await PlatePaymentModel.exists({ plate, status: "COMPLETED", provider: "paypal" });
  return Boolean(hasPaid);
}

async function buildLocalizedWithAi(plate: string, locale: Locale, userMileage: number | null) {
  const profile = await getVehicleProfile(plate);
  let localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
  localized = applyMileageValuationOverride(localized, userMileage);
  if (userMileage !== null) {
    const enriched = ((localized.enriched ?? {}) as Record<string, unknown>);
    localized.enriched = {
      ...enriched,
      userMileageInput: userMileage,
      userMileageDelta:
        Number.isFinite(Number(enriched.estimatedMileageNow)) ? Math.round(userMileage - Number(enriched.estimatedMileageNow)) : null,
      userMileagePlausible:
        Number.isFinite(Number(enriched.estimatedMileageNow))
          ? Math.abs(userMileage - Number(enriched.estimatedMileageNow)) <= Math.max(40000, Number(enriched.estimatedMileageNow) * 0.35)
          : null
    };
  }
  try {
    const aiReport = await generateVehicleAiReport({
      plate,
      locale,
      vehicleData: {
        ...localized,
        userContext: userMileage !== null ? { mileageInput: userMileage } : undefined
      }
    });
    return {
      localized,
      aiInsights: aiReport.insights,
      aiValuation: aiReport.valuation
    };
  } catch {
    const fallback = buildFallbackVehicleAiReport({ locale, vehicleData: localized });
    return {
      localized,
      aiInsights: fallback.insights,
      aiValuation: fallback.valuation
    };
  }
}

async function trackReportIfUserLoggedIn(args: {
  plate: string;
  locale: Locale;
  channel: "download" | "email";
}) {
  const token = cookies().get(USER_SESSION_COOKIE)?.value;
  const session = verifyUserSession(token);
  if (!session) return;
  await connectMongo();
  await ReportDownloadModel.create({
    userId: session.sub,
    plate: args.plate,
    locale: args.locale,
    channel: args.channel
  });
}

async function sendReportEmail(args: {
  to: string;
  plate: string;
  locale: Locale;
  html: string;
  pdfBase64?: string;
}): Promise<{ delivered: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.REPORT_EMAIL_FROM ?? "Kentekenrapport <noreply@kentekenrapport.nl>";
  if (!apiKey) {
    return { delivered: false, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }

  const subject = args.locale === "nl" ? `Kentekenrapport voor ${args.plate}` : `Vehicle report for ${args.plate}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject,
      html: args.html,
      ...(args.pdfBase64
        ? {
            attachments: [
              {
                filename: `kentekenrapport-${args.plate}.pdf`,
                content: args.pdfBase64
              }
            ]
          }
        : {})
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const details = await response.text();
    return { delivered: false, reason: `EMAIL_SEND_FAILED:${response.status}:${details}` };
  }
  return { delivered: true };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const url = new URL(request.url);
    const plate = parsePlateOrThrow(params.plate);
    const locale = parseLocale(url.searchParams.get("lang"));
    const includeAi = url.searchParams.get("include_ai") === "1";
    const downloadReport = url.searchParams.get("download") === "1";
    const userMileage = parseUserMileage(url.searchParams.get("mileage"));

    if (!includeAi && !downloadReport) {
      const profile = await getVehicleProfile(plate);
      const localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
      return NextResponse.json(localized);
    }

    const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(plate, locale, userMileage);

    if (downloadReport) {
      const hasAccess = await hasPaidReportAccess(plate);
      if (!hasAccess) {
        return NextResponse.json({ error: "Payment required for report download.", code: "PAYMENT_REQUIRED" }, { status: 402 });
      }
      const pdf = await generateVehicleReportPdf({
        plate,
        locale,
        generatedAt: new Date(),
        data: localized,
        aiInsights,
        aiValuation
      });
      await trackReportIfUserLoggedIn({ plate, locale, channel: "download" });
      // Sample report opens inline in the browser; paid reports download.
      const disposition = isSamplePlate(plate)
        ? `inline; filename="voorbeeld-kentekenrapport-${plate}.pdf"`
        : `attachment; filename="kentekenrapport-${plate}.pdf"`;
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": disposition
        }
      });
    }

    return NextResponse.json({
      ...localized,
      aiInsights,
      aiValuation
    });
  } catch (error) {
    return errorResponse(error, "Unknown lookup error.");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const plate = parsePlateOrThrow(params.plate);
    const body = (await request.json()) as { email?: string; lang?: string };
    const locale = parseLocale(body.lang ?? null);
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email address.", code: "INVALID_EMAIL" }, { status: 400 });
    }

    const hasAccess = await hasPaidReportAccess(plate);
    if (!hasAccess) {
      return NextResponse.json({ error: "Payment required for report email.", code: "PAYMENT_REQUIRED" }, { status: 402 });
    }

    const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(plate, locale, null);
    const html = generateVehicleReportHtml({
      plate,
      locale,
      generatedAt: new Date(),
      score: {
        score: Number((localized.enriched as Record<string, unknown> | undefined)?.apkPassChance ?? 0),
        label: locale === "nl" ? "Voertuigscore" : "Vehicle score"
      },
      data: localized,
      aiInsights,
      aiValuation
    });
    const pdf = await generateVehicleReportPdf({
      plate,
      locale,
      generatedAt: new Date(),
      data: localized,
      aiInsights,
      aiValuation
    });
    const result = await sendReportEmail({
      to: email,
      plate,
      locale,
      html,
      pdfBase64: pdf.toString("base64")
    });
    await trackReportIfUserLoggedIn({ plate, locale, channel: "email" });
    return NextResponse.json({
      ok: true,
      delivered: result.delivered,
      reason: result.reason ?? null
    });
  } catch (error) {
    return errorResponse(error, "Unable to send report email.");
  }
}
