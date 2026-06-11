import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongodb";
import { CmsPageModel } from "@/models/CmsPage";
import { ensureLegalPages } from "@/lib/cms/legal-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await connectMongo();
  await ensureLegalPages();
  const pages = await CmsPageModel.find({ published: true })
    .select({ title: 1, slug: 1, showInHeader: 1, showInFooter: 1 })
    .sort({ updatedAt: -1 })
    .lean();
  return NextResponse.json(pages);
}
