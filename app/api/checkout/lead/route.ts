import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongodb";
import { CheckoutLeadModel } from "@/models/CheckoutLead";

export const runtime = "nodejs";

type LeadBody = {
  email?: string;
  plate?: string;
  lang?: string;
};

function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LeadBody;
    const email = String(body.email ?? "").trim().toLowerCase();
    const plate = normalizePlate(String(body.plate ?? ""));
    const locale = body.lang === "en" ? "en" : "nl";

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    if (!plate) {
      return NextResponse.json({ error: "Missing plate." }, { status: 400 });
    }

    await connectMongo();
    await CheckoutLeadModel.updateOne(
      { email, plate },
      {
        $set: { locale },
        $setOnInsert: { status: "pending", followUpSentAt: null }
      },
      { upsert: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to store checkout lead.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
