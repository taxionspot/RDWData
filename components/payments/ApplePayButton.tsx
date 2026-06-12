"use client";

import { useEffect, useState } from "react";
import styles from "./WalletButtons.module.css";
import { useI18n } from "@/lib/i18n/context";
import { loadPaypalSdk, type ApplePaySdkConfig } from "@/lib/payments/paypal-sdk";
import { captureOrderForPlate, createOrderForPlate } from "@/lib/payments/checkout-client";

type Props = {
  plate: string;
  email?: string;
  amount: string;
  currency?: string;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function ApplePayButton({ plate, email, amount, currency = "EUR", onSuccess, onError }: Props) {
  const { locale } = useI18n();
  const [config, setConfig] = useState<ApplePaySdkConfig | null>(null);

  useEffect(() => {
    let active = true;
    void loadPaypalSdk(currency)
      .then(async () => {
        if (!window.paypal?.Applepay || !window.ApplePaySession?.canMakePayments()) return;
        const sdkConfig = await window.paypal.Applepay().config();
        if (active && sdkConfig.isEligible) setConfig(sdkConfig);
      })
      .catch(() => {
        // Apple Pay unavailable; the regular PayPal stack remains usable.
      });
    return () => {
      active = false;
    };
  }, [currency]);

  if (!config) return null;

  const startApplePay = () => {
    const applepay = window.paypal?.Applepay?.();
    const ApplePaySession = window.ApplePaySession;
    if (!applepay || !ApplePaySession) return;

    const session = new ApplePaySession(4, {
      countryCode: config.countryCode,
      currencyCode: config.currencyCode || currency,
      merchantCapabilities: config.merchantCapabilities,
      supportedNetworks: config.supportedNetworks,
      total: {
        label: "Kentekenrapport",
        amount,
        type: "final"
      }
    });

    session.onvalidatemerchant = (event) => {
      applepay
        .validateMerchant({ validationUrl: event.validationURL, displayName: "Kentekenrapport" })
        .then((payload) => session.completeMerchantValidation(payload.merchantSession))
        .catch(() => {
          session.abort();
          onError("Apple Pay validation failed.");
        });
    };

    session.onpaymentauthorized = (event) => {
      void (async () => {
        try {
          const orderId = await createOrderForPlate(plate);
          await applepay.confirmOrder({
            orderId,
            token: event.payment.token,
            billingContact: event.payment.billingContact
          });
          await captureOrderForPlate({ orderId, plate, email, locale });
          session.completePayment(ApplePaySession.STATUS_SUCCESS);
          onSuccess();
        } catch (error) {
          session.completePayment(ApplePaySession.STATUS_FAILURE);
          onError(error instanceof Error ? error.message : "Apple Pay payment failed.");
        }
      })();
    };

    session.oncancel = () => {
      // Buyer dismissed the sheet; no error needed.
    };

    session.begin();
  };

  return (
    <button
      type="button"
      className={styles.applePayButton}
      onClick={startApplePay}
      aria-label={locale === "nl" ? "Betalen met Apple Pay" : "Pay with Apple Pay"}
    />
  );
}
