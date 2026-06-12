"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatDisplayPlate } from "@/lib/rdw/normalize";
import styles from "./ScanIntro.module.css";

type Props = {
  plate: string;
};

const STEP_INTERVAL_MS = 520;
const LEAVE_MS = 420;

function storageKey(plate: string) {
  return `kr-scan-${plate}`;
}

/**
 * carVertical-style "scanning official databases" intro. Plays once per plate
 * per browser session, then reveals the report underneath.
 */
export function ScanIntro({ plate }: Props) {
  const { locale } = useI18n();
  const nl = locale === "nl";

  const steps = useMemo(
    () =>
      nl
        ? [
            "RDW voertuigregister",
            "APK-keuringshistorie",
            "Geconstateerde gebreken",
            "Terugroepacties",
            "NAP-tellerstandoordeel",
            "Marktwaarde-analyse"
          ]
        : [
            "RDW vehicle register",
            "APK inspection history",
            "Recorded defects",
            "Recall campaigns",
            "NAP odometer verdict",
            "Market value analysis"
          ],
    [nl]
  );

  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!plate) return;
    try {
      if (sessionStorage.getItem(storageKey(plate))) return;
    } catch {
      return;
    }
    setVisible(true);
    setActiveStep(0);
  }, [plate]);

  useEffect(() => {
    if (!visible || leaving) return;
    if (activeStep >= steps.length) {
      const id = setTimeout(() => finish(), 350);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setActiveStep((step) => step + 1), STEP_INTERVAL_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, leaving, activeStep, steps.length]);

  const finish = () => {
    try {
      sessionStorage.setItem(storageKey(plate), "1");
    } catch {
      // ignore
    }
    setLeaving(true);
    setTimeout(() => setVisible(false), LEAVE_MS);
  };

  if (!visible) return null;

  const progress = Math.min((activeStep / steps.length) * 100, 100);

  return (
    <div className={`${styles.overlay} ${leaving ? styles.overlayLeaving : ""}`} role="status" aria-live="polite">
      <div className={styles.card}>
        <div className={styles.plate}>
          <span className={styles.plateBand}>
            <span className={styles.plateStars}>★</span>
            NL
          </span>
          <span className={styles.plateNumber}>{formatDisplayPlate(plate)}</span>
        </div>

        <div className={styles.scanTitle}>
          {nl ? "Officiële databronnen doorzoeken..." : "Searching official databases..."}
        </div>
        <div className={styles.scanSub}>
          {nl ? "Wij combineren 15+ RDW-datasets tot één rapport" : "Combining 15+ RDW datasets into one report"}
        </div>

        <div className={styles.steps}>
          {steps.map((step, index) => {
            const done = index < activeStep;
            const active = index === activeStep;
            return (
              <div
                key={step}
                className={`${styles.step} ${done ? styles.stepDone : ""} ${active ? styles.stepActive : ""}`}
              >
                <span className={styles.stepIcon}>
                  {done ? <CheckCircle2 size={17} /> : active ? <span className={styles.spinner} /> : <span className={styles.dot} />}
                </span>
                {step}
              </div>
            );
          })}
        </div>

        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        <button type="button" className={styles.skip} onClick={finish}>
          {nl ? "Overslaan" : "Skip"}
        </button>
      </div>
    </div>
  );
}
