"use client";

import React, { useEffect, useState } from "react";
import { X, Check, ShieldCheck, Zap, Lock } from "lucide-react";
import styles from "./SubscriptionModal.module.css";
import { useI18n } from "@/lib/i18n/context";
import { PayPalCheckout } from "@/components/payments/PayPalCheckout";
import { grantPaidAccessForPlate } from "@/lib/payments/access";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
  plate: string;
  onUnlocked?: (payload?: { email?: string }) => void;
}

function mapCheckoutErrorToFriendly(message: string, locale: "nl" | "en"): string {
  const upper = message.toUpperCase();
  if (upper.includes("INSTRUMENT_DECLINED") || upper.includes("DECLINED")) {
    return locale === "nl"
      ? "Deze betaalmethode is geweigerd. Probeer een andere betaalmethode."
      : "This payment method was declined. Please try another payment method.";
  }
  if (upper.includes("PAYPAL_CONFIG_ERROR")) {
    return locale === "nl"
      ? "Betalen is tijdelijk niet beschikbaar. Probeer het later opnieuw."
      : "Payments are temporarily unavailable. Please try again later.";
  }
  return locale === "nl"
    ? "Betaling is niet gelukt. Probeer opnieuw."
    : "Payment could not be completed. Please try again.";
}

export function SubscriptionModal({ isOpen, onClose, featureName, plate, onUnlocked }: SubscriptionModalProps) {
  const { locale } = useI18n();
  const { settings } = useSiteSettings();
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  // Only show the demo skip button when explicitly enabled. The server-side
  // grant endpoint is independently gated by PAYMENT_DEMO_BYPASS, so this flag
  // controls visibility only — it cannot hand out free reports on its own.
  const canSkipPaymentForDemo = process.env.NEXT_PUBLIC_ENABLE_DEMO_SKIP_PAYMENT === "true";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || !isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={20} />
        </button>

        <div className={styles.header}>
          <div className={styles.badge}>
            <Zap size={14} /> {locale === "nl" ? "Volledige toegang" : "Full Access"}
          </div>
          <h2 className={styles.title}>{locale === "nl" ? "Ontgrendel premium voertuighistorie" : "Unlock Premium Vehicle History"}</h2>
          <p className={styles.subtitle}>
            {locale === "nl"
              ? <>Om <span className={styles.bold}>{featureName}</span> en andere premium data te ontgrendelen, koop je een rapport of abonnement.</>
              : <>To unlock <span className={styles.bold}>{featureName}</span> and other premium data, you need a report or subscription.</>}
          </p>
        </div>

        <div className={styles.plans}>
          <div className={`${styles.planCard} ${styles.planActive}`}>
            <div className={styles.planHeader}>
              <div className={styles.planName}>{locale === "nl" ? "Kies je betaalmethode" : "Choose your payment method"}</div>
              <div className={styles.planPrice}>
                {settings.payment.currency} {settings.payment.amount}
                <span>/{locale === "nl" ? "zoekopdracht" : "search"}</span>
              </div>
            </div>
            <ul className={styles.features}>
              <li><Check size={14} className={styles.checkIcon} /> {locale === "nl" ? "Ontgrendelt alle premium tabbladen voor dit kenteken" : "Unlocks all premium tabs for this plate"}</li>
              <li><Check size={14} className={styles.checkIcon} /> {locale === "nl" ? "Maakt rapportdownload beschikbaar voor dit kenteken" : "Enables report download for this plate"}</li>
              <li><Check size={14} className={styles.checkIcon} /> {locale === "nl" ? "iDEAL, creditcard, PayPal, Apple Pay en Google Pay" : "iDEAL, credit card, PayPal, Apple Pay and Google Pay"}</li>
            </ul>
            <label className={styles.emailLabel}>
              {locale === "nl" ? "E-mail voor rapportlevering" : "Email for report delivery"}
              <input
                type="email"
                className={styles.emailInput}
                placeholder={locale === "nl" ? "naam@voorbeeld.nl" : "name@example.com"}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <div className={styles.planBtn}>
              <PayPalCheckout
                plate={plate}
                email={email}
                amount={settings.payment.amount}
                currency={settings.payment.currency}
                onSuccess={() => {
                  grantPaidAccessForPlate(plate);
                  onUnlocked?.({ email: email.trim().toLowerCase() || undefined });
                  onClose();
                }}
                onError={(message) => setError(mapCheckoutErrorToFriendly(message, locale))}
              />
            </div>
            {error ? (
              <p className={styles.subtitle} style={{ marginTop: 12 }}>
                {error}
              </p>
            ) : null}
            {canSkipPaymentForDemo ? (
              <button
                type="button"
                className={styles.skipButton}
                onClick={async () => {
                  // Only treat the demo unlock as granted if the SERVER actually
                  // grants it. Otherwise the download would 402 and reopen this
                  // modal in a loop (e.g. when the public flag is on but the
                  // server-side PAYMENT_DEMO_BYPASS is off).
                  try {
                    const response = await fetch(`/api/payments/access/${encodeURIComponent(plate)}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: email.trim().toLowerCase() || undefined })
                    });
                    if (!response.ok) {
                      setError(locale === "nl" ? "Demo-toegang is uitgeschakeld." : "Demo access is disabled.");
                      return;
                    }
                  } catch {
                    setError(locale === "nl" ? "Demo-toegang kon niet worden verleend." : "Could not grant demo access.");
                    return;
                  }
                  grantPaidAccessForPlate(plate);
                  onUnlocked?.({ email: email.trim().toLowerCase() || undefined });
                  onClose();
                }}
              >
                {locale === "nl" ? "Demo: betaling overslaan" : "Demo: Skip payment"}
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.trustItem}>
            <ShieldCheck size={16} /> {locale === "nl" ? "Geverifieerde RDW-data" : "Verified RDW Data"}
          </div>
          <div className={styles.trustItem}>
            <Lock size={16} /> {locale === "nl" ? "Veilig betalen via iDEAL, creditcard, PayPal, Apple Pay & Google Pay" : "Secure payment via iDEAL, card, PayPal, Apple Pay & Google Pay"}
          </div>
        </div>
      </div>
    </div>
  );
}

