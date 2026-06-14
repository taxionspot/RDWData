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
  close?: () => void;
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

  const actionContainerRef = useRef<HTMLDivElement | null>(null);
  const fundingButtonsRef = useRef<FundingButtons | null>(null);
  const cardFieldsRef = useRef<CardFieldsInstance | null>(null);

  // Per-field ref nodes: rendered into by PayPal CardFields .render(el) instead
  // of document.getElementById selectors. React guarantees these nodes exist
  // before the effect fires, eliminating the getElementById race.
  const numberRef = useRef<HTMLDivElement | null>(null);
  const expiryRef = useRef<HTMLDivElement | null>(null);
  const cvvRef = useRef<HTMLDivElement | null>(null);

  // Once-guard: prevents StrictMode's double-invoke from mounting two sets of
  // card-field iframes. Reset in cleanup so a real unmount+remount works.
  const cardMountedRef = useRef(false);

  const latest = useRef({ plate, email, locale, onSuccess, onError });
  latest.current = { plate, email, locale, onSuccess, onError };

  const sharedOrderConfig = () => ({
    createOrder: () => createOrderForPlate({ plate: latest.current.plate, email: latest.current.email }),
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

    loadPaypalSdk(currency)
      .then(async () => {
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
        // Apple Pay works on Safari (desktop + iOS); Google Pay works wherever
        // the SDK reports it eligible (Chrome desktop included), not just Android.
        let applepayOk = false;
        let googlepayOk = false;
        try {
          if (window.ApplePaySession?.canMakePayments?.() && window.paypal?.Applepay) {
            const cfg = await window.paypal.Applepay().config();
            applepayOk = Boolean(cfg?.isEligible);
          }
        } catch {
          applepayOk = false;
        }
        try {
          if (window.paypal?.Googlepay) {
            const cfg = await window.paypal.Googlepay().config();
            googlepayOk = Boolean(cfg?.isEligible);
          }
        } catch {
          googlepayOk = false;
        }
        if (!active) return;
        setAvailable({
          applepay: applepayOk,
          googlepay: googlepayOk,
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
  //
  // FIX — three problems eliminated:
  // 1. PLACEMENT: cardArea is now rendered inside the tiles.map loop (see JSX
  //    below), directly under the Creditcard tile. This effect no longer needs
  //    to touch placement; it only mounts/tears down.
  // 2. DOUBLING (StrictMode race): cardMountedRef is checked at the top of the
  //    card branch. StrictMode invokes the effect twice synchronously; the second
  //    pass sees cardMountedRef.current === true and returns early, so only one
  //    set of iframes is ever rendered.
  // 3. CANCELLABLE ASYNC: `cancelled` is captured in the closure; the cleanup
  //    sets it to true. If a slow async render resolves after the cleanup ran, the
  //    handler immediately tears down (clears nodes + drops the instance) so no
  //    stray iframe survives a dismount.
  useEffect(() => {
    // `cancelled` tracks whether this effect instance has been cleaned up.
    // The card mount reads locale via latest.current so locale is NOT in the
    // dep array; locale changes therefore never churn the mount/teardown cycle.
    let cancelled = false;

    const teardownCard = () => {
      if (numberRef.current) numberRef.current.innerHTML = "";
      if (expiryRef.current) expiryRef.current.innerHTML = "";
      if (cvvRef.current) cvvRef.current.innerHTML = "";
      if (cardFieldsRef.current) {
        try { cardFieldsRef.current.close?.(); } catch { /* no-op */ }
        cardFieldsRef.current = null;
      }
      cardMountedRef.current = false;
    };

    const cleanup = () => {
      cancelled = true;
      if (fundingButtonsRef.current) {
        try { fundingButtonsRef.current.close(); } catch { /* no-op */ }
        fundingButtonsRef.current = null;
      }
      teardownCard();
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
      // Prefer inline CardFields; fall back to the hosted card button if the
      // account is not enabled for advanced cards.

      // ONCE-GUARD: StrictMode calls this effect twice in development.
      // The first pass sets cardMountedRef = true and starts the async renders.
      // The second synchronous pass sees true and exits immediately, so only
      // one set of iframes is ever injected.
      if (cardMountedRef.current) return cleanup;

      let usedFields = false;
      try {
        if (sdk.CardFields) {
          const cf = sdk.CardFields({
            ...sharedOrderConfig(),
            style: {
              input: { "font-size": "15px", "font-family": "inherit", color: "#0f172a" },
              ".invalid": { color: "#b91c1c" }
            }
          });
          if (cf.isEligible() && numberRef.current && expiryRef.current && cvvRef.current) {
            cardMountedRef.current = true;
            cardFieldsRef.current = cf;
            usedFields = true;
            setCardMode("fields");

            // Capture ref values so the async callbacks close over stable nodes.
            const numEl = numberRef.current;
            const expEl = expiryRef.current;
            const cvvEl = cvvRef.current;
            // Read locale once from latest.current so locale is NOT a dep.
            const loc = latest.current.locale;

            // Fire all three renders concurrently. Each resolves when the PayPal
            // SDK has injected its iframe into the target element.
            Promise.all([
              cf.NumberField({ placeholder: loc === "nl" ? "Kaartnummer" : "Card number" }).render(numEl),
              cf.ExpiryField({ placeholder: "MM/JJ" }).render(expEl),
              cf.CVVField({ placeholder: "CVC" }).render(cvvEl)
            ]).then(() => {
              // CANCELLABLE: if the effect was cleaned up while awaiting the SDK,
              // immediately tear down whatever the SDK injected.
              if (cancelled) teardownCard();
            }).catch(() => {
              if (!cancelled) setLocalError(
                latest.current.locale === "nl"
                  ? "Kaartinvoer kon niet worden geladen."
                  : "Could not load card input."
              );
            });
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
    // locale intentionally omitted: read via latest.current to avoid
    // churning mount/teardown on every locale change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready]);

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
    setLocalError("");
    setBusy(true);
    // PayPal collects/validates the billing address it needs during submit; we
    // do not duplicate an address form on our side.
    cardFieldsRef.current
      .submit()
      .then(() => {
        // onApprove -> capture -> onSuccess already ran in the SDK; the modal
        // switches to its success view. Reset busy in case it stays mounted.
        setBusy(false);
      })
      .catch(() => {
        setBusy(false);
        setLocalError(
          locale === "nl"
            ? "De betaling is niet afgerond. Controleer je kaartgegevens."
            : "Payment was not completed. Check your card details."
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
          <div key={tile.key} className={styles.tileGroup}>
            <button
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

            {/* Inline card fields rendered INSIDE the tile group, directly under
                the Creditcard tile. This eliminates the misplacement: the
                cardArea was previously a sibling after the entire tile list,
                causing it to always appear below the PayPal tile. Column flex
                on .methods makes this flow naturally between tiles. */}
            {tile.key === "card" && selected === "card" ? (
              <div className={`${styles.cardArea} ${cardMode === "button" ? styles.hidden : ""}`}>
                <div className={styles.cardField} ref={numberRef} />
                <div className={styles.cardRow}>
                  <div className={styles.cardField} ref={expiryRef} />
                  <div className={styles.cardField} ref={cvvRef} />
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

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
