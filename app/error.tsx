"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-white px-6 text-center">
      <h1 className="font-display text-2xl font-bold text-slate-900 md:text-3xl">Er ging iets mis</h1>
      <p className="mx-auto mt-3 max-w-sm text-slate-500">
        Probeer de pagina opnieuw te laden. Blijft het misgaan, mail dan naar info@kentekenrapport.com.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700"
      >
        Opnieuw proberen
      </button>
    </div>
  );
}
