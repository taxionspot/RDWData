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
import { sanitizeDeep } from "@/lib/api/sanitize-text";
import { hasPaidPlateAccess } from "@/lib/payments/server-access";
import { redactPremiumValue } from "@/lib/api/premium-value";
import { computeVehicleSignals } from "@/lib/vehicle/signals";
import { cookies } from "next/headers";
import { USER_SESSION_COOKIE, verifyUserSession } from "@/lib/user/auth";
import { ReportDownloadModel } from "@/models/ReportDownload";
import { sendEmail } from "@/lib/email/resend";
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

// redactPremiumValue + PREMIUM_VALUE_FIELDS live in lib/api/premium-value.ts so
// the single-plate and comparison routes enforce the same premium-value rule.

/**
 * Logs OUR derived market value (not any third-party listing) once per
 * plate+locale+day, building a lawfully owned NL price time-series for a future
 * market-index data product. Best-effort: it must never block or fail the
 * lookup response.
 */
async function logMarketAggregate(plate: string, locale: Locale, localized: Record<string, unknown>): Promise<void> {
  try {
    const vehicle = (localized.vehicle ?? {}) as Record<string, unknown>;
    const enriched = (localized.enriched ?? {}) as Record<string, unknown>;
    const value = enriched.estimatedValueNow;
    // Only log real valuations with an identifiable model; skip empty lookups.
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    if (!vehicle.brand || !vehicle.tradeName) return;
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const id = `${plate}|${locale}|${day}`;
    await connectMongo();
    const { MarketValueAggregateModel } = await import("@/models/MarketValueAggregate");
    await MarketValueAggregateModel.findByIdAndUpdate(
      id,
      {
        _id: id,
        plate,
        make: (vehicle.brand as string) ?? null,
        model: (vehicle.tradeName as string) ?? null,
        year: typeof vehicle.year === "number" ? (vehicle.year as number) : null,
        fuel: (vehicle.fuelType as string) ?? null,
        bodyType: (vehicle.bodyType as string) ?? null,
        mileage: typeof enriched.estimatedMileageNow === "number" ? (enriched.estimatedMileageNow as number) : null,
        estimatedValueNow: value,
        marketValueConfidence: (enriched.marketValueConfidence as string) ?? null,
        locale,
        day,
        updatedAt: now
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch {
    // best effort: aggregate logging must never affect the lookup response
  }
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
      profile,
      localized,
      // sanitizeDeep cleans dashes from entries cached before the sanitizer
      // existed, so stale cache can never show en/em-dashes.
      aiInsights: sanitizeDeep(cached.insights as ReturnType<typeof buildFallbackVehicleAiReport>["insights"]),
      // Cached valuations also get the formula amounts forced in, so stale
      // cache entries can never show AI-invented values.
      aiValuation: sanitizeDeep(
        alignValuationWithFormula(
          localized,
          cached.valuation as ReturnType<typeof buildFallbackVehicleAiReport>["valuation"]
        )
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
      profile,
      localized,
      aiInsights: aiReport.insights,
      aiValuation: aiReport.valuation
    };
  } catch {
    const fallback = buildFallbackVehicleAiReport({ locale, vehicleData: localized });
    return {
      profile,
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
  const subject = args.locale === "nl" ? `Kentekenrapport voor ${args.plate}` : `Vehicle report for ${args.plate}`;
  // Send via the shared Gmail SMTP transport (lib/email/resend.ts), which also
  // handles the graceful not-configured return shape.
  return sendEmail({
    to: args.to,
    subject,
    html: args.html,
    attachments: args.pdfBase64
      ? [{ filename: `kentekenrapport-${args.plate}.pdf`, content: args.pdfBase64 }]
      : undefined
  });
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
      // Log our derived value (full, pre-redaction) for the market time-series,
      // and resolve access in parallel. The market value is premium: strip it
      // unless this browser paid for the plate.
      const [hasAccess] = await Promise.all([
        hasPaidPlateAccess(plate),
        logMarketAggregate(plate, locale, localized)
      ]);
      // Signals are computed on the RAW (pre-localization) profile so the
      // napVerdict thresholds never see EN tokens, and shipped as a FREE field
      // (fairPrice only appears when the plate is paid). nowMs is the single
      // server timestamp so the client renders without hydration drift.
      const signals = computeVehicleSignals({ profile, nowMs: Date.now(), hasAccess });
      return NextResponse.json({ ...redactPremiumValue(localized, hasAccess), signals });
    }

    if (downloadReport) {
      // Access first: unpaid download attempts must not trigger AI calls.
      const hasAccess = await hasPaidReportAccess(plate);
      if (!hasAccess) {
        return NextResponse.json({ error: "Payment required for report download.", code: "PAYMENT_REQUIRED" }, { status: 402 });
      }
      const { localized, aiInsights, aiValuation } = await buildLocalizedWithAi(plate, locale, userMileage);
      // Same server-side signal report the web JudgmentBlock uses, computed on
      // the RAW profile so the PDF page 1 mirrors the site exactly. hasAccess is
      // true here (the 402 gate above already passed). getVehicleProfile is 24h-
      // cached so this is a cache hit, not a second RDW fetch.
      const profileForSignals = await getVehicleProfile(plate);
      const signals = computeVehicleSignals({ profile: profileForSignals, nowMs: Date.now(), hasAccess: true });
      const pdf = await generateVehicleReportPdf({
        plate,
        locale,
        generatedAt: new Date(),
        data: localized,
        aiInsights,
        aiValuation,
        signals
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
      const signals = computeVehicleSignals({ profile, nowMs: Date.now(), hasAccess: false });
      // No access: also strip the premium market value from this (AI) branch.
      return NextResponse.json({
        ...redactPremiumValue(localized, false),
        signals,
        aiInsights: null,
        aiValuation: null
      });
    }

    // buildLocalizedWithAi also returns the raw profile it fetched (24h-cached),
    // so we can compute signals without a second getVehicleProfile call.
    const { profile: rawProfile, localized, aiInsights, aiValuation } = await buildLocalizedWithAi(plate, locale, userMileage);
    // hasAiAccess is true on this branch -> fairPrice may appear. Signals run on
    // the RAW (cache-served) profile, not the localized/AI-overridden object.
    const signals = computeVehicleSignals({ profile: rawProfile, nowMs: Date.now(), hasAccess: true });
    return NextResponse.json({
      ...localized,
      signals,
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
    // Signals for the PDF judgment block; hasAccess is true (402 gate passed above).
    // getVehicleProfile is 24h-cached so this is a cache hit, not a second RDW fetch.
    const profileForSignals = await getVehicleProfile(plate);
    const signals = computeVehicleSignals({ profile: profileForSignals, nowMs: Date.now(), hasAccess: true });
    const pdf = await generateVehicleReportPdf({
      plate,
      locale,
      generatedAt: new Date(),
      data: localized,
      aiInsights,
      aiValuation,
      signals
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
