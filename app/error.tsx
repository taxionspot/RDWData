"use client";

import { useEffect } from "react";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: "100%",
          background: "#fff",
          border: "1px solid #e2e8f2",
          borderRadius: 18,
          padding: 32,
          textAlign: "center",
          boxShadow: "0 14px 40px rgba(15, 23, 42, 0.08)"
        }}
      >
        <div style={{ fontSize: 38, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
          Er ging iets mis bij het laden
        </h1>
        <p style={{ color: "#5b6b84", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Probeer het opnieuw. Blijft dit gebeuren, neem dan contact met ons op.
          <br />
          <span style={{ color: "#94a3b8", fontSize: 12 }}>
            Something went wrong while loading. Please try again.
          </span>
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: "none",
            cursor: "pointer",
            borderRadius: 12,
            padding: "12px 26px",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 14
          }}
        >
          Probeer opnieuw
        </button>
      </div>
    </div>
  );
}
