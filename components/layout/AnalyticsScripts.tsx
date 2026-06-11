"use client";

import { useEffect, useRef } from "react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

/**
 * Injects Google Analytics 4 and Microsoft Clarity based on the ids in the
 * site settings. Loads once per session, after the settings arrive.
 */
export function AnalyticsScripts() {
  const { settings } = useSiteSettings();
  const injected = useRef({ ga: false, clarity: false });

  const gaId = settings.seo.googleAnalyticsId?.trim();
  const clarityId = settings.seo.microsoftClarityId?.trim();

  useEffect(() => {
    if (gaId && !injected.current.ga) {
      injected.current.ga = true;
      const loader = document.createElement("script");
      loader.async = true;
      loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
      document.head.appendChild(loader);

      const inline = document.createElement("script");
      inline.textContent = [
        "window.dataLayer = window.dataLayer || [];",
        "function gtag(){dataLayer.push(arguments);}",
        "window.gtag = gtag;",
        "gtag('js', new Date());",
        `gtag('config', '${gaId}', { anonymize_ip: true });`
      ].join("\n");
      document.head.appendChild(inline);
    }

    if (clarityId && !injected.current.clarity) {
      injected.current.clarity = true;
      const inline = document.createElement("script");
      inline.textContent = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${clarityId}");`;
      document.head.appendChild(inline);
    }
  }, [gaId, clarityId]);

  return null;
}
