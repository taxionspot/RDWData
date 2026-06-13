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
