"use client";

import React, { useEffect, useState } from "react";
import { X, Check, ShieldCheck, Zap, Sparkles } from "lucide-react";
import styles from "./SubscriptionModal.module.css";
import { useI18n } from "@/lib/i18n/context";
import { PayPalCheckout } from "@/components/payments/PayPalCheckout";
import { grantPaidAccessForPlate } from "@/lib/payments/access";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { trackBeginCheckout } from "@/lib/analytics/gtm";

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
  const canSkipPaymentForDemo = process.env.NEXT_PUBLIC_ENABLE_DEMO_SKIP_PAYMENT === "true";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const value = Number.parseFloat(settings.payment.amount);
    trackBeginCheckout({
      plate,
      value: Number.isFinite(value) ? value : 0,
      currency: settings.payment.currency
    });
  }, [isOpen, plate, settings.payment.amount, settings.payment.currency]);

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
              <div className={styles.planName}>{locale === "nl" ? "Betalen met PayPal" : "Pay with PayPal"}</div>
              <div className={styles.planPrice}>
                {settings.payment.currency} {settings.payment.amount}
                <span>/{locale === "nl" ? "zoekopdracht" : "search"}</span>
              </div>
            </div>
            <ul className={styles.features}>
              <li><Check size={14} className={styles.checkIcon} /> {locale === "nl" ? "Ontgrendelt alle premium tabbladen voor dit kenteken" : "Unlocks all premium tabs for this plate"}</li>
              <li><Check size={14} className={styles.checkIcon} /> {locale === "nl" ? "Maakt rapportdownload beschikbaar voor dit kenteken" : "Enables report download for this plate"}</li>
              <li><Check size={14} className={styles.checkIcon} /> {locale === "nl" ? "Per zoekopdracht betaling" : "Payment per search"}</li>
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
                  try {
                    await fetch(`/api/payments/access/${encodeURIComponent(plate)}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: email.trim().toLowerCase() || undefined })
                    });
                  } catch {
                    // Keep demo UX non-blocking even if backend grant fails.
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
            <Sparkles size={16} /> {locale === "nl" ? "Beste prijs garantie" : "Best Price Guaranteed"}
          </div>
        </div>
      </div>
    </div>
  );
}

