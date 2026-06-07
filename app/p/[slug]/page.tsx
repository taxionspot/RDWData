import { notFound } from "next/navigation";
import { connectMongo } from "@/lib/db/mongodb";
import { CmsPageModel } from "@/models/CmsPage";
import { ensureLegalPages } from "@/lib/cms/legal-pages";

export const runtime = "nodejs";
// Depends on the database (CMS content), so render at request time.
export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

export default async function CmsPage({ params }: Params) {
  await connectMongo();
  await ensureLegalPages();
  const page = await CmsPageModel.findOne({ slug: params.slug.toLowerCase(), published: true }).lean();
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
