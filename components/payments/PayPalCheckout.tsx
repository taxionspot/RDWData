"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    paypal?: any;
    google?: any;
    ApplePaySession?: any;
  }
}

type Props = {
  plate: string;
  email?: string;
  amount?: string;
  currency?: string;
  onSuccess: () => void;
  onError: (message: string) => void;
};

const SCRIPT_ID = "paypal-js-sdk";
const GPAY_SCRIPT_ID = "gpay-js-sdk";
// Google Pay environment. Set NEXT_PUBLIC_PAYPAL_ENV=live in production.
const PAYPAL_ENV = process.env.NEXT_PUBLIC_PAYPAL_ENV === "live" ? "live" : "sandbox";

function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${id}`)));
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${id}`));
    document.body.appendChild(script);
  });
}

function loadPaypalScript(clientId: string, currency: string): Promise<void> {
  if (window.paypal) return Promise.resolve();
  // components=buttons,applepay,googlepay so we can offer the wallets too;
  // enable-funding surfaces iDEAL + Bancontact as their own buttons (card and
  // PayPal are eligible by default). Eligibility is still checked per button.
  const src =
    `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}` +
    `&currency=${encodeURIComponent(currency)}` +
    `&intent=capture` +
    `&components=buttons,applepay,googlepay` +
    `&enable-funding=ideal,bancontact`;
  return loadScript(SCRIPT_ID, src);
}

export function PayPalCheckout({ plate, email, amount = "6.95", currency = "EUR", onSuccess, onError }: Props) {
  const [ready, setReady] = useState(false);
  const renderedRef = useRef(false);

  const walletRef = useRef<HTMLDivElement | null>(null); // Apple Pay / Google Pay
  const paypalRef = useRef<HTMLDivElement | null>(null);
  const idealRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const bancontactRef = useRef<HTMLDivElement | null>(null);

  // Shared order lifecycle (same create/capture endpoints for every method).
  const createOrder = async (): Promise<string> => {
    const response = await fetch("/api/payments/paypal/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate, amount, currency })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Unable to create PayPal order.");
    }
    const order = (await response.json()) as { id?: string };
    if (!order.id) throw new Error("PayPal order id missing.");
    return order.id;
  };

  const captureOrder = async (orderId: string): Promise<void> => {
    const response = await fetch("/api/payments/paypal/capture-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, plate, email })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Unable to capture payment.");
    }
  };

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";
    if (!clientId) {
      onError("Missing NEXT_PUBLIC_PAYPAL_CLIENT_ID.");
      return;
    }
    let active = true;
    loadPaypalScript(clientId, currency)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((err) => onError(err instanceof Error ? err.message : "PayPal SDK failed to load."));
    return () => {
      active = false;
    };
  }, [currency, onError]);

  useEffect(() => {
    if (!ready || !window.paypal || renderedRef.current) return;
    renderedRef.current = true;
    const paypal = window.paypal;
    const instances: Array<{ close?: () => void }> = [];

    // --- Standard funding buttons (PayPal, iDEAL, card, Bancontact) ---
    const standard: Array<[string, HTMLDivElement | null]> = [
      [paypal.FUNDING?.PAYPAL ?? "paypal", paypalRef.current],
      [paypal.FUNDING?.IDEAL ?? "ideal", idealRef.current],
      [paypal.FUNDING?.CARD ?? "card", cardRef.current],
      [paypal.FUNDING?.BANCONTACT ?? "bancontact", bancontactRef.current]
    ];
    for (const [fundingSource, container] of standard) {
      if (!container) continue;
      try {
        const button = paypal.Buttons({
          fundingSource,
          style: { layout: "vertical", shape: "rect", height: 44, tagline: false },
          createOrder,
          onApprove: async ({ orderID }: { orderID: string }) => {
            await captureOrder(orderID);
            onSuccess();
          },
          onError: (err: unknown) => onError(err instanceof Error ? err.message : "PayPal checkout failed.")
        });
        if (button.isEligible && button.isEligible()) {
          void button.render(container);
          instances.push(button);
        }
      } catch {
        // skip an ineligible / unavailable funding source
      }
    }

    // --- Google Pay (isolated; never breaks the buttons above) ---
    void (async () => {
      try {
        if (!paypal.Googlepay || !walletRef.current) return;
        const gp = paypal.Googlepay();
        const cfg = await gp.config();
        if (!cfg?.allowedPaymentMethods) return;
        await loadScript(GPAY_SCRIPT_ID, "https://pay.google.com/gp/p/js/pay.js");
        if (!window.google?.payments?.api) return;
        const client = new window.google.payments.api.PaymentsClient({ environment: PAYPAL_ENV === "live" ? "PRODUCTION" : "TEST" });
        const readyToPay = await client.isReadyToPay({
          apiVersion: cfg.apiVersion,
          apiVersionMinor: cfg.apiVersionMinor,
          allowedPaymentMethods: cfg.allowedPaymentMethods
        });
        if (!readyToPay?.result) return;
        const button = client.createButton({
          buttonSizeMode: "fill",
          buttonType: "pay",
          onClick: async () => {
            try {
              const paymentData = await client.loadPaymentData({
                apiVersion: cfg.apiVersion,
                apiVersionMinor: cfg.apiVersionMinor,
                allowedPaymentMethods: cfg.allowedPaymentMethods,
                merchantInfo: cfg.merchantInfo,
                transactionInfo: {
                  totalPriceStatus: "FINAL",
                  totalPrice: String(amount),
                  currencyCode: currency,
                  countryCode: cfg.countryCode ?? "NL"
                }
              });
              const orderId = await createOrder();
              const confirm = await gp.confirmOrder({ orderId, paymentMethodData: paymentData.paymentMethodData });
              if (confirm?.status === "APPROVED" || confirm?.status === "PAYER_ACTION_REQUIRED") {
                await captureOrder(orderId);
                onSuccess();
              } else {
                onError("Google Pay payment was not approved.");
              }
            } catch (err) {
              onError(err instanceof Error ? err.message : "Google Pay checkout failed.");
            }
          }
        });
        const wrap = document.createElement("div");
        wrap.style.marginBottom = "8px";
        wrap.appendChild(button);
        walletRef.current.appendChild(wrap);
      } catch {
        // Google Pay unavailable for this account/device; silently skip.
      }
    })();

    // --- Apple Pay (isolated; only on eligible Apple devices/browsers) ---
    void (async () => {
      try {
        if (!paypal.Applepay || !walletRef.current) return;
        if (typeof window.ApplePaySession === "undefined" || !window.ApplePaySession.canMakePayments()) return;
        const ap = paypal.Applepay();
        const cfg = await ap.config();
        if (!cfg?.isEligible) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-label", "Apple Pay");
        btn.style.cssText =
          "-webkit-appearance:-apple-pay-button;appearance:-apple-pay-button;width:100%;height:44px;border-radius:8px;border:none;cursor:pointer;margin-bottom:8px;";
        (btn.style as unknown as Record<string, string>)["-apple-pay-button-type"] = "buy";
        (btn.style as unknown as Record<string, string>)["-apple-pay-button-style"] = "black";
        btn.onclick = () => {
          try {
            const session = new window.ApplePaySession(4, {
              countryCode: cfg.countryCode ?? "NL",
              currencyCode: currency,
              merchantCapabilities: cfg.merchantCapabilities ?? ["supports3DS"],
              supportedNetworks: cfg.supportedNetworks ?? ["visa", "masterCard", "amex"],
              total: { label: "Kentekenrapport", amount: String(amount) }
            });
            session.onvalidatemerchant = async (event: any) => {
              try {
                const validation = await ap.validateMerchant({ validationUrl: event.validationURL });
                session.completeMerchantValidation(validation.merchantSession);
              } catch (err) {
                session.abort();
                onError(err instanceof Error ? err.message : "Apple Pay validation failed.");
              }
            };
            session.onpaymentauthorized = async (event: any) => {
              try {
                const orderId = await createOrder();
                await ap.confirmOrder({ orderId, token: event.payment.token, billingContact: event.payment.billingContact });
                await captureOrder(orderId);
                session.completePayment(window.ApplePaySession.STATUS_SUCCESS);
                onSuccess();
              } catch (err) {
                session.completePayment(window.ApplePaySession.STATUS_FAILURE);
                onError(err instanceof Error ? err.message : "Apple Pay checkout failed.");
              }
            };
            session.begin();
          } catch (err) {
            onError(err instanceof Error ? err.message : "Apple Pay could not start.");
          }
        };
        walletRef.current.appendChild(btn);
      } catch {
        // Apple Pay unavailable; silently skip.
      }
    })();

    return () => {
      instances.forEach((b) => {
        try {
          b.close?.();
        } catch {
          // no-op
        }
      });
    };
  }, [ready, plate, email, amount, currency, onSuccess, onError]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
      <div ref={walletRef} />
      <div ref={idealRef} />
      <div ref={paypalRef} />
      <div ref={cardRef} />
      <div ref={bancontactRef} />
    </div>
  );
}
