"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Radar, Tag, Unlock } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { formatDisplayPlate } from "@/lib/rdw/normalize";
import type { SignalTone } from "@/lib/vehicle/signals";
import styles from "./ReportTeaser.module.css";

type Props = {
  plate: string;
  unlocked: boolean;
  priceLabel: string;
  onUnlockClick: () => void;
};

function chipClass(tone: SignalTone): string {
  if (tone === "danger") return `${styles.chip} ${styles.chipDanger}`;
  if (tone === "warn") return `${styles.chip} ${styles.chipWarn}`;
  return `${styles.chip} ${styles.chipOk}`;
}

export function ReportTeaser({ plate, unlocked, priceLabel, onUnlockClick }: Props) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const { data } = useVehicleLookup(plate);
  const signals = data?.signals;

  // Honest, server-derived numbers. No synthetic "datapoints" math.
  const summary = useMemo(
    () => ({
      checked: signals?.summary.checked ?? 0,
      needAttention: signals?.summary.needAttention ?? 0,
      priceAffecting: signals?.summary.priceAffecting ?? 0
    }),
    [signals]
  );

  // Colored chips come straight from the server alerts (the real exceptions).
  // When there are none, show a single calm "no alarm signals" chip.
  const chips = useMemo(() => {
    const alerts = signals?.alerts ?? [];
    if (alerts.length === 0) {
      return [
        {
          key: "none",
          tone: "ok" as SignalTone,
          label: nl ? "Geen alarmsignalen" : "No alarm signals"
        }
      ];
    }
    return alerts.slice(0, 5).map((alert) => ({
      key: alert.key,
      tone: alert.tone,
      label: nl ? alert.labelNl : alert.labelEn
    }));
  }, [signals, nl]);

  return (
    <div className={styles.teaser}>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>
          <Radar size={13} />
          {nl ? "Scan voltooid" : "Scan complete"} {"·"} {formatDisplayPlate(plate)}
        </span>

        <div className={styles.title}>
          {nl ? (
            <>
              Wij controleerden <strong>{summary.checked} signalen</strong>.{" "}
              {summary.needAttention > 0 ? (
                <>
                  <strong>{summary.needAttention}</strong>{" "}
                  {summary.needAttention === 1 ? "vraagt" : "vragen"} aandacht.
                </>
              ) : (
                <>Geen daarvan vraagt aandacht.</>
              )}
            </>
          ) : (
            <>
              We checked <strong>{summary.checked} signals</strong>.{" "}
              {summary.needAttention > 0 ? (
                <>
                  <strong>{summary.needAttention}</strong>{" "}
                  {summary.needAttention === 1 ? "needs" : "need"} attention.
                </>
              ) : (
                <>None of them need attention.</>
              )}
            </>
          )}
        </div>

        {summary.priceAffecting > 0 ? (
          <span className={styles.priceAffecting}>
            <Tag size={14} />
            {nl
              ? `${summary.priceAffecting} ${
                  summary.priceAffecting === 1 ? "punt raakt" : "punten raken"
                } de eerlijke prijs.`
              : `${summary.priceAffecting} ${
                  summary.priceAffecting === 1 ? "point affects" : "points affect"
                } the fair price.`}
          </span>
        ) : null}

        <div className={styles.chips}>
          {chips.map((chip) => (
            <span key={chip.key} className={chipClass(chip.tone)}>
              {chip.tone === "ok" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {chip.label}
            </span>
          ))}
        </div>

        {!unlocked ? (
          <p className={styles.hint}>
            {nl
              ? "Hieronder open je per onderdeel de volledige analyse: marktwaarde, kilometerstand, APK-historie en meer. Eenmalig ontgrendelen voor dit kenteken."
              : "Below you open the full analysis per section: market value, mileage, MOT history and more. Unlock once for this plate."}
          </p>
        ) : null}
      </div>

      <div className={styles.action}>
        {unlocked ? (
          <span className={styles.unlockedBadge}>
            <Unlock size={16} />
            {nl ? "Volledig rapport ontgrendeld" : "Full report unlocked"}
          </span>
        ) : (
          <>
            <button type="button" className={styles.unlockBtn} onClick={onUnlockClick}>
              <Unlock size={16} />
              {nl ? `Ontgrendel alles voor ${priceLabel}` : `Unlock everything for ${priceLabel}`}
            </button>
            <span className={styles.unlockMicro}>
              {nl
                ? "Eenmalig voor dit kenteken. iDEAL, Apple Pay, Google Pay, PayPal. Direct toegang."
                : "One-time for this plate. iDEAL, Apple Pay, Google Pay, PayPal. Instant access."}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
