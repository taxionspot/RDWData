"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="nl">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          textAlign: "center",
          fontFamily: "Arial, Helvetica, sans-serif",
          color: "#0f172a",
          margin: 0
        }}
      >
        <h2 style={{ fontSize: 20, margin: 0 }}>Er ging iets mis</h2>
        <p style={{ color: "#475569", maxWidth: 440, margin: 0 }}>
          Er is een onverwachte fout opgetreden. Probeer het opnieuw of ververs de pagina.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 8,
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "#0d2a52",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          Opnieuw proberen
        </button>
      </body>
    </html>
  );
}
