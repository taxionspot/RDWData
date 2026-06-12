"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { X, Check, ShieldCheck, Zap, Sparkles } from "lucide-react";
import styles from "./SubscriptionModal.module.css";
import { useI18n } from "@/lib/i18n/context";
import { PayPalCheckout } from "@/components/payments/PayPalCheckout";
import { ApplePayButton } from "@/components/payments/ApplePayButton";
import { GooglePayButton } from "@/components/payments/GooglePayButton";
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

  // Save the email as a checkout lead so an abandoned checkout can get a follow-up email.
  useEffect(() => {
    if (!isOpen || !plate) return;
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    const timer = setTimeout(() => {
      void fetch("/api/checkout/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, plate, lang: locale })
      }).catch(() => {
        // Lead capture must never block checkout.
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [email, isOpen, plate, locale]);

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
              <div className={styles.planName}>{locale === "nl" ? "Veilig betalen" : "Secure payment"}</div>
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
              <ApplePayButton
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
              <GooglePayButton
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
            <p className={styles.subtitle} style={{ marginTop: 10, fontSize: 11, lineHeight: 1.5 }}>
              {locale === "nl" ? (
                <>
                  Door te betalen ga je akkoord met de{" "}
                  <Link href="/terms-and-conditions" className={styles.bold} target="_blank">
                    algemene voorwaarden
                  </Link>{" "}
                  en stem je in met directe levering van het rapport, waarmee je afstand doet van je herroepingsrecht. Zie ook ons{" "}
                  <Link href="/privacy-policy" className={styles.bold} target="_blank">
                    privacybeleid
                  </Link>
                  .
                </>
              ) : (
                <>
                  By paying you agree to the{" "}
                  <Link href="/terms-and-conditions" className={styles.bold} target="_blank">
                    terms and conditions
                  </Link>{" "}
                  and consent to immediate delivery of the report, waiving your right of withdrawal. See also our{" "}
                  <Link href="/privacy-policy" className={styles.bold} target="_blank">
                    privacy policy
                  </Link>
                  .
                </>
              )}
            </p>
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

