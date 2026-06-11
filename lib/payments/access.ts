const sessionPaidPlates = new Set<string>();
const serverChecks = new Map<string, Promise<boolean>>();

export const PLATE_ACCESS_EVENT = "plate-access-changed";

function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function dispatchAccessChanged(plate: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PLATE_ACCESS_EVENT, { detail: { plate } }));
}

export function hasPaidAccessForPlate(plate: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionPaidPlates.has(normalizePlate(plate));
}

export function grantPaidAccessForPlate(plate: string) {
  if (typeof window === "undefined") return;
  sessionPaidPlates.add(normalizePlate(plate));
  dispatchAccessChanged(normalizePlate(plate));
}

export function clearPaidAccessForPlate(plate: string): void {
  if (typeof window === "undefined") return;
  sessionPaidPlates.delete(normalizePlate(plate));
  dispatchAccessChanged(normalizePlate(plate));
}

/**
 * Checks the server once per plate whether this plate was already paid for
 * (e.g. after a page refresh) and caches the in-flight promise so that many
 * PremiumLock instances on one page trigger at most one request.
 */
export function ensurePaidAccessChecked(plate: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const normalized = normalizePlate(plate);
  if (!normalized) return Promise.resolve(false);
  if (sessionPaidPlates.has(normalized)) return Promise.resolve(true);

  const pending = serverChecks.get(normalized);
  if (pending) return pending;

  const check = (async () => {
    try {
      const response = await fetch(`/api/payments/access/${encodeURIComponent(normalized)}`, { cache: "no-store" });
      if (!response.ok) return false;
      const payload = (await response.json()) as { paid?: boolean };
      if (payload.paid) {
        sessionPaidPlates.add(normalized);
        dispatchAccessChanged(normalized);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      serverChecks.delete(normalized);
    }
  })();

  serverChecks.set(normalized, check);
  return check;
}

/**
 * Subscribe to access changes for a plate. Returns an unsubscribe function.
 */
export function onPlateAccessChanged(plate: string, callback: (paid: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const normalized = normalizePlate(plate);
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ plate?: string }>).detail;
    if (!detail?.plate || detail.plate === normalized) {
      callback(sessionPaidPlates.has(normalized));
    }
  };
  window.addEventListener(PLATE_ACCESS_EVENT, handler);
  return () => window.removeEventListener(PLATE_ACCESS_EVENT, handler);
}
