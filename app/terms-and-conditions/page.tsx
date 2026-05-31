import { notFound } from "next/navigation";
import { connectMongo } from "@/lib/db/mongodb";
import { CmsPageModel } from "@/models/CmsPage";
import { ensureLegalPages, getLegalTemplateBySlug } from "@/lib/cms/legal-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadLegalPage(slug: string): Promise<{ title: string; content: string } | null> {
  try {
    await connectMongo();
    await ensureLegalPages();
    const page = await CmsPageModel.findOne({ slug, published: true }).lean<{ title: string; content: string } | null>();
    if (page) return { title: page.title, content: page.content };
  } catch (error) {
    console.warn(`Falling back to static legal template for "${slug}".`, error);
  }
  const template = getLegalTemplateBySlug(slug);
  return template ? { title: template.title, content: template.content } : null;
}

export default async function TermsAndConditionsPage() {
  const page = await loadLegalPage("terms-and-conditions");
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">{page.title}</h1>
      <div className="prose prose-slate max-w-none whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-6">
        {page.content}
      </div>
    </div>
  );
}
