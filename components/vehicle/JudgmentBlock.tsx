"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { useAiReport } from "@/hooks/useAiReport";
import type { Signal, SignalTone, VehicleSignalReport } from "@/lib/vehicle/signals";
import type { GroupId } from "@/lib/vehicle/groups";
import styles from "./JudgmentBlock.module.css";

type Props = {
  plate: string;
  locale: "nl" | "en";
  onJump: (groupId: string) => void;
};

const VERDICT_CLASS: Record<SignalTone, string> = {
  ok: styles.verdictOk,
  warn: styles.verdictWarn,
  danger: styles.verdictDanger
};

const TONE_WORD: Record<SignalTone, { nl: string; en: string }> = {
  ok: { nl: "In orde", en: "OK" },
  warn: { nl: "Let op", en: "Attention" },
  danger: { nl: "Risico", en: "Risk" }
};

function ToneIcon({ tone, size }: { tone: SignalTone; size: number }) {
  if (tone === "ok") return <CheckCircle2 size={size} />;
  if (tone === "warn") return <AlertTriangle size={size} />;
  return <ShieldAlert size={size} />;
}

/**
 * BLUF (bottom line up front): the free verdict block at the very top of the
 * report. Reads the server-computed signals (no client recompute, no
 * Date.now/random -> no hydration risk) and refines only the heading text from
 * the AI summary after unlock. Tone is always icon + word + color for
 * accessibility, never color alone. No fake blur: every driver here is free.
 */
export function JudgmentBlock({ plate, locale, onJump }: Props) {
  const nl = locale === "nl";
  const { data } = useVehicleLookup(plate);
  const { insights } = useAiReport(plate);

  const report = (data as { signals?: VehicleSignalReport } | undefined)?.signals;
  if (!report) return null;

  const { verdict, signals, alerts, summary } = report;

  // After unlock the AI summary may refine the heading; fall back to the
  // deterministic honest heading otherwise.
  const aiHeading = insights?.summary?.trim();
  const heading = aiHeading && aiHeading.length > 0 ? aiHeading : nl ? verdict.headingNl : verdict.headingEn;

  const teaserParts: string[] = [];
  teaserParts.push(
    nl
      ? `Wij controleerden ${summary.checked} signalen.`
      : `We checked ${summary.checked} signals.`
  );
  teaserParts.push(
    nl
      ? `${summary.needAttention} ${summary.needAttention === 1 ? "vraagt" : "vragen"} aandacht.`
      : `${summary.needAttention} need${summary.needAttention === 1 ? "s" : ""} attention.`
  );

  return (
    <section className={styles.block} aria-label={nl ? "Oordeel" : "Verdict"}>
      <div className={`${styles.verdict} ${VERDICT_CLASS[verdict.tone]}`}>
        <span className={styles.verdictIcon}>
          {verdict.tone === "ok" ? <ShieldCheck size={22} /> : <ToneIcon tone={verdict.tone} size={22} />}
        </span>
        <h2 className={styles.verdictHeading}>{heading}</h2>
      </div>

      <div className={styles.rows}>
        {signals.map((signal: Signal) => {
          const word = nl ? TONE_WORD[signal.tone].nl : TONE_WORD[signal.tone].en;
          return (
            <button
              key={signal.key}
              type="button"
              className={`${styles.row} ${styles[signal.tone]}`}
              onClick={() => onJump(signal.group as GroupId)}
            >
              <span className={styles.rowIcon}>
                <ToneIcon tone={signal.tone} size={17} />
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{nl ? signal.labelNl : signal.labelEn}</span>
                <span className={styles.rowSub}>{nl ? signal.subNl : signal.subEn}</span>
              </span>
              <span className={styles.rowChip}>{word}</span>
            </button>
          );
        })}
      </div>

      {alerts.length > 0 ? (
        <div className={styles.alerts}>
          <span className={styles.alertsTitle}>{nl ? "Risicos bij uitzondering" : "Exception risks"}</span>
          {alerts.map((alert) => (
            <span
              key={alert.key}
              className={`${styles.alert} ${alert.tone === "danger" ? styles.alertDanger : styles.alertWarn}`}
            >
              <span className={styles.alertDot}>
                <ToneIcon tone={alert.tone} size={14} />
              </span>
              {nl ? alert.labelNl : alert.labelEn}
            </span>
          ))}
        </div>
      ) : null}

      <p className={styles.teaser}>
        {teaserParts.join(" ")}
        {summary.priceAffecting > 0 ? (
          <span className={styles.teaserStrong}>
            {nl ? " 1 raakt de eerlijke prijs." : " 1 affects the fair price."}
          </span>
        ) : null}
      </p>
    </section>
  );
}
