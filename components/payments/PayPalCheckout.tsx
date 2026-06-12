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
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function PayPalCheckout({
  plate,
  email,
  currency = "EUR",
  onSuccess,
  onError
}: Props) {
  const { locale } = useI18n();
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);

  useEffect(() => {
    let active = true;
    loadPaypalSdk(currency)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((err) => {
        onError(err instanceof Error ? err.message : "PayPal SDK failed to load.");
      });

    return () => {
      active = false;
    };
  }, [currency, onError]);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.paypal || renderedRef.current) return;
    renderedRef.current = true;

    const buttons = window.paypal.Buttons({
      createOrder: () => createOrderForPlate(plate),
      onApprove: async ({ orderID }) => {
        await captureOrderForPlate({ orderId: orderID, plate, email, locale });
        onSuccess();
      },
      onError: (error) => {
        onError(error instanceof Error ? error.message : "PayPal checkout failed.");
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
  }, [ready, plate, email, locale, onSuccess, onError]);

  return <div ref={containerRef} />;
}
