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

// Minimal local view of the PayPal funding + card-fields API. We keep the shared
// paypal-sdk.ts global type untouched and describe only what we use here.
type FundingButtons = {
  isEligible: () => boolean;
  render: (el: HTMLElement) => Promise<void>;
  close: () => void;
};
type CardField = { render: (el: string | HTMLElement) => Promise<void> };
type CardFieldsInstance = {
  isEligible: () => boolean;
  NumberField: (o?: Record<string, unknown>) => CardField;
  ExpiryField: (o?: Record<string, unknown>) => CardField;
  CVVField: (o?: Record<string, unknown>) => CardField;
  submit: (o?: { billingAddress?: Record<string, string> }) => Promise<void>;
};
type PaypalSdk = {
  FUNDING?: Record<string, string>;
  Buttons: (config: Record<string, unknown>) => FundingButtons;
  CardFields?: (config: Record<string, unknown>) => CardFieldsInstance;
};

const LOGOS: Record<Method, string[]> = {
  applepay: ["apple-pay.svg"],
  googlepay: ["google-pay.svg"],
  ideal: ["ideal.svg"],
  card: ["visa.svg", "mastercard.svg"],
  paypal: ["paypal.svg"]
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
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  // Card: "fields" = inline PayPal CardFields (advanced cards), "button" = the
  // hosted card button fallback when CardFields is not eligible on the account.
  const [cardMode, setCardMode] = useState<"fields" | "button" | null>(null);
  const [billing, setBilling] = useState({ line1: "", postalCode: "", city: "" });

  const actionContainerRef = useRef<HTMLDivElement | null>(null);
  const fundingButtonsRef = useRef<FundingButtons | null>(null);
  const cardFieldsRef = useRef<CardFieldsInstance | null>(null);

  const latest = useRef({ plate, email, locale, onSuccess, onError });
  latest.current = { plate, email, locale, onSuccess, onError };

  const sharedOrderConfig = () => ({
    createOrder: () => createOrderForPlate(latest.current.plate),
    onApprove: async ({ orderID }: { orderID: string }) => {
      const { plate: p, email: e, locale: l, onSuccess: ok } = latest.current;
      await captureOrderForPlate({ orderId: orderID, plate: p, email: e, locale: l });
      ok();
    },
    onError: (err: unknown) => {
      setBusy(false);
      latest.current.onError(err instanceof Error ? err.message : "Betaling mislukt.");
    }
  });

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
        const sdk = window.paypal as unknown as PaypalSdk | undefined;
        const funding = sdk?.FUNDING ?? {};
        const fundingEligible = (key: string): boolean => {
          try {
            if (!sdk || !funding[key]) return false;
            return sdk
              .Buttons({ fundingSource: funding[key], createOrder: () => Promise.resolve(""), onApprove: async () => {} })
              .isEligible();
          } catch {
            return false;
          }
        };
        setAvailable({
          applepay: isIOS,
          googlepay: isAndroid,
          // CARD funding eligibility gates the tile; the selection effect then
          // uses inline CardFields when available, else the hosted card button.
          card: fundingEligible("CARD"),
          paypal: fundingEligible("PAYPAL")
        });
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, retryKey]);

  // Render the branded button (PayPal, or the card fallback) or the inline
  // CardFields into the action area on selection.
  useEffect(() => {
    const cleanup = () => {
      if (fundingButtonsRef.current) {
        try {
          fundingButtonsRef.current.close();
        } catch {
          // no-op
        }
        fundingButtonsRef.current = null;
      }
      cardFieldsRef.current = null;
    };
    cleanup();
    setLocalError("");

    if (!ready) return cleanup;
    const sdk = window.paypal as unknown as PaypalSdk | undefined;
    const funding = sdk?.FUNDING ?? {};
    const container = actionContainerRef.current;
    if (!sdk) return cleanup;

    const renderFunding = (key: string) => {
      if (!funding[key] || !container) return;
      container.innerHTML = "";
      try {
        const buttons = sdk.Buttons({
          fundingSource: funding[key],
          style:
            key === "PAYPAL"
              ? { height: 48, shape: "pill", color: "gold", label: "paypal" }
              : { height: 48, shape: "pill" },
          ...sharedOrderConfig()
        });
        if (!buttons.isEligible()) return;
        void buttons.render(container);
        fundingButtonsRef.current = buttons;
      } catch {
        // a single funding source failing must not break the checkout
      }
    };

    if (selected === "paypal") {
      renderFunding("PAYPAL");
    } else if (selected === "card") {
      // Prefer inline CardFields (collects billing address); fall back to the
      // hosted card button if the account is not enabled for advanced cards.
      let usedFields = false;
      try {
        if (sdk.CardFields) {
          const cf = sdk.CardFields(sharedOrderConfig());
          if (cf.isEligible()) {
            cf.NumberField({ placeholder: locale === "nl" ? "Kaartnummer" : "Card number" }).render("#kr-card-number");
            cf.ExpiryField({ placeholder: "MM/JJ" }).render("#kr-card-expiry");
            cf.CVVField({ placeholder: "CVC" }).render("#kr-card-cvv");
            cardFieldsRef.current = cf;
            usedFields = true;
            setCardMode("fields");
          }
        }
      } catch {
        usedFields = false;
      }
      if (!usedFields) {
        setCardMode("button");
        renderFunding("CARD");
      }
    }

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready, locale]);

  const payIdeal = async () => {
    setLocalError("");
    setBusy(true);
    try {
      const redirect = await createIdealOrderForPlate({ plate, email });
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

  const payCard = () => {
    if (!cardFieldsRef.current) {
      onError(locale === "nl" ? "Kaartbetaling is niet beschikbaar." : "Card payment is unavailable.");
      return;
    }
    if (!billing.line1.trim() || !billing.postalCode.trim() || !billing.city.trim()) {
      setLocalError(locale === "nl" ? "Vul je adresgegevens in." : "Please fill in your billing address.");
      return;
    }
    setLocalError("");
    setBusy(true);
    cardFieldsRef.current
      .submit({
        billingAddress: {
          addressLine1: billing.line1.trim(),
          adminArea2: billing.city.trim(),
          postalCode: billing.postalCode.trim(),
          countryCode: "NL"
        }
      })
      .then(() => {
        // On success the PayPal SDK has already run onApprove -> capture ->
        // onSuccess (the modal then shows its success view). Reset busy in case
        // the component stays mounted.
        setBusy(false);
      })
      .catch(() => {
        setBusy(false);
        setLocalError(
          locale === "nl"
            ? "De betaling is niet afgerond. Controleer je kaart- en adresgegevens."
            : "Payment was not completed. Check your card and address details."
        );
      });
  };

  const onPayNow = () => {
    if (busy) return;
    if (selected === "ideal") return void payIdeal();
    if (selected === "card" && cardMode === "fields") return payCard();
  };

  const tiles: Array<{ key: Method; name: string }> = [];
  if (available.applepay) tiles.push({ key: "applepay", name: "Apple Pay" });
  if (available.googlepay) tiles.push({ key: "googlepay", name: "Google Pay" });
  tiles.push({ key: "ideal", name: "iDEAL" });
  if (available.card) tiles.push({ key: "card", name: locale === "nl" ? "Creditcard" : "Credit card" });
  if (available.paypal) tiles.push({ key: "paypal", name: "PayPal" });

  const showPayNow = selected === "ideal" || (selected === "card" && cardMode === "fields");

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
            <span className={styles.tileLogos}>
              {LOGOS[tile.key].map((file) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={file} className={styles.logo} src={`/payment-logos/${file}`} alt={tile.name} />
              ))}
            </span>
          </button>
        ))}
      </div>

      {/* Inline card fields + billing address (shown only in CardFields mode). */}
      {selected === "card" ? (
        <div className={`${styles.cardArea} ${cardMode === "button" ? styles.hidden : ""}`}>
          <div className={styles.cardField} id="kr-card-number" />
          <div className={styles.cardRow}>
            <div className={styles.cardField} id="kr-card-expiry" />
            <div className={styles.cardField} id="kr-card-cvv" />
          </div>
          <div className={styles.addrLabel}>{locale === "nl" ? "Factuuradres" : "Billing address"}</div>
          <input
            className={styles.addrInput}
            placeholder={locale === "nl" ? "Straat en huisnummer" : "Street and number"}
            autoComplete="address-line1"
            value={billing.line1}
            onChange={(e) => setBilling((b) => ({ ...b, line1: e.target.value }))}
          />
          <div className={styles.cardRow}>
            <input
              className={styles.addrInput}
              placeholder={locale === "nl" ? "Postcode" : "Postal code"}
              autoComplete="postal-code"
              value={billing.postalCode}
              onChange={(e) => setBilling((b) => ({ ...b, postalCode: e.target.value }))}
            />
            <input
              className={styles.addrInput}
              placeholder={locale === "nl" ? "Plaats" : "City"}
              autoComplete="address-level2"
              value={billing.city}
              onChange={(e) => setBilling((b) => ({ ...b, city: e.target.value }))}
            />
          </div>
        </div>
      ) : null}

      {/* Branded button slot: PayPal, or the card fallback button. */}
      <div
        className={`${styles.actionSlot} ${selected === "paypal" || (selected === "card" && cardMode === "button") ? "" : styles.hidden}`}
        ref={actionContainerRef}
      />

      {selected === "applepay" ? (
        <div className={styles.actionSlot}>
          <ApplePayButton plate={plate} email={email} amount={amount} currency={currency} onSuccess={onSuccess} onError={onError} />
        </div>
      ) : null}

      {selected === "googlepay" ? (
        <div className={styles.actionSlot}>
          <GooglePayButton plate={plate} email={email} amount={amount} currency={currency} onSuccess={onSuccess} onError={onError} />
        </div>
      ) : null}

      {showPayNow ? (
        <button type="button" className={styles.payBtn} onClick={onPayNow} disabled={busy}>
          {busy ? (locale === "nl" ? "Bezig..." : "Working...") : locale === "nl" ? "Betaal nu" : "Pay now"}
        </button>
      ) : null}

      {localError ? <p className={styles.localError}>{localError}</p> : null}

      <div className={styles.secure}>
        <ShieldCheck size={14} />
        {locale === "nl" ? "Beveiligde betaling via PayPal" : "Secure payment via PayPal"}
      </div>
    </div>
  );
}
