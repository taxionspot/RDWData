import { connectMongo } from "@/lib/db/mongodb";
import { PlateWatchModel } from "@/models/PlateWatch";
import { UserAccountModel } from "@/models/UserAccount";
import { getVehicleProfile } from "@/lib/rdw/service";
import type { VehicleProfile } from "@/lib/rdw/types";

export type WatchSnapshot = {
  hasOpenRecall: boolean;
  apkExpiryDate: string | null;
  maintenanceRiskScore: number | null;
};

export type WatchAlert = {
  type: "RECALL_CHANGED" | "APK_CHANGED" | "RISK_CHANGED";
  message: string;
  createdAt: Date;
};

export type WatchCheckSummary = {
  checked: number;
  changed: number;
  emailsSent: number;
};

function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(1)) : null;
}

/**
 * Builds the watch snapshot from a vehicle profile.
 * The maintenanceRiskScore comes from profile.enriched, which is populated by
 * enrichVehicleData (lib/rdw/heuristics) inside the RDW mapper.
 */
export function buildWatchSnapshot(profile: VehicleProfile): WatchSnapshot {
  return {
    hasOpenRecall: Boolean(profile.vehicle.hasOpenRecall),
    apkExpiryDate: profile.vehicle.apkExpiryDate ?? null,
    maintenanceRiskScore: normalizeScore(profile.enriched?.maintenanceRiskScore ?? null)
  };
}

/**
 * Compares a previous snapshot against the current one and returns the alerts
 * for every detected change. Shared by the watch-mode API route and the cron job.
 *
 * Null handling: a value going from null/undefined to a number (or the other
 * way around) also counts as a change.
 */
export function diffWatchSnapshots(
  previous: Partial<WatchSnapshot> | null | undefined,
  current: WatchSnapshot
): WatchAlert[] {
  const alerts: WatchAlert[] = [];

  if (Boolean(previous?.hasOpenRecall) !== current.hasOpenRecall) {
    alerts.push({
      type: "RECALL_CHANGED",
      message: current.hasOpenRecall
        ? "Recall status changed: open recall detected."
        : "Recall status changed: no open recall now.",
      createdAt: new Date()
    });
  }

  if ((previous?.apkExpiryDate ?? null) !== (current.apkExpiryDate ?? null)) {
    alerts.push({
      type: "APK_CHANGED",
      message: `APK status changed: ${previous?.apkExpiryDate ?? "unknown"} -> ${current.apkExpiryDate ?? "unknown"}.`,
      createdAt: new Date()
    });
  }

  const prevRisk = normalizeScore(previous?.maintenanceRiskScore);
  const currentRisk = normalizeScore(current.maintenanceRiskScore);
  const riskChanged =
    prevRisk === null || currentRisk === null
      ? prevRisk !== currentRisk
      : Math.abs(currentRisk - prevRisk) >= 0.5;
  if (riskChanged) {
    const formatRisk = (value: number | null) => (value === null ? "unknown" : value.toFixed(1));
    alerts.push({
      type: "RISK_CHANGED",
      message: `Maintenance risk shifted from ${formatRisk(prevRisk)} to ${formatRisk(currentRisk)}.`,
      createdAt: new Date()
    });
  }

  return alerts;
}

const ALERT_LABELS_NL: Record<WatchAlert["type"], string> = {
  RECALL_CHANGED: "Terugroepactie",
  APK_CHANGED: "APK vervaldatum",
  RISK_CHANGED: "Onderhoudsrisico"
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildWatchAlertEmailHtml(args: { plate: string; title?: string; alerts: WatchAlert[]; link: string }): string {
  const items = args.alerts
    .map(
      (alert) =>
        `<li style="margin-bottom:8px;"><strong>${ALERT_LABELS_NL[alert.type]}:</strong> ${escapeHtml(alert.message)}</li>`
    )
    .join("");
  const vehicleLabel = args.title ? `${escapeHtml(args.title)} (${escapeHtml(args.plate)})` : escapeHtml(args.plate);
  return `<!DOCTYPE html>
<html lang="nl">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background-color:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
        <h1 style="font-size:20px;margin:0 0 16px;">Wijzigingen gedetecteerd voor ${vehicleLabel}</h1>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
          U volgt dit kenteken via Watch mode. Tijdens de automatische controle hebben wij de volgende wijzigingen gevonden:
        </p>
        <ul style="font-size:14px;line-height:1.6;padding-left:20px;margin:0 0 24px;">
          ${items}
        </ul>
        <p style="margin:0 0 24px;">
          <a href="${args.link}" style="display:inline-block;background-color:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:bold;">
            Bekijk het volledige rapport
          </a>
        </p>
        <p style="font-size:12px;color:#6b7280;line-height:1.6;margin:0;">
          U ontvangt deze e-mail omdat u dit kenteken volgt op Kentekenrapport.
          Wilt u geen meldingen meer ontvangen? Zet het volgen van dit kenteken uit in uw account.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

async function sendWatchAlertEmail(args: {
  to: string;
  plate: string;
  title?: string;
  alerts: WatchAlert[];
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  if (!apiKey) return false;

  const from = process.env.REPORT_EMAIL_FROM ?? "Kentekenrapport <noreply@kentekenrapport.nl>";
  const link = `${process.env.NEXT_PUBLIC_BASE_URL}/search/${args.plate}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: `Wijzigingen voor kenteken ${args.plate}`,
      html: buildWatchAlertEmailHtml({ plate: args.plate, title: args.title, alerts: args.alerts, link }),
      headers: {
        "List-Unsubscribe": "<mailto:noreply@kentekenrapport.nl>"
      }
    }),
    cache: "no-store"
  });
  return response.ok;
}

/**
 * Checks every followed plate against fresh RDW data, records alerts for any
 * changes and emails the owner (best-effort) when something changed.
 */
export async function runWatchChecks(): Promise<WatchCheckSummary> {
  await connectMongo();
  const watches = await PlateWatchModel.find({});

  let checked = 0;
  let changed = 0;
  let emailsSent = 0;
  const emailByUserId = new Map<string, string | null>();

  for (const watch of watches) {
    try {
      const profile = await getVehicleProfile(watch.plate);
      const snapshot = buildWatchSnapshot(profile);
      const alerts = diffWatchSnapshots(watch.snapshot, snapshot);

      watch.snapshot = snapshot;
      watch.lastCheckedAt = new Date();
      if (alerts.length > 0) {
        watch.alerts = [...alerts, ...watch.alerts].slice(0, 100);
      }
      await watch.save();
      checked += 1;

      if (alerts.length === 0) continue;
      changed += 1;

      // Best-effort email notification; never let mail issues break the run.
      try {
        const userKey = String(watch.userId);
        if (!emailByUserId.has(userKey)) {
          const user = await UserAccountModel.findById(watch.userId).lean();
          emailByUserId.set(userKey, user?.email ?? null);
        }
        const email = emailByUserId.get(userKey);
        if (email && process.env.RESEND_API_KEY) {
          const sent = await sendWatchAlertEmail({
            to: email,
            plate: watch.plate,
            title: watch.title,
            alerts
          });
          if (sent) emailsSent += 1;
        }
      } catch (error) {
        console.warn(`Watch alert email skipped for plate ${watch.plate}`, error);
      }
    } catch (error) {
      console.warn(`Watch check skipped for plate ${watch.plate}`, error);
    }
  }

  return { checked, changed, emailsSent };
}
