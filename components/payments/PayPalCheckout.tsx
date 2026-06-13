"use client";

import { useEffect, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);

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
    if (!ready || !containerRef.current || !window.paypal || renderedRef.current) return;
    renderedRef.current = true;

    const buttons = window.paypal.Buttons({
      createOrder: () => createOrderForPlate(latest.current.plate),
      onApprove: async ({ orderID }) => {
        const { plate: p, email: e, locale: l, onSuccess: ok } = latest.current;
        await captureOrderForPlate({ orderId: orderID, plate: p, email: e, locale: l });
        ok();
      },
      onError: (error) => {
        latest.current.onError(error instanceof Error ? error.message : "PayPal checkout failed.");
      }
    });

    void buttons.render(containerRef.current);

    return () => {
      try {
        buttons.close();
      } catch {
        // no-op
      }
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

  return <div ref={containerRef} />;
}
