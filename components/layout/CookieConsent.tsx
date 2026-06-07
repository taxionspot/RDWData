"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

const STORAGE_KEY = "kr-cookie-consent";

export function CookieConsent() {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable (private mode); just show once per load.
      setVisible(true);
    }
  }, []);

  const decide = (choice: "accepted" | "declined") => {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={nl ? "Cookiemelding" : "Cookie notice"}
      style={{
        position: "fixed",
        left: "16px",
        right: "16px",
        bottom: "16px",
        zIndex: 60,
        margin: "0 auto",
        maxWidth: "720px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        boxShadow: "0 20px 50px rgba(15,23,42,0.18)",
        padding: "16px 18px",
        display: "flex",
        gap: "14px",
        alignItems: "flex-start",
        flexWrap: "wrap"
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: "38px",
          height: "38px",
          borderRadius: "10px",
          background: "#eff6ff",
          color: "#2563eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Cookie size={20} />
      </span>
      <div style={{ flex: 1, minWidth: "240px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
          {nl ? "Cookies op Kentekenrapport" : "Cookies on Kentekenrapport"}
        </div>
        <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5, margin: "4px 0 0" }}>
          {nl
            ? "We gebruiken alleen functionele en analytische cookies om de site te laten werken en te verbeteren. "
            : "We only use functional and analytical cookies to run and improve the site. "}
          <Link href="/privacy-policy" style={{ color: "#2563eb", fontWeight: 600 }}>
            {nl ? "Privacy- en cookiebeleid" : "Privacy & cookie policy"}
          </Link>
          .
        </p>
      </div>
      <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
        <button
          type="button"
          onClick={() => decide("declined")}
          style={{
            height: "40px",
            padding: "0 16px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#334155",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          {nl ? "Alleen noodzakelijk" : "Necessary only"}
        </button>
        <button
          type="button"
          onClick={() => decide("accepted")}
          style={{
            height: "40px",
            padding: "0 18px",
            borderRadius: "10px",
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          {nl ? "Accepteren" : "Accept"}
        </button>
      </div>
    </div>
  );
}
