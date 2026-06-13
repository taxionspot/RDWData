"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./WalletButtons.module.css";
import { useI18n } from "@/lib/i18n/context";
import { loadPaypalSdk } from "@/lib/payments/paypal-sdk";
import { captureOrderForPlate, createOrderForPlate } from "@/lib/payments/checkout-client";

type Props = {
  plate: string;
  email?: string;
  amount?: string;
  currency?: string;
  retryKey?: number;
  onSuccess: () => void;
  onError: (message: string) => void;
};

// Minimal local typing for the PayPal funding-source API. We keep the shared
// paypal-sdk.ts type untouched and only describe the extra surface we use here:
// FUNDING constants, the fundingSource option, and isEligible() on a button.
type PayPalFundingButtons = {
  isEligible: () => boolean;
  render: (selectorOrElement: string | HTMLElement) => Promise<void>;
  close: () => void;
};

type PayPalFundingSdk = {
  FUNDING?: Record<string, string>;
  Buttons: (config: Record<string, unknown>) => PayPalFundingButtons;
};

// The funding sources we offer, each rendered as its own labelled button so the
// checkout reads like an explicit payment-method list (iDEAL, Creditcard, PayPal).
const FUNDING_METHODS = [
  { key: "IDEAL", label: "iDEAL" },
  { key: "CARD", label: "Creditcard" },
  { key: "PAYPAL", label: "PayPal" }
] as const;

export function PayPalCheckout({
  plate,
  email,
  currency = "EUR",
  retryKey = 0,
  onSuccess,
  onError
}: Props) {
  const { locale } = useI18n();
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // One container ref per funding source, so each button renders into its own
  // labelled slot and the slots stack vertically as a method list.
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const renderedRef = useRef(false);
  const buttonsRef = useRef<PayPalFundingButtons[]>([]);

  // Keep the latest props in a ref so the PayPal buttons (rendered exactly once)
  // always read current values. Without this, typing in the email field changes
  // the email/callback props, re-runs the render effect, and the cleanup tears
  // the buttons down (buttons.close) without re-rendering them: the buttons
  // visibly disappear the moment the user types their email.
  const latest = useRef({ plate, email, locale, onSuccess, onError });
  latest.current = { plate, email, locale, onSuccess, onError };

  useEffect(() => {
    let active = true;
    // A retry should re-attempt loading and re-render, so clear the failure
    // state and allow the render effect below to run again.
    setLoadFailed(false);
    renderedRef.current = false;
    loadPaypalSdk(currency)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((err) => {
        if (active) setLoadFailed(true);
        latest.current.onError(err instanceof Error ? err.message : "PayPal SDK failed to load.");
      });

    return () => {
      active = false;
    };
  }, [currency, retryKey]);

  useEffect(() => {
    if (!ready || !window.paypal || renderedRef.current) return;
    renderedRef.current = true;

    const sdk = window.paypal as unknown as PayPalFundingSdk;
    const funding = sdk.FUNDING ?? {};

    const sharedConfig = {
      createOrder: () => createOrderForPlate(latest.current.plate),
      onApprove: async ({ orderID }: { orderID: string }) => {
        const { plate: p, email: e, locale: l, onSuccess: ok } = latest.current;
        await captureOrderForPlate({ orderId: orderID, plate: p, email: e, locale: l });
        ok();
      },
      onError: (error: unknown) => {
        latest.current.onError(error instanceof Error ? error.message : "PayPal checkout failed.");
      }
    };

    const rendered: PayPalFundingButtons[] = [];
    for (const method of FUNDING_METHODS) {
      const container = containerRefs.current[method.key];
      const fundingSource = funding[method.key];
      // Skip silently when the SDK does not expose this funding source or its
      // slot is missing.
      if (!container || !fundingSource) continue;
      try {
        const buttons = sdk.Buttons({ ...sharedConfig, fundingSource });
        // Only render eligible funding sources; skip ineligible ones silently.
        if (!buttons.isEligible()) continue;
        void buttons.render(container);
        rendered.push(buttons);
      } catch {
        // A single funding source failing must not break the other methods.
      }
    }
    buttonsRef.current = rendered;

    return () => {
      for (const buttons of buttonsRef.current) {
        try {
          buttons.close();
        } catch {
          // no-op
        }
      }
      buttonsRef.current = [];
    };
  }, [ready]);

  if (loadFailed) {
    return (
      <div role="alert" style={{ fontSize: 13, lineHeight: 1.5, color: "#5b6b84" }}>
        {locale === "nl"
          ? "Betaalknop kon niet laden. Probeer het opnieuw of gebruik een andere betaalmethode."
          : "The payment button could not load. Please try again or use a different payment method."}
      </div>
    );
  }

  return (
    <div className={styles.fundingStack}>
      {FUNDING_METHODS.map((method) => (
        <div key={method.key} className={styles.fundingMethod}>
          <span className={styles.fundingLabel}>{method.label}</span>
          <div
            className={styles.fundingButton}
            ref={(el) => {
              containerRefs.current[method.key] = el;
            }}
          />
        </div>
      ))}
    </div>
  );
}
