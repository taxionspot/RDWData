"use client";

import { useEffect, useState } from "react";
import { defaultSiteSettings, type PublicSiteSettings } from "@/lib/site-settings/defaults";
import { sanitizeSiteSettings } from "@/lib/site-settings/sanitize";

let cache: PublicSiteSettings | null = null;

export function useSiteSettings() {
  const [settings, setSettings] = useState<PublicSiteSettings>(cache ?? defaultSiteSettings);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let active = true;
    if (cache) {
      setLoading(false);
      return;
    }
    void fetch("/api/site/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load site settings.");
        return await response.json();
      })
      .then((payload: unknown) => {
        // Defensive: the database may hold settings written by older app
        // versions with different shapes; never let that crash the UI.
        const sanitized = sanitizeSiteSettings(payload);
        cache = sanitized;
        if (!active) return;
        setSettings(sanitized);
      })
      .catch(() => {
        if (!active) return;
        setSettings(defaultSiteSettings);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { settings, loading };
}

