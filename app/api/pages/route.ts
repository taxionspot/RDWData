import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongodb";
import { CmsPageModel } from "@/models/CmsPage";
import { ensureLegalPages, LEGAL_PAGE_TEMPLATES } from "@/lib/cms/legal-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectMongo();
    await ensureLegalPages();
    const pages = await CmsPageModel.find({ published: true })
      .select({ title: 1, slug: 1, showInHeader: 1, showInFooter: 1 })
      .sort({ updatedAt: -1 })
      .lean();
    return NextResponse.json(pages);
  } catch (error) {
    console.warn("CMS pages lookup failed; serving static legal templates.", error);
    const fallback = LEGAL_PAGE_TEMPLATES.map((page) => ({
      slug: page.slug,
      title: page.title,
      showInHeader: page.showInHeader,
      showInFooter: page.showInFooter
    }));
    return NextResponse.json(fallback);
  }
}
