"use client";

import { useEffect, useRef } from "react";
import styles from "./WalletButtons.module.css";
import { useI18n } from "@/lib/i18n/context";
import {
  getGooglePayEnvironment,
  loadGooglePayJs,
  loadPaypalSdk,
  type GooglePaySdkConfig,
  type GooglePaymentsClient
} from "@/lib/payments/paypal-sdk";
import { captureOrderForPlate, createOrderForPlate } from "@/lib/payments/checkout-client";

type Props = {
  plate: string;
  email?: string;
  amount: string;
  currency?: string;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function GooglePayButton({ plate, email, amount, currency = "EUR", onSuccess, onError }: Props) {
  const { locale } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);

  // Latest props in a ref so the Google Pay button (created once) reads current
  // values at pay time. This keeps the email keystrokes from re-running setup
  // and confirms the order with the email the user actually typed.
  const latest = useRef({ plate, email, amount, locale, onSuccess, onError });
  latest.current = { plate, email, amount, locale, onSuccess, onError };

  useEffect(() => {
    let active = true;

    const setup = async () => {
      await Promise.all([loadPaypalSdk(currency), loadGooglePayJs()]);
      if (!active || renderedRef.current) return;
      const googlepay = window.paypal?.Googlepay?.();
      const PaymentsClient = window.google?.payments?.api?.PaymentsClient;
      if (!googlepay || !PaymentsClient) return;

      const config = await googlepay.config();
      if (!active || !config.isEligible) return;

      const paymentsClient = new PaymentsClient({ environment: getGooglePayEnvironment() });
      const readiness = await paymentsClient.isReadyToPay({
        apiVersion: config.apiVersion,
        apiVersionMinor: config.apiVersionMinor,
        allowedPaymentMethods: config.allowedPaymentMethods
      });
      if (!active || !readiness.result || !containerRef.current || renderedRef.current) return;

      renderedRef.current = true;
      const button = paymentsClient.createButton({
        onClick: () => {
          void payWithGooglePay(googlepay, paymentsClient, config);
        },
        buttonType: "pay",
        buttonSizeMode: "fill",
        buttonLocale: latest.current.locale
      });
      containerRef.current.appendChild(button);
    };

    const payWithGooglePay = async (
      googlepay: NonNullable<ReturnType<NonNullable<NonNullable<Window["paypal"]>["Googlepay"]>>>,
      paymentsClient: GooglePaymentsClient,
      config: GooglePaySdkConfig
    ) => {
      try {
        const paymentData = await paymentsClient.loadPaymentData({
          apiVersion: config.apiVersion,
          apiVersionMinor: config.apiVersionMinor,
          allowedPaymentMethods: config.allowedPaymentMethods,
          merchantInfo: config.merchantInfo,
          transactionInfo: {
            countryCode: config.countryCode ?? "NL",
            currencyCode: currency,
            totalPriceStatus: "FINAL",
            totalPrice: latest.current.amount
          }
        });

        const orderId = await createOrderForPlate({ plate: latest.current.plate, email: latest.current.email });
        const confirmation = await googlepay.confirmOrder({
          orderId,
          paymentMethodData: paymentData.paymentMethodData
        });

        if (confirmation.status === "PAYER_ACTION_REQUIRED") {
          await googlepay.initiatePayerAction({ orderId });
        } else if (confirmation.status !== "APPROVED") {
          throw new Error(`Google Pay order not approved: ${confirmation.status}`);
        }

        const { plate: p, email: e, locale: l, onSuccess: ok } = latest.current;
        await captureOrderForPlate({ orderId, plate: p, email: e, locale: l });
        ok();
      } catch (error) {
        // Closing the Google Pay sheet rejects with statusCode CANCELED; not an error.
        const canceled =
          typeof error === "object" && error !== null && (error as { statusCode?: string }).statusCode === "CANCELED";
        if (canceled) return;
        latest.current.onError(error instanceof Error ? error.message : "Google Pay payment failed.");
      }
    };

    void setup().catch(() => {
      // Google Pay unavailable; the regular PayPal stack remains usable.
    });

    return () => {
      active = false;
    };
  }, [currency]);

  return <div ref={containerRef} className={styles.googlePayContainer} />;
}
