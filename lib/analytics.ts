/**
 * Lightweight funnel tracking. Events go to Google Analytics (gtag) and
 * Microsoft Clarity when those scripts are loaded by <AnalyticsScripts />.
 * Always safe to call: no-ops on the server or when scripts are absent.
 */
export function track(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  };
  try {
    w.gtag?.("event", event, params ?? {});
  } catch {
    // ignore
  }
  try {
    w.clarity?.("event", event);
  } catch {
    // ignore
  }
}
