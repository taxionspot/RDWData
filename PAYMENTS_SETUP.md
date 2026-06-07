# Payments and environment setup

This document lists what to configure for payments to work in production. Set all
values as **Vercel Environment Variables** (Project Settings -> Environment
Variables). Never commit secrets to the repository.

## 1. Environment variables

### PayPal (iDEAL, card, and PayPal funding)
| Variable | Where | Notes |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | Server | Your PayPal app Client ID. |
| `PAYPAL_CLIENT_SECRET` | Server (secret) | Your PayPal app Secret. Keep private. |
| `PAYPAL_BASE_URL` | Server | `https://api-m.paypal.com` for live, `https://api-m.sandbox.paypal.com` for sandbox. Defaults to sandbox if unset. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Client | Same Client ID as above; needed in the browser to load the PayPal SDK. |
| `NEXT_PUBLIC_PAYPAL_ENV` | Client | `live` in production, otherwise treated as sandbox. Drives the Google Pay environment (PRODUCTION vs TEST). |

> Security: the Client ID and Secret were shared in a document. Set them in
> Vercel and, because the secret was shared, rotate it in the PayPal dashboard
> (Apps & Credentials -> your app -> Generate new secret) once configured.

### AI report
| Variable | Where | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Server (secret) | Anthropic API key. |
| `ANTHROPIC_MODEL` | Server | Optional. Defaults to `claude-opus-4-8`. |

### Database
| Variable | Where | Notes |
| --- | --- | --- |
| `MONGODB_URI` | Server (secret) | MongoDB connection string. |
| `MONGODB_DB_NAME` | Server | Optional database name. |

### Optional / must stay OFF in production
| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_ENABLE_DEMO_SKIP_PAYMENT` | Demo only. Must be unset/false in production or reports become free. |
| `PAYMENT_DEMO_BYPASS` | Demo only. Must be unset/false in production. |
| `NEXT_PUBLIC_IMAGIN_CUSTOMER_KEY` | Optional, for higher-quality vehicle images. |
| `ANTHROPIC_DEBUG` | Optional debug logging (non-production only). |

## 2. Apple Pay domain verification

The PayPal-provided domain association file is committed at:

```
public/.well-known/apple-developer-merchantid-domain-association
```

It is served at:

```
https://kentekenrapport.com/.well-known/apple-developer-merchantid-domain-association
```

In the PayPal dashboard, register the domain `kentekenrapport.com` for Apple Pay.
PayPal verifies ownership by fetching that file. Re-host the latest file if PayPal
issues a new one.

## 3. Payment methods status

The checkout now renders a **method chooser**: separate buttons for **PayPal**,
**iDEAL**, **credit/debit card** and **Bancontact** (each shown only when the
PayPal account marks it eligible), plus **Google Pay** and **Apple Pay** via
PayPal's wallet components. Each method uses the same create-order / capture-order
flow, and any method that is not eligible is hidden automatically (it never
breaks the others).

To get every method live you must, on the **PayPal business account**:
1. Enable iDEAL, Bancontact and advanced card processing (Alternative Payment
   Methods) for your account/region.
2. Enable **Google Pay** and **Apple Pay** (Pay with wallets). Apple Pay also
   requires the domain verification in section 2.
3. Set `NEXT_PUBLIC_PAYPAL_ENV=live` in production so Google Pay runs in
   PRODUCTION mode.

Notes:
- Apple Pay only appears on Apple devices/browsers (Safari) that support it.
- Google Pay only appears on supported browsers/devices and eligible accounts.
- If a wallet is not yet approved on the account it simply will not render; the
  PayPal / iDEAL / card buttons keep working.

## 4. Webhooks

The integration captures the payment **synchronously** on return from PayPal
(create-order -> buyer approves -> capture-order grants access for the plate via
`custom_id = "plate:<PLATE>"`). A webhook is therefore **not required** for the
basic flow to work.

If you want webhook-based reconciliation (recommended for reliability, e.g. if
the buyer closes the tab right after approving), add a webhook in the PayPal
dashboard:

- **URL:** `https://kentekenrapport.com/api/payments/paypal/webhook`
- **Events:**
  - `PAYMENT.CAPTURE.COMPLETED`
  - `PAYMENT.CAPTURE.DENIED`
  - `PAYMENT.CAPTURE.REFUNDED`
  - `CHECKOUT.ORDER.APPROVED`

> Note: that webhook endpoint is not implemented yet. When you want it, it can be
> added together with a `PAYPAL_WEBHOOK_ID` env var for signature verification.
