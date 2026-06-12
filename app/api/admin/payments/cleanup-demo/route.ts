import { NextResponse } from "next/server";
import { getAdminSessionFromCookies } from "@/lib/admin/session";
import { connectMongo } from "@/lib/db/mongodb";
import { PlatePaymentModel } from "@/models/PlatePayment";
import { DEMO_PAYMENT_FILTER } from "@/lib/payments/server-access";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Old demo payment records (orderId "demo-...", amount "0.00") unlocked
 * plates for every visitor. The live access checks already ignore them;
 * this endpoint removes them from the database for good.
 * GET previews what would be deleted, POST deletes.
 */
export async function GET() {
  const session = getAdminSessionFromCookies();
  if (!session) return unauthorized();

  await connectMongo();
  const [count, plates] = await Promise.all([
    PlatePaymentModel.countDocuments(DEMO_PAYMENT_FILTER),
    PlatePaymentModel.distinct("plate", DEMO_PAYMENT_FILTER)
  ]);
  return NextResponse.json({ count, plates });
}

export async function POST() {
  const session = getAdminSessionFromCookies();
  if (!session) return unauthorized();

  await connectMongo();
  const result = await PlatePaymentModel.deleteMany(DEMO_PAYMENT_FILTER);
  return NextResponse.json({ ok: true, deletedCount: result.deletedCount ?? 0 });
}
