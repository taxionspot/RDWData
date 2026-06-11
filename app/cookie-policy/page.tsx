import type { Metadata } from "next";
import { CookieDeclaration } from "@/components/legal/CookieDeclaration";

export const metadata: Metadata = {
  title: "Cookieverklaring | Kentekenrapport",
  description:
    "Overzicht van de cookies en vergelijkbare technologieen die op deze website worden gebruikt, inclusief doel en bewaartermijn."
};

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">Cookieverklaring</h1>
      <div className="prose prose-slate max-w-none rounded-2xl border border-slate-200 bg-white p-6">
        <CookieDeclaration />
      </div>
    </div>
  );
}
