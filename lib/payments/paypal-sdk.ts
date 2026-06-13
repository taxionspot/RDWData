export type PayPalButtonsConfig = {
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError: (error: unknown) => void;
};

export type ApplePaySdkConfig = {
  isEligible: boolean;
  countryCode: string;
  currencyCode: string;
  merchantCapabilities: string[];
  supportedNetworks: string[];
};

export type ApplePayPaymentRequest = {
  countryCode: string;
  currencyCode: string;
  merchantCapabilities: string[];
  supportedNetworks: string[];
  requiredBillingContactFields?: string[];
  total: { label: string; amount: string; type?: "final" };
};

export interface ApplePaySessionInstance {
  begin(): void;
  abort(): void;
  completeMerchantValidation(merchantSession: unknown): void;
  completePayment(status: number): void;
  onvalidatemerchant: ((event: { validationURL: string }) => void) | null;
  onpaymentauthorized: ((event: { payment: { token: unknown; billingContact?: unknown } }) => void) | null;
  oncancel: ((event: unknown) => void) | null;
}

export interface ApplePaySessionConstructor {
  new (version: number, request: ApplePayPaymentRequest): ApplePaySessionInstance;
  canMakePayments(): boolean;
  supportsVersion(version: number): boolean;
  readonly STATUS_SUCCESS: number;
  readonly STATUS_FAILURE: number;
}

export type GooglePaySdkConfig = {
  isEligible: boolean;
  apiVersion: number;
  apiVersionMinor: number;
  countryCode?: string;
  allowedPaymentMethods: Array<Record<string, unknown>>;
  merchantInfo: Record<string, unknown>;
};

export interface GooglePaymentsClient {
  isReadyToPay(request: Record<string, unknown>): Promise<{ result: boolean }>;
  createButton(options: {
    onClick: () => void;
    buttonType?: string;
    buttonSizeMode?: string;
    buttonLocale?: string;
  }): HTMLElement;
  loadPaymentData(request: Record<string, unknown>): Promise<{ paymentMethodData: Record<string, unknown> }>;
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: PayPalButtonsConfig) => {
        render: (selectorOrElement: string | HTMLElement) => Promise<void>;
        close: () => void;
      };
      Applepay?: () => {
        config: () => Promise<ApplePaySdkConfig>;
        validateMerchant: (args: { validationUrl: string; displayName?: string }) => Promise<{ merchantSession: unknown }>;
        confirmOrder: (args: { orderId: string; token: unknown; billingContact?: unknown }) => Promise<void>;
      };
      Googlepay?: () => {
        config: () => Promise<GooglePaySdkConfig>;
        confirmOrder: (args: { orderId: string; paymentMethodData: Record<string, unknown> }) => Promise<{ status: string }>;
        initiatePayerAction: (args: { orderId: string }) => Promise<void>;
      };
    };
    ApplePaySession?: ApplePaySessionConstructor;
    google?: {
      payments?: {
        api?: {
          PaymentsClient: new (options: Record<string, unknown>) => GooglePaymentsClient;
        };
      };
    };
  }
}

const PAYPAL_SCRIPT_ID = "paypal-js-sdk";
const GOOGLE_PAY_SCRIPT_ID = "google-pay-js";

let paypalSdkPromise: Promise<void> | null = null;
let googlePayJsPromise: Promise<void> | null = null;

function appendScript(args: { id: string; src: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(args.id) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`PAYPAL_LOAD_ERROR: failed to load ${args.src}`)));
      return;
    }
    const script = document.createElement("script");
    script.id = args.id;
    script.src = args.src;
    script.async = true;
    // Payment is strictly necessary; keep Cookiebot auto-blocking from breaking checkout.
    script.setAttribute("data-cookieconsent", "ignore");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`PAYPAL_LOAD_ERROR: failed to load ${args.src}`));
    document.body.appendChild(script);
  });
}

export function loadPaypalSdk(currency: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.paypal) return Promise.resolve();
  if (paypalSdkPromise) return paypalSdkPromise;

  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";
  if (!clientId) return Promise.reject(new Error("PAYPAL_CONFIG_ERROR: missing client id"));

  const params = new URLSearchParams({
    "client-id": clientId,
    currency,
    components: "buttons,card-fields,applepay,googlepay",
    "enable-funding": "ideal,card"
  });
  paypalSdkPromise = appendScript({
    id: PAYPAL_SCRIPT_ID,
    src: `https://www.paypal.com/sdk/js?${params.toString()}`
  }).catch((error) => {
    paypalSdkPromise = null;
    throw error;
  });
  return paypalSdkPromise;
}

export function loadGooglePayJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.payments?.api) return Promise.resolve();
  if (googlePayJsPromise) return googlePayJsPromise;
  googlePayJsPromise = appendScript({
    id: GOOGLE_PAY_SCRIPT_ID,
    src: "https://pay.google.com/gp/p/js/pay.js"
  }).catch((error) => {
    googlePayJsPromise = null;
    throw error;
  });
  return googlePayJsPromise;
}

export function getGooglePayEnvironment(): "TEST" | "PRODUCTION" {
  return process.env.NEXT_PUBLIC_PAYPAL_ENV === "sandbox" ? "TEST" : "PRODUCTION";
}
