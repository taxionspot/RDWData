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
      "Content-Type": "application/json",
      // Guarantee a full representation so the capture response includes
      // purchase_units[].custom_id and payments.captures[].amount, which the
      // server-side plate/amount verification depends on. Without this PayPal
      // may return a minimal body and reject already-paid orders.
      Prefer: "return=representation"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal order capture failed (${response.status}): ${details}`);
  }

  return response.json();
}
