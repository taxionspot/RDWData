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
import { track } from "@/lib/analytics";
import { CheckCircle2, Download } from "lucide-react";

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
  const [view, setView] = useState<"checkout" | "success">("checkout");
  const canSkipPaymentForDemo =
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEMO_SKIP_PAYMENT === "true";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setView("checkout");
    setError(null);
    track("checkout_opened", { plate });
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

  const emailLooksInvalid = email.trim().length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleUnlocked = () => {
    track("payment_success", { plate });
    grantPaidAccessForPlate(plate);
    onUnlocked?.({ email: email.trim().toLowerCase() || undefined });
    setView("success");
  };

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

        {view === "success" ? (
          <div className={styles.successView}>
            <CheckCircle2 size={44} className={styles.successIcon} />
            <h3 className={styles.successTitle}>{locale === "nl" ? "Betaling gelukt" : "Payment successful"}</h3>
            <p className={styles.successText}>
              {locale === "nl"
                ? "Het volledige rapport is ontgrendeld voor dit kenteken."
                : "The full report is unlocked for this plate."}
              {email.trim()
                ? locale === "nl"
                  ? ` Een bevestiging is onderweg naar ${email.trim()}.`
                  : ` A confirmation is on its way to ${email.trim()}.`
                : ""}
            </p>
            <div className={styles.successActions}>
              <button type="button" className={styles.successPrimary} onClick={onClose}>
                {locale === "nl" ? "Bekijk het rapport" : "View the report"}
              </button>
              <a
                className={styles.successSecondary}
                href={`/api/vehicle/${encodeURIComponent(plate)}?lang=${locale}&download=1`}
                onClick={() => track("pdf_download", { plate })}
              >
                <Download size={15} /> {locale === "nl" ? "Download PDF" : "Download PDF"}
              </a>
            </div>
            <Link href={`/search/${encodeURIComponent(plate)}/vehicle-comparison`} className={styles.successUpsell} onClick={onClose}>
              {locale === "nl"
                ? "Twijfel je tussen meerdere auto's? Vergelijk dit kenteken met een tweede auto."
                : "Comparing several cars? Compare this plate with a second vehicle."}
            </Link>
          </div>
        ) : (
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
            {emailLooksInvalid ? (
              <p className={styles.emailHint}>{locale === "nl" ? "Controleer het e-mailadres." : "Please check the email address."}</p>
            ) : email.trim() ? (
              <p className={styles.emailNote}>
                {locale === "nl" ? `We sturen het rapport naar ${email.trim()}` : `We will send the report to ${email.trim()}`}
              </p>
            ) : null}
            <div className={styles.payMethodsRow}>
              <span>iDEAL</span><span>Apple Pay</span><span>Google Pay</span><span>PayPal</span><span>Visa/MC</span>
            </div>
            <p className={styles.guaranteeLine}>
              {locale === "nl"
                ? "Veilig betalen via iDEAL, Apple Pay, Google Pay of PayPal. Geen account nodig."
                : "Secure payment via iDEAL, Apple Pay, Google Pay or PayPal. No account needed."}
            </p>
            <div className={styles.planBtn}>
              <ApplePayButton
                plate={plate}
                email={email}
                amount={settings.payment.amount}
                currency={settings.payment.currency}
                onSuccess={handleUnlocked}
                onError={(message) => {
                  track("payment_failed", { plate });
                  setError(mapCheckoutErrorToFriendly(message, locale));
                }}
              />
              <GooglePayButton
                plate={plate}
                email={email}
                amount={settings.payment.amount}
                currency={settings.payment.currency}
                onSuccess={handleUnlocked}
                onError={(message) => {
                  track("payment_failed", { plate });
                  setError(mapCheckoutErrorToFriendly(message, locale));
                }}
              />
              <PayPalCheckout
                plate={plate}
                email={email}
                amount={settings.payment.amount}
                currency={settings.payment.currency}
                onSuccess={handleUnlocked}
                onError={(message) => {
                  track("payment_failed", { plate });
                  setError(mapCheckoutErrorToFriendly(message, locale));
                }}
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
              <div className={styles.errorBox}>
                <p>{error}</p>
                <button type="button" className={styles.retryBtn} onClick={() => setError(null)}>
                  {locale === "nl" ? "Probeer opnieuw" : "Try again"}
                </button>
              </div>
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
                  handleUnlocked();
                }}
              >
                {locale === "nl" ? "Demo: betaling overslaan" : "Demo: Skip payment"}
              </button>
            ) : null}
          </div>
        </div>
        )}

        <div className={styles.footer}>
          <div className={styles.trustItem}>
            <ShieldCheck size={16} /> {locale === "nl" ? "Geverifieerde RDW-data" : "Verified RDW Data"}
          </div>
          <div className={styles.trustItem}>
            <Sparkles size={16} /> {locale === "nl" ? "Direct toegang na betaling" : "Instant access after payment"}
          </div>
        </div>
      </div>
    </div>
  );
}

