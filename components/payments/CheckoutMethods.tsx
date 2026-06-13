"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import styles from "./CheckoutMethods.module.css";
import { useI18n } from "@/lib/i18n/context";
import { loadPaypalSdk } from "@/lib/payments/paypal-sdk";
import {
  captureOrderForPlate,
  createIdealOrderForPlate,
  createOrderForPlate
} from "@/lib/payments/checkout-client";
import { ApplePayButton } from "./ApplePayButton";
import { GooglePayButton } from "./GooglePayButton";

type Method = "ideal" | "card" | "paypal" | "applepay" | "googlepay";

type Props = {
  plate: string;
  email?: string;
  amount: string;
  currency?: string;
  retryKey?: number;
  onSuccess: () => void;
  onError: (message: string) => void;
};

// Minimal local view of the PayPal funding API (FUNDING constants + Buttons
// with a fundingSource). We keep the shared paypal-sdk.ts global type untouched.
type FundingButtons = {
  isEligible: () => boolean;
  render: (el: HTMLElement) => Promise<void>;
  close: () => void;
};
type FundingSdk = {
  FUNDING?: Record<string, string>;
  Buttons: (config: Record<string, unknown>) => FundingButtons;
};

export function CheckoutMethods({
  plate,
  email,
  amount,
  currency = "EUR",
  retryKey = 0,
  onSuccess,
  onError
}: Props) {
  const { locale } = useI18n();
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState({
    applepay: false,
    googlepay: false,
    card: false,
    paypal: false
  });
  const [selected, setSelected] = useState<Method>("ideal");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const fundingContainerRef = useRef<HTMLDivElement | null>(null);
  const fundingButtonsRef = useRef<FundingButtons | null>(null);

  // Latest props so the funding button (created once per selection) reads
  // current plate/email at pay time without re-rendering on each keystroke.
  const latest = useRef({ plate, email, locale, onSuccess, onError });
  latest.current = { plate, email, locale, onSuccess, onError };

  // Load the SDK and probe which non-iDEAL methods are eligible. iDEAL needs no
  // SDK (it is a server-side redirect), so it stays available even if this fails.
  useEffect(() => {
    let active = true;
    setReady(false);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const isIOS =
      /iPad|iPhone|iPod/i.test(ua) ||
      (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);

    loadPaypalSdk(currency)
      .then(() => {
        if (!active) return;
        const sdk = window.paypal as unknown as FundingSdk | undefined;
        const funding = sdk?.FUNDING ?? {};
        const eligible = (key: string): boolean => {
          try {
            if (!sdk || !funding[key]) return false;
            const probe = sdk.Buttons({
              fundingSource: funding[key],
              createOrder: () => Promise.resolve(""),
              onApprove: async () => {}
            });
            return probe.isEligible();
          } catch {
            return false;
          }
        };
        setAvailable({
          applepay: isIOS,
          googlepay: isAndroid,
          card: eligible("CARD"),
          paypal: eligible("PAYPAL")
        });
        setReady(true);
      })
      .catch(() => {
        // SDK failed: only iDEAL (server redirect) remains usable.
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, [currency, retryKey]);

  // Render the branded button for card / PayPal into its slot on selection.
  useEffect(() => {
    if (fundingButtonsRef.current) {
      try {
        fundingButtonsRef.current.close();
      } catch {
        // no-op
      }
      fundingButtonsRef.current = null;
    }
    if (!ready || (selected !== "card" && selected !== "paypal")) return;

    const sdk = window.paypal as unknown as FundingSdk | undefined;
    const funding = sdk?.FUNDING ?? {};
    const key = selected === "card" ? "CARD" : "PAYPAL";
    const container = fundingContainerRef.current;
    if (!sdk || !funding[key] || !container) return;

    container.innerHTML = "";
    try {
      const buttons = sdk.Buttons({
        fundingSource: funding[key],
        style:
          key === "PAYPAL"
            ? { height: 48, shape: "pill", color: "gold", label: "paypal" }
            : { height: 48, shape: "pill" },
        createOrder: () => createOrderForPlate(latest.current.plate),
        onApprove: async ({ orderID }: { orderID: string }) => {
          const { plate: p, email: e, locale: l, onSuccess: ok } = latest.current;
          await captureOrderForPlate({ orderId: orderID, plate: p, email: e, locale: l });
          ok();
        },
        onCancel: () => {
          setLocalError("");
        },
        onError: (err: unknown) => {
          latest.current.onError(err instanceof Error ? err.message : "Betaling mislukt.");
        }
      });
      if (!buttons.isEligible()) return;
      void buttons.render(container);
      fundingButtonsRef.current = buttons;
    } catch {
      // A single funding source failing must not break the rest of the checkout.
    }

    return () => {
      if (fundingButtonsRef.current) {
        try {
          fundingButtonsRef.current.close();
        } catch {
          // no-op
        }
        fundingButtonsRef.current = null;
      }
    };
  }, [selected, ready]);

  const payIdeal = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setLocalError(
        locale === "nl" ? "Vul je naam in om met iDEAL te betalen." : "Enter your name to pay with iDEAL."
      );
      return;
    }
    setLocalError("");
    setBusy(true);
    try {
      const redirect = await createIdealOrderForPlate({ plate, name: trimmed, email });
      window.location.href = redirect;
    } catch (error) {
      setBusy(false);
      onError(
        error instanceof Error
          ? error.message
          : locale === "nl"
            ? "iDEAL kon niet worden gestart."
            : "Could not start iDEAL."
      );
    }
  };

  const tiles: Array<{ key: Method; name: string; swatch: string; brand: string }> = [];
  if (available.applepay) tiles.push({ key: "applepay", name: "Apple Pay", swatch: styles.swatchApple, brand: "Pay" });
  if (available.googlepay) tiles.push({ key: "googlepay", name: "Google Pay", swatch: styles.swatchGoogle, brand: "Pay" });
  tiles.push({ key: "ideal", name: "iDEAL", swatch: styles.swatchIdeal, brand: "iDEAL" });
  if (available.card)
    tiles.push({
      key: "card",
      name: locale === "nl" ? "Creditcard" : "Credit card",
      swatch: styles.swatchCard,
      brand: "VISA"
    });
  if (available.paypal) tiles.push({ key: "paypal", name: "PayPal", swatch: styles.swatchPaypal, brand: "PayPal" });

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>{locale === "nl" ? "Kies een betaalmethode" : "Choose a payment method"}</div>

      <div className={styles.methods} role="radiogroup">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            role="radio"
            aria-checked={selected === tile.key}
            className={`${styles.tile} ${selected === tile.key ? styles.selected : ""}`}
            onClick={() => {
              setSelected(tile.key);
              setLocalError("");
            }}
          >
            <span className={styles.radio} />
            <span className={styles.tileName}>{tile.name}</span>
            <span className={styles.tileBrand}>
              <span className={`${styles.swatch} ${tile.swatch}`}>{tile.brand}</span>
            </span>
          </button>
        ))}
      </div>

      {selected === "ideal" ? (
        <>
          <div className={styles.nameRow}>
            <label className={styles.nameLabel} htmlFor="kr-ideal-name">
              {locale === "nl" ? "Naam rekeninghouder" : "Account holder name"}
            </label>
            <input
              id="kr-ideal-name"
              type="text"
              className={styles.nameInput}
              autoComplete="name"
              placeholder={locale === "nl" ? "Voor- en achternaam" : "Full name"}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button type="button" className={styles.payBtn} onClick={payIdeal} disabled={busy}>
            {busy ? (locale === "nl" ? "Bezig..." : "Working...") : locale === "nl" ? "Betaal nu" : "Pay now"}
          </button>
        </>
      ) : null}

      {selected === "card" || selected === "paypal" ? (
        <div className={styles.walletSlot} ref={fundingContainerRef} />
      ) : null}

      {selected === "applepay" ? (
        <div className={styles.walletSlot}>
          <ApplePayButton
            plate={plate}
            email={email}
            amount={amount}
            currency={currency}
            onSuccess={onSuccess}
            onError={onError}
          />
        </div>
      ) : null}

      {selected === "googlepay" ? (
        <div className={styles.walletSlot}>
          <GooglePayButton
            plate={plate}
            email={email}
            amount={amount}
            currency={currency}
            onSuccess={onSuccess}
            onError={onError}
          />
        </div>
      ) : null}

      {localError ? <p className={styles.localError}>{localError}</p> : null}

      <div className={styles.secure}>
        <ShieldCheck size={14} />
        {locale === "nl" ? "Beveiligde betaling via PayPal" : "Secure payment via PayPal"}
      </div>
    </div>
  );
}
