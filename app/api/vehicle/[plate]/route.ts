import { NextResponse } from "next/server";
import { getVehicleProfile } from "@/lib/rdw/service";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { errorResponse } from "@/lib/api/errors";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { buildFallbackVehicleAiReport } from "@/lib/api/claude";
import { getOrGenerateVehicleAiReport } from "@/lib/api/ai-report-cache";
import { connectMongo } from "@/lib/db/mongodb";
import { hasPaidPlateAccess } from "@/lib/payments/server-access";
import { generateVehicleReportHtml } from "@/lib/api/report-template";
import { generateVehicleReportPdf } from "@/lib/api/pdf-report";
import { applyMileageValuationOverride } from "@/lib/api/market-value";
import { cookies } from "next/headers";
import { USER_SESSION_COOKIE, verifyUserSession } from "@/lib/user/auth";
import { ReportDownloadModel } from "@/models/ReportDownload";

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
  let aiInsights;
  let aiValuation;
  try {
    const aiReport = await getOrGenerateVehicleAiReport({
      plate,
      locale,
      mileage: userMileage,
      vehicleData: {
        ...localized,
        userContext: userMileage !== null ? { mileageInput: userMileage } : undefined
      }
    });
    aiInsights = aiReport.insights;
    aiValuation = aiReport.valuation;
  } catch {
    const fallback = buildFallbackVehicleAiReport({ locale, vehicleData: localized });
    aiInsights = fallback.insights;
    aiValuation = fallback.valuation;
  }

  // Consolidate to ONE canonical headline value. The model valuation (enriched)
  // is authoritative; when it is unavailable (e.g. no catalogue price) we fall
  // back to the AI valuation so the hero, cards and PDF all show the same
  // number instead of three that disagree. The AI figure remains visible as a
  // labelled second opinion in its own section.
  const enriched = (localized.enriched ?? {}) as Record<string, unknown>;
  if (enriched.estimatedValueNow == null && aiValuation) {
    localized.enriched = {
      ...enriched,
      estimatedValueNow: aiValuation.estimatedValueNow,
      estimatedValueMin: aiValuation.estimatedValueMin,
      estimatedValueMax: aiValuation.estimatedValueMax,
      marketValueConfidence: enriched.marketValueConfidence ?? aiValuation.confidence,
      marketValueSource: "ai"
    };
  } else {
    localized.enriched = { ...enriched, marketValueSource: "model" };
  }

  return { localized, aiInsights, aiValuation };
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
      const hasAccess = await hasPaidPlateAccess(plate);
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
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="kentekenrapport-${plate}.pdf"`
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

    const hasAccess = await hasPaidPlateAccess(plate);
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
