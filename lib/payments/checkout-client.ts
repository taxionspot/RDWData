import { trackPurchase } from "@/lib/analytics/gtm";

export async function createOrderForPlate(args: { plate: string; email?: string }): Promise<string> {
  const response = await fetch("/api/payments/paypal/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plate: args.plate, email: args.email })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Unable to create PayPal order.");
  }

  const order = (await response.json()) as { id?: string };
  if (!order.id) throw new Error("PayPal order id missing.");
  return order.id;
}

/**
 * Start an iDEAL payment. Returns the PayPal "payer-action" URL the browser
 * must be redirected to for the bank-selection step; fulfilment happens on the
 * return URL + webhook, not here.
 */
export async function createIdealOrderForPlate(args: {
  plate: string;
  email?: string;
}): Promise<string> {
  const response = await fetch("/api/payments/paypal/create-ideal-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plate: args.plate, email: args.email })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Unable to start iDEAL payment.");
  }

  const data = (await response.json()) as { redirect?: string };
  if (!data.redirect) throw new Error("iDEAL redirect URL missing.");
  return data.redirect;
}

export async function captureOrderForPlate(args: {
  orderId: string;
  plate: string;
  email?: string;
  locale: "nl" | "en";
}): Promise<{ orderId: string; amount: string; currency: string }> {
  const response = await fetch("/api/payments/paypal/capture-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: args.orderId, plate: args.plate, email: args.email, lang: args.locale })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Unable to capture payment.");
  }

  const result = (await response.json().catch(() => ({}))) as {
    orderId?: string;
    amount?: string;
    currency?: string;
  };
  const captured = {
    orderId: result.orderId ?? args.orderId,
    amount: result.amount ?? "0",
    currency: result.currency ?? "EUR"
  };

  const value = Number.parseFloat(captured.amount);
  trackPurchase({
    transactionId: captured.orderId,
    plate: args.plate,
    value: Number.isFinite(value) ? value : 0,
    currency: captured.currency
  });

  return captured;
}
