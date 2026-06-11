import { NextResponse } from "next/server";
import { runWatchChecks } from "@/lib/watch/checkWatches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily cron endpoint (see vercel.json). Vercel automatically sends the
 * "authorization: Bearer <CRON_SECRET>" header when CRON_SECRET is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runWatchChecks();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("Watch check cron failed", error);
    return NextResponse.json({ error: "Watch check failed." }, { status: 500 });
  }
}
