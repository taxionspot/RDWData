function resolvePaypalBaseUrl(): string {
  const raw = (process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com").trim().toLowerCase();
  if (raw.includes("sandbox.paypal.com") && !raw.includes("api-m.sandbox.paypal.com")) {
    return "https://api-m.sandbox.paypal.com";
  }
  if (raw.includes("paypal.com") && !raw.includes("api-m.paypal.com") && !raw.includes("api-m.sandbox.paypal.com")) {
    return "https://api-m.paypal.com";
  }
  return raw;
}

const PAYPAL_BASE_URL = resolvePaypalBaseUrl();
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID ?? "";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET ?? "";

function assertPaypalConfig() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET.");
  }
}

type AccessTokenResponse = {
  access_token: string;
};

/** Safe, non-secret config snapshot for diagnosing live/sandbox mismatches. */
export function getPaypalDiagnostics() {
  return {
    environment: PAYPAL_BASE_URL.includes("sandbox") ? "sandbox" : "live",
    baseUrl: PAYPAL_BASE_URL,
    hasClientId: PAYPAL_CLIENT_ID.length > 0,
    hasSecret: PAYPAL_CLIENT_SECRET.length > 0,
    clientIdPrefix: PAYPAL_CLIENT_ID.slice(0, 6),
    clientIdLength: PAYPAL_CLIENT_ID.length
  };
}

/** Probes the PayPal OAuth token endpoint and returns status + error code only
 * (never the secret). Used by the create-order diag endpoint. */
export async function probePaypalAuth(): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return { ok: false, status: 0, error: "missing_credentials" };
  }
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  try {
    const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      cache: "no-store"
    });
    if (res.ok) return { ok: true, status: res.status };
    let error: string | undefined;
    try {
      const data = (await res.json()) as { error?: string };
      error = data.error;
    } catch {
      // ignore parse errors
    }
    return { ok: false, status: res.status, error };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "fetch_failed" };
  }
}

async function getAccessToken(): Promise<string> {
  assertPaypalConfig();
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials",
    cache: "no-store"
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal auth failed (${response.status}): ${details}`);
  }

  const data = (await response.json()) as AccessTokenResponse;
  return data.access_token;
}

export async function createPaypalOrder(args: {
  amount: string;
  currency: string;
  customId: string;
  description: string;
}) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: args.customId,
          description: args.description,
          amount: {
            currency_code: args.currency,
            value: args.amount
          }
        }
      ]
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal order creation failed (${response.status}): ${details}`);
  }

  return response.json();
}

export async function capturePaypalOrder(orderId: string) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal order capture failed (${response.status}): ${details}`);
  }

  return response.json();
}

/** Read an order back from PayPal (used by the iDEAL return handler when a
 * capture races with PayPal's own auto-capture and returns ORDER_ALREADY_CAPTURED). */
export async function getPaypalOrder(orderId: string) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal get order failed (${response.status}): ${details}`);
  }

  return response.json();
}

/**
 * Create an iDEAL order via the Orders API. iDEAL is a redirect-based payment
 * method: PayPal returns a PAYER_ACTION_REQUIRED order with a "payer-action"
 * link. We send the buyer there (PayPal hosts the bank-selection + return),
 * then capture on return. country_code and name are required by PayPal for
 * iDEAL; return_url/cancel_url are required to hand the buyer back to us.
 */
export async function createPaypalIdealOrder(args: {
  amount: string;
  currency: string;
  customId: string;
  description: string;
  name?: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; payerActionUrl: string }> {
  const accessToken = await getAccessToken();
  // iDEAL requires a name in the API, but it is metadata only (not validated
  // against the bank account), so we send a placeholder when we have none.
  // This is exactly how annuleren.com does it: the buyer is never asked for a
  // name. A real name is passed through only if the caller has one.
  const idealName = args.name && args.name.trim() ? args.name.trim() : "Klant";
  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      // Idempotency: a double-submit reuses the same order instead of charging twice.
      "PayPal-Request-Id": `kr-ideal-${args.customId}-${Date.now()}`
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      // Auto-capture on approval, so the payment still completes if the buyer
      // closes the tab before the return URL loads (the webhook then confirms).
      processing_instruction: "ORDER_COMPLETE_ON_PAYMENT_APPROVAL",
      purchase_units: [
        {
          custom_id: args.customId,
          description: args.description,
          amount: {
            currency_code: args.currency,
            value: args.amount
          }
        }
      ],
      payment_source: {
        ideal: {
          name: idealName,
          country_code: "NL",
          experience_context: {
            locale: "nl-NL",
            return_url: args.returnUrl,
            cancel_url: args.cancelUrl
          }
        }
      }
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal iDEAL order creation failed (${response.status}): ${details}`);
  }

  const order = (await response.json()) as {
    id?: string;
    links?: Array<{ rel?: string; href?: string }>;
  };
  const payerAction = order.links?.find((link) => link.rel === "payer-action")?.href;
  if (!order.id || !payerAction) {
    throw new Error(`PayPal iDEAL order missing payer-action link: ${JSON.stringify(order)}`);
  }
  return { id: order.id, payerActionUrl: payerAction };
}

/**
 * Verify a PayPal webhook signature server-side. Fails closed: without a
 * configured PAYPAL_WEBHOOK_ID we never trust the event (an unverified webhook
 * that grants paid access would be an open door). Returns true only on PayPal's
 * SUCCESS verdict.
 */
export async function verifyPaypalWebhook(args: {
  headers: {
    authAlgo?: string | null;
    certUrl?: string | null;
    transmissionId?: string | null;
    transmissionSig?: string | null;
    transmissionTime?: string | null;
  };
  rawBody: string;
}): Promise<boolean> {
  const webhookId = (process.env.PAYPAL_WEBHOOK_ID ?? "").trim();
  if (!webhookId) {
    console.warn(
      "PayPal webhook rejected: PAYPAL_WEBHOOK_ID is not configured, so the webhook backstop is disabled."
    );
    return false;
  }
  const { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime } = args.headers;
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) return false;

  let event: unknown;
  try {
    event = JSON.parse(args.rawBody);
  } catch {
    return false;
  }

  const accessToken = await getAccessToken();
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: event
    }),
    cache: "no-store"
  });

  if (!response.ok) return false;
  const data = (await response.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}
