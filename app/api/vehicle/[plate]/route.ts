import { NextResponse } from "next/server";
import { getVehicleProfile } from "@/lib/rdw/service";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { errorResponse } from "@/lib/api/errors";
import { localizeVehicleProfile } from "@/lib/i18n/vehicle";
import type { Locale } from "@/lib/i18n/messages";
import { buildFallbackVehicleAiReport, generateVehicleAiReport } from "@/lib/api/claude";
import { getSiteSettings } from "@/lib/site-settings/service";
import { connectMongo } from "@/lib/db/mongodb";
import { generateVehicleReportHtml } from "@/lib/api/report-template";
import { generateVehicleReportPdf } from "@/lib/api/pdf-report";
import { alignValuationWithFormula, applyMileageValuationOverride } from "@/lib/api/market-value";
import { hasPaidPlateAccess } from "@/lib/payments/server-access";
import { cookies } from "next/headers";
import { USER_SESSION_COOKIE, verifyUserSession } from "@/lib/user/auth";
import { ReportDownloadModel } from "@/models/ReportDownload";
import { getEmailFrom } from "@/lib/email/resend";
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
  // Report download honours the admin lock toggle; everything else
  // (sample plate, demo mode, real payment) lives in hasPaidPlateAccess.
  const settings = await getSiteSettings();
  if (settings.paymentEnabled && !settings.lockSections.reportDownload) return true;
  return hasPaidPlateAccess(plate);
}

const AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * AI output is cached per plate+locale (mileage rounded to 5.000 km buckets)
 * and shared across all visitors: the same car yields the same analysis, so
 * one Claude call serves everyone for a week.
 */
function aiCacheKey(plate: string, locale: Locale, userMileage: number | null): string {
  const bucket = userMileage === null ? "" : String(Math.round(userMileage / 5000) * 5000);
  // v2: invalidates entries from before the valuation was forced to follow
  // our own formula (old explanations could mention AI-invented amounts).
  return `v2|${plate}|${locale}|${bucket}`;
}

async function readAiCache(key: string): Promise<{ insights: unknown; valuation: unknown } | null> {
  try {
    await connectMongo();
    const { AiReportCacheModel } = await import("@/models/AiReportCache");
    const doc = await AiReportCacheModel.findById(key).lean();
    if (doc && doc.expiresAt && new Date(doc.expiresAt).getTime() > Date.now() && doc.insights) {
      return { insights: doc.insights, valuation: doc.valuation };
    }
  } catch {
    // cache unavailable: fall through to live generation
  }
  return null;
}

async function writeAiCache(key: string, insights: unknown, valuation: unknown): Promise<void> {
  try {
    await connectMongo();
    const { AiReportCacheModel } = await import("@/models/AiReportCache");
    await AiReportCacheModel.findByIdAndUpdate(
      key,
      { _id: key, insights, valuation, createdAt: new Date(), expiresAt: new Date(Date.now() + AI_CACHE_TTL_MS) },
      { upsert: true }
    );
  } catch {
    // best effort
  }
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

  const cacheKey = aiCacheKey(plate, locale, userMileage);
  const cached = await readAiCache(cacheKey);
  if (cached) {
    return {
      localized,
      aiInsights: cached.insights as ReturnType<typeof buildFallbackVehicleAiReport>["insights"],
      // Cached valuations also get the formula amounts forced in, so stale
      // cache entries can never show AI-invented values.
      aiValuation: alignValuationWithFormula(
        localized,
        cached.valuation as ReturnType<typeof buildFallbackVehicleAiReport>["valuation"]
      )
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
    await writeAiCache(cacheKey, aiReport.insights, aiReport.valuation);
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
  const from = getEmailFrom();
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

    if (downloadReport) {
      // Access first: unpaid download attempts must not trigger AI calls.
      const hasAccess = await hasPaidReportAccess(plate);
      if (!hasAccess) {
        return NextResponse.json({ error: "Payment required for report download.", code: "PAYMENT_REQUIRED" }, { status: 402 });
      }
      const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(plate, locale, userMileage);
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

    // AI insights and valuation are paid content: without access the JSON
    // only carries the open data plus our own formula values (server-side
    // gating, the UI blur is no longer the only protection). This also
    // avoids Claude costs for visitors who never pay.
    const hasAiAccess = await hasPaidPlateAccess(plate);
    if (!hasAiAccess) {
      const profile = await getVehicleProfile(plate);
      let localized = localizeVehicleProfile(profile, locale) as Record<string, unknown>;
      localized = applyMileageValuationOverride(localized, userMileage);
      return NextResponse.json({
        ...localized,
        aiInsights: null,
        aiValuation: null
      });
    }

    const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(plate, locale, userMileage);
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
    const body = (await request.json()) as { email?: string; lang?: string; mileage?: number };
    const locale = parseLocale(body.lang ?? null);
    const email = String(body.email ?? "").trim().toLowerCase();
    const userMileage = parseUserMileage(
      body.mileage === undefined || body.mileage === null ? null : String(body.mileage)
    );
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email address.", code: "INVALID_EMAIL" }, { status: 400 });
    }

    const hasAccess = await hasPaidReportAccess(plate);
    if (!hasAccess) {
      return NextResponse.json({ error: "Payment required for report email.", code: "PAYMENT_REQUIRED" }, { status: 402 });
    }

    const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(plate, locale, userMileage);
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
