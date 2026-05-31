"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real error in the browser console for debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-3 text-3xl font-bold text-slate-900">Er ging iets mis</h1>
      <p className="mb-6 text-slate-600">
        Er trad een onverwachte fout op. Probeer het opnieuw of ga terug naar de startpagina.
      </p>
      <div className="mb-6 flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-full bg-brand-600 px-5 py-2.5 font-semibold text-white"
        >
          Probeer opnieuw
        </button>
        <Link
          href="/"
          className="rounded-full border border-slate-300 px-5 py-2.5 font-semibold text-slate-700"
        >
          Naar start
        </Link>
      </div>
      <details className="w-full max-w-lg rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs text-slate-500">
        <summary className="cursor-pointer font-medium text-slate-600">Technische details</summary>
        <pre className="mt-3 whitespace-pre-wrap break-words">{error.message}</pre>
        {error.digest ? <p className="mt-2 text-slate-400">Code: {error.digest}</p> : null}
      </details>
    </div>
  );
}
