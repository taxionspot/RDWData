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
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          padding: "24px",
          textAlign: "center"
        }}
      >
        <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: "12px" }}>
          Er ging iets mis
        </h1>
        <p style={{ color: "#475569", marginBottom: "24px", maxWidth: "32rem" }}>
          Er trad een onverwachte fout op. Probeer het opnieuw of herlaad de pagina.
        </p>
        <button
          onClick={() => reset()}
          style={{
            borderRadius: "9999px",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            padding: "10px 20px",
            border: "none",
            cursor: "pointer"
          }}
        >
          Probeer opnieuw
        </button>
        <pre
          style={{
            marginTop: "24px",
            maxWidth: "32rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: "0.75rem",
            color: "#94a3b8"
          }}
        >
          {error.message}
        </pre>
      </body>
    </html>
  );
}
