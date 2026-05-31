# Vercel Deployment Guide — Kentekenrapport

This app is a Next.js 14 (App Router) project. It deploys to Vercel with zero custom
build configuration — Vercel auto-detects Next.js. The only required setup is the
environment variables and an external MongoDB.

## 1. Prerequisites

- A **MongoDB** instance reachable from Vercel (MongoDB Atlas recommended).
- An **Anthropic API key** (for the AI report/valuation).
- A **PayPal** REST app (Client ID + Secret) if you want paid reports.
- *(Optional)* A **Resend** API key for e-mailing reports.

## 2. Import the project

1. Push this branch to GitHub.
2. In Vercel: **Add New… → Project → Import** the `taxionspot/rdwdata` repo.
3. Framework preset: **Next.js** (auto-detected). Build command, output dir, and
   install command can all stay at their defaults.
4. Region is pinned to **Frankfurt (`fra1`)** via `vercel.json` — closest to the
   Dutch audience, RDW, and an EU MongoDB. Change it there if your DB lives elsewhere.

## 3. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production +
Preview). Mirror them into a local `.env.local` for local runs.

### Required

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Atlas SRV string, e.g. `mongodb+srv://user:pass@cluster.mongodb.net/plateintel` |
| `MONGODB_DB_NAME` | `plateintel` (or your DB name) |
| `ANTHROPIC_API_KEY` | Server-side only. Without it the app falls back to a non-AI report. |
| `ADMIN_SESSION_SECRET` | Long random string (e.g. `openssl rand -hex 32`) |
| `USER_SESSION_SECRET` | Long random string, different from the admin one |

> **Atlas + SRV note:** the SRV (`mongodb+srv://`) scheme needs a DNS SRV lookup at
> runtime. The code already sets public DNS resolvers (`MONGO_DNS_SERVERS`, default
> `8.8.8.8,8.8.4.4`) to make this reliable on serverless. If you ever see DNS/SRV
> errors in the function logs, set `MONGODB_URI_DIRECT` to the non-SRV
> (`mongodb://host1,host2,...`) connection string — it takes priority over `MONGODB_URI`.

### Recommended

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | Your production URL, e.g. `https://kentekenrapport.vercel.app` |
| `NEXT_PUBLIC_PLATFORM_NAME` | Display name, default `Kentekenrapport` |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-4-6` |
| `RDW_BASE_URL` | Default `https://opendata.rdw.nl/resource` (no key needed) |

### Payments (PayPal) — needed only if `paymentEnabled` is on

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Client-side SDK client ID |
| `PAYPAL_CLIENT_ID` | Server-side client ID |
| `PAYPAL_CLIENT_SECRET` | Server-side secret |
| `PAYPAL_BASE_URL` | `https://api-m.sandbox.paypal.com` (sandbox) or `https://api-m.paypal.com` (live) |

### Optional

| Variable | Notes |
|---|---|
| `RESEND_API_KEY` | Enables e-mail delivery of reports. Omitted → e-mail is skipped gracefully. |
| `REPORT_EMAIL_FROM` | e.g. `Kentekenrapport <noreply@yourdomain.nl>` |
| `NEXT_PUBLIC_IMAGIN_CUSTOMER_KEY` | IMAGIN.studio key for vehicle images |
| `NEXT_PUBLIC_ENABLE_DEMO_SKIP_PAYMENT` | `true` to bypass the paywall in production (demo only) |

## 4. Payment gating behaviour

In `app/api/vehicle/[plate]/route.ts`, report downloads are free when **either**:

- `NODE_ENV !== "production"` (so local/preview are always open), **or**
- `NEXT_PUBLIC_ENABLE_DEMO_SKIP_PAYMENT === "true"`.

In production with that flag unset, a report download/e-mail requires a `COMPLETED`
PayPal payment for that plate. Toggle the paywall and price from the admin panel
(`/admin` → settings), which writes to the `SiteSettings` document.

## 5. First-run admin

There is no seeded admin. After the first deploy, create one via `/admin/signup`
(or the `POST /api/admin/signup` endpoint). Then sign in at `/admin/login`.

## 6. Notes on serverless compatibility

- **PDF generation** uses `pdf-lib` (pure JS, in-memory) — no Chromium/Puppeteer,
  so it works on Vercel functions out of the box.
- **Vehicle images** from `cdn.imagin.studio` are rendered with `unoptimized`, and
  the host is also whitelisted in `next.config.mjs` for the Next image optimizer.
- **Heavy routes** (`/api/vehicle/[plate]`, `/api/vehicle/compare`,
  `/api/vehicle/[plate]/negotiation-copilot`) declare `maxDuration = 60` to give the
  RDW fan-out + Claude + PDF pipeline enough headroom. The Hobby plan allows up to
  60s; Pro allows more if you raise it.
- **DB-backed public pages** (`/privacy-policy`, `/terms-and-conditions`, `/p/[slug]`,
  `GET /api/pages`) are `force-dynamic` and fall back to the built-in legal templates
  in `lib/cms/legal-pages.ts` if the database is briefly unavailable — so the build
  never needs a database and these pages never hard-fail.

## 7. Local production build check

```bash
npm install
npm run build      # must succeed without any database connection
npm start          # serve the production build locally
```
