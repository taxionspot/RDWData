"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n/context";
import { COOKIEBOT_CBID } from "@/lib/analytics/config";

export function CookieDeclaration() {
  const { locale } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    const script = document.createElement("script");
    script.id = "CookieDeclaration";
    script.src = `https://consent.cookiebot.com/${COOKIEBOT_CBID}/cd.js`;
    script.async = true;
    script.setAttribute("data-culture", locale.toUpperCase());
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [locale]);

  return <div ref={containerRef} />;
}
