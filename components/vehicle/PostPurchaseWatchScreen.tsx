"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BellRing, CheckCircle2, Eye, RefreshCw } from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import { useI18n } from "@/lib/i18n/context";
import { UserAuthModal } from "../ui/UserAuthModal";
import styles from "./PostPurchaseWatchScreen.module.css";

type Props = { plate: string };

type WatchAlert = {
  type: "RECALL_CHANGED" | "APK_CHANGED" | "RISK_CHANGED";
  message: string;
  createdAt: string;
};

type WatchItem = {
  plate: string;
  title?: string;
  alerts: WatchAlert[];
  lastCheckedAt?: string;
  snapshot?: { hasOpenRecall: boolean; apkExpiryDate: string | null; maintenanceRiskScore: number | null };
};

export function PostPurchaseWatchScreen({ plate }: Props) {
  const { locale } = useI18n();
  const { normalized, isValid, data, isLoading, isError } = useVehicleLookup(plate);
  const [isUserLoggedIn, setIsUserLoggedIn] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [watchItem, setWatchItem] = useState<WatchItem | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await fetch("/api/user/session", { cache: "no-store" });
      const payload = (await session.json().catch(() => ({}))) as { authenticated?: boolean };
      if (active) setIsUserLoggedIn(Boolean(payload.authenticated));
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isUserLoggedIn || !normalized) return;
    let active = true;
    void (async () => {
      const response = await fetch(`/api/user/watch-mode?plate=${encodeURIComponent(normalized)}`, { cache: "no-store" });
      if (!response.ok || !active) return;
      const payload = (await response.json()) as { item?: WatchItem | null };
      if (active) setWatchItem(payload.item ?? null);
    })();
    return () => {
      active = false;
    };
  }, [isUserLoggedIn, normalized]);

  if (!isValid || isError) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingCard}><AlertCircle size={18} /> {locale === "nl" ? "Voertuig niet gevonden." : "Vehicle not found."}</div>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingCard}>{locale === "nl" ? "Watch mode laden..." : "Loading watch mode..."}</div>
      </div>
    );
  }

  const follow = async () => {
    if (!isUserLoggedIn) {
      setShowAuth(true);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/user/watch-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: normalized,
          title: [data.vehicle.brand, data.vehicle.tradeName].filter(Boolean).join(" ").trim(),
          action: "follow"
        })
      });
      if (!response.ok) return;
      const latest = await fetch(`/api/user/watch-mode?plate=${encodeURIComponent(normalized)}`, { cache: "no-store" });
      const payload = (await latest.json()) as { item?: WatchItem | null };
      setWatchItem(payload.item ?? null);
    } finally {
      setBusy(false);
    }
  };

  const checkNow = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/user/watch-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: normalized, action: "check" })
      });
      if (!response.ok) return;
      const latest = await fetch(`/api/user/watch-mode?plate=${encodeURIComponent(normalized)}`, { cache: "no-store" });
      const payload = (await latest.json()) as { item?: WatchItem | null };
      setWatchItem(payload.item ?? null);
    } finally {
      setBusy(false);
    }
  };

  const unfollow = async () => {
    setBusy(true);
    try {
      await fetch("/api/user/watch-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: normalized, action: "unfollow" })
      });
      setWatchItem(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.contentContainer}>
        <VehicleNavBar plate={normalized} subtitle={locale === "nl" ? "Post-Purchase Monitoring" : "Post-Purchase Monitoring"} />
        <PremiumLock featureName={locale === "nl" ? "Watch mode" : "Watch mode"} isLocked={true} plate={normalized} sectionKey="ownershipHistory">
          <div className={styles.hero}>
            <h1>{locale === "nl" ? "Persistent Watch Mode" : "Persistent Watch Mode"}</h1>
            <p>
              {locale === "nl"
                ? "Volg dit kenteken en ontvang updates bij recall, APK of risicoverschuivingen."
                : "Follow this plate and receive updates for recall, APK, and risk profile changes."}
            </p>
            <div className={styles.actions}>
              {!watchItem ? (
                <button type="button" className={styles.primaryBtn} onClick={follow} disabled={busy}>
                  <Eye size={16} /> {busy ? (locale === "nl" ? "Bezig..." : "Working...") : locale === "nl" ? "Volgen" : "Follow"}
                </button>
              ) : (
                <>
                  <button type="button" className={styles.primaryBtn} onClick={checkNow} disabled={busy}>
                    <RefreshCw size={16} /> {busy ? (locale === "nl" ? "Controleren..." : "Checking...") : locale === "nl" ? "Nu controleren" : "Check now"}
                  </button>
                  <button type="button" className={styles.secondaryBtn} onClick={unfollow} disabled={busy}>
                    {locale === "nl" ? "Stop volgen" : "Unfollow"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <h3>{locale === "nl" ? "Hoe werkt Watch Mode?" : "How does Watch Mode work?"}</h3>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: "#475569", fontSize: 14 }}>
              <li>
                {locale === "nl"
                  ? "Wij houden dit kenteken in de gaten en vergelijken periodiek de openbare RDW-data."
                  : "We keep an eye on this plate and periodically compare the public RDW data."}
              </li>
              <li>
                {locale === "nl"
                  ? "Je krijgt een melding bij een nieuwe terugroepactie, een gewijzigde APK-vervaldatum of een verschuiving in het risicoprofiel."
                  : "You get an alert on a new recall, a changed APK expiry date, or a shift in the risk profile."}
              </li>
              <li>
                {locale === "nl"
                  ? "Klik op 'Volgen' (inloggen nodig) om te starten, of op 'Nu controleren' voor een directe check."
                  : "Click 'Follow' (login required) to start, or 'Check now' for an immediate check."}
              </li>
              <li>
                {locale === "nl"
                  ? "Let op: we gebruiken alleen openbare RDW-signalen. We kunnen geen privegegevens van eigenaren, kilometerstanden tussen keuringen door, of verkoopadvertenties volgen."
                  : "Note: we use only public RDW signals. We cannot track private owner data, mileage between inspections, or sales listings."}
              </li>
            </ul>
          </div>

          <div className={styles.panel}>
            <h3>{locale === "nl" ? "Huidige watch status" : "Current watch status"}</h3>
            {!watchItem ? (
              <p className={styles.empty}>{locale === "nl" ? "Nog niet gevolgd." : "Not followed yet."}</p>
            ) : (
              <div className={styles.statusGrid}>
                <div className={styles.statusCard}><BellRing size={15} /> Recall: {watchItem.snapshot?.hasOpenRecall ? "Open" : "None"}</div>
                <div className={styles.statusCard}><CheckCircle2 size={15} /> APK: {watchItem.snapshot?.apkExpiryDate ?? "-"}</div>
                <div className={styles.statusCard}><AlertCircle size={15} /> Risk: {watchItem.snapshot?.maintenanceRiskScore ?? "-"}</div>
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <h3>{locale === "nl" ? "Alertgeschiedenis" : "Alert history"}</h3>
            {watchItem?.alerts?.length ? (
              <div className={styles.timeline}>
                {watchItem.alerts.map((alert, index) => {
                  const Icon = alert.type === "RECALL_CHANGED" ? AlertCircle : alert.type === "APK_CHANGED" ? CheckCircle2 : BellRing;
                  return (
                    <div className={styles.timelineItem} key={`${alert.createdAt}-${index}`}>
                      <div className={styles.timelineIconLine}>
                        <div className={styles.timelineIconWrapper}>
                          <Icon size={16} />
                        </div>
                        {index < watchItem.alerts.length - 1 && <div className={styles.timelineLine} />}
                      </div>
                      <div className={styles.timelineContent}>
                        <div className={styles.timelineType}>{alert.type.replace('_', ' ')}</div>
                        <div className={styles.timelineMessage}>{alert.message}</div>
                        <div className={styles.timelineTime}>{new Date(alert.createdAt).toLocaleString("nl-NL")}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.empty}>{locale === "nl" ? "Nog geen alerts." : "No alerts yet."}</p>
            )}
          </div>
        </PremiumLock>
      </div>
      <UserAuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onAuthenticated={async () => {
          setIsUserLoggedIn(true);
          await follow();
        }}
      />
    </div>
  );
}
