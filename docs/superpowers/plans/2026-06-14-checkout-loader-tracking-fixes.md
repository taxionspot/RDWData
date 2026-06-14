# Checkout/loader/tracking fixes , root-cause + plan (owner feedback)

Branch: feature/checkout-loader-tracking. Bron: 4-lezer-mapping wi9z846ax.

Confirmed against source. The `fulfill.ts` line numbers shifted slightly from the map (the `if (email)` guard is at line 115, thank-you send at 130, `weFulfilled` block 111-136) but the structure matches exactly. Here is the consolidated plan.

# Kentekenrapport — Geconsolideerd root-cause + fix-plan (4 live issues)

Root: `C:\Users\Sabur\sites\kentekenrapport`. Stack: Next.js 14 App Router, MongoDB/Mongoose, Vercel, PayPal-only (kaart/iDEAL/Apple Pay/Google Pay). Single fulfilment choke point = `lib/payments/fulfill.ts:fulfillFromCapture`. Single purchase-tracking helper = `lib/analytics/gtm.ts:trackPurchase`. StrictMode aan (`next.config.mjs:3`).

---

## A. Paid-but-no-email (URGENT)

### Root cause (3 stacked causes, in order of likelihood)

1. **CODE BUG — silent skip on empty email.** `fulfillFromCapture` only sends when an email exists: guard `if (email)` at `lib/payments/fulfill.ts:115`, send at `:130`. The email is an **optional, ungated field** in `components/ui/SubscriptionModal.tsx:191-200` (no `required`, no gate on the pay buttons), so a buyer can pay with `email=""`. Empty email -> `captureOrderForPlate({email:""})` -> guard false -> nothing sent, yet fulfilment returns `ok:true` (access granted, buyer silent). This is the most probable cause of the owner's report.

2. **CODE BUG — even WITH an email, only a link-only thank-you is ever sent, never the report PDF.** `fulfill.ts:122-130` calls `buildThankYouEmail` (`lib/email/templates.ts:41-50`), which contains only a link to `/search/{plate}` — no PDF. The actual PDF email (`sendReportEmail`, `app/api/vehicle/[plate]/route.ts:322`, built `:446-511`) is wired **exclusively** to the manual on-page download button (`VehicleResultScreen.tsx:358-682`); **no payment path ever calls it.** So "paid, no report" is partly literal: the report PDF email path does not exist post-payment.

3. **CODE BUG — iDEAL/webhook never forward the email.** `ideal-return/route.ts:37` and `webhook/route.ts:112` call `fulfillFromCapture` with **no `email` arg**. The async paths can only recover email from a PENDING row (`fulfill.ts:83` reads `prior.email`), and only `create-ideal-order/route.ts:53-71` writes one. The synchronous card/wallet path writes **no PENDING row** (`create-order` does not), so `fulfill.ts:84-108` takes the "no record" branch and email must come from the request body — empty per cause 1.

4. **CONFIG dependency (latent + diagnostics).**
   - **`PAYPAL_WEBHOOK_ID`**: if unset, `verifyPaypalWebhook` returns `false` (`lib/payments/paypal.ts:262-268`) -> webhook 403s (`webhook/route.ts:71-73`) -> backstop disabled. Not in any "env set" note in CLAUDE.md -> almost certainly unset. Doesn't break card (synchronous), but removes the iDEAL closed-tab safety net.
   - **`GMAIL_USER` / `GMAIL_APP_PASSWORD`**: send failures are swallowed. `sendEmail` returns `{delivered:false,reason}` (`lib/email/resend.ts:38,69-72`) and `fulfill.ts:131-133` discards the reason in an empty `catch {}`. CLAUDE.md flags the Gmail app password was leaked in chat and must be rotated — a rotation invalidates the old value, so every send becomes a silent `delivered:false`. Plausible compounding cause; zero diagnostics today.

### Exact fix (every path reliably emails the report, with link, idempotent)

1. **Make email mandatory before pay** — `SubscriptionModal.tsx:191-221`: gate `CheckoutMethods` + Apple/Google buttons behind `^[^\s@]+@[^\s@]+\.[^\s@]+$`; don't render pay buttons until valid. Kills cause 1 at source.
2. **Write a PENDING row in `create-order`** — mirror `create-ideal-order/route.ts:53-71`, storing `{email, plate}`. Then `fulfill.ts:83` recovers email for card/wallet too, and the webhook gets it for free. Kills cause 3.
3. **Send the report (with link), idempotently** — in `fulfill.ts`, inside the `weFulfilled` block (`:111-136`, runs exactly once per order by the atomic `findOneAndUpdate`). Keep `buildThankYouEmail` (link to `/search/{plate}`) as the **guaranteed, fast** mail. Optionally attach the PDF by extracting `buildLocalizedWithAi` + `generateVehicleReportPdf` + `generateVehicleReportHtml` (from `app/api/vehicle/[plate]/route.ts:446-511`) into a shared `lib/api/report-email.ts`, wrapped in try/catch + timeout so a slow Apify/Claude call never blocks capture; fall back to link-only on failure. The link-only mail must always go out so "paid -> report link in inbox" holds on every path.
4. **Forward email through async paths** — pass `email` explicitly where available in `ideal-return/route.ts:37` and `webhook/route.ts:112`; rely on the PENDING-row recovery (step 2) as primary.
5. **Stop swallowing failures** — `fulfill.ts:130`: capture `SendEmailResult.reason`, `console.error` it, and persist `emailDelivered`/`emailReason` on `PlatePayment`. Verify `GMAIL_USER`+`GMAIL_APP_PASSWORD` are set and current post-rotation (CONFIG).
6. **Set `PAYPAL_WEBHOOK_ID`** in Vercel + register the webhook in PayPal (CONFIG) to re-enable the backstop.
7. **Reconciliation resend** — admin action or cron finding `PlatePayment{status:COMPLETED, email set, emailDelivered:false}` and retrying. Self-heals transient SMTP.

Idempotency is already guaranteed: only the atomic `weFulfilled` winner runs side effects (`fulfill.ts:74-113`), so adding the report send inside that block sends exactly once even when iDEAL-return and webhook race.

---

## B. Creditcard double / misplaced fields

### Root cause
Card fields mount in exactly one place: `components/payments/CheckoutMethods.tsx` (repo-wide grep confirms; other hits are unrelated annuleren/fristlos PHP). Not two renderers — one component, two distinct bugs.

- **Misplacement.** JSX order is fixed regardless of selection: tiles list `methods` (built `:306-311`, rendered `:319-342`) with PayPal last (index 5, after Creditcard index 4), then the `cardArea` block (`:345-353`) as a **sibling after the whole tile list**. So `#kr-card-number/expiry/cvv` always render below PayPal, not under the selected Creditcard tile.
- **Doubling.** StrictMode (`next.config.mjs:3`) double-invokes the selection effect (`:175-254`). `CardFields.render()` is async fire-and-forget (`:235-237`) — the iframe lands *after* the synchronous `clearCardEls()` (`:187` cleanup, `:234` pre-render), so the clear hits an empty container and both run-A and run-B iframes inject into the same `#kr-card-number` -> stacked iframes. The cleanup only `el.innerHTML=""` + nulls `cardFieldsRef.current` (`:185`); it never `.close()`s the CardFields instance and can't catch in-flight async renders. The prior clear-based fix (CSS comment `:115`, code comments `:186/:234`) is a no-op against this async/StrictMode race. Secondary: `render("#kr-card-number")` resolves via `getElementById` while React tears down/recreates the conditionally-mounted `cardArea` (`:345`).

### Fix (mount once, under the selected tile)
1. **Placement** — emit the card-fields block inside the `tiles.map` (`:320-341`) immediately after the Creditcard `<button>` when `tile.key==="card" && selected==="card"`; remove the standalone `cardArea` (`:345-353`). Column flex flows it naturally under the tile, above PayPal.
2. **Mount into ref-held nodes** — `useRef<HTMLDivElement>` per field; `cf.NumberField(...).render(numberRef.current!)` with the element, not `"#kr-card-number"`. Removes the `getElementById` race.
3. **Once-guard** — `const cardMountedRef = useRef(false)`; at top of the card branch `if (cardMountedRef.current) return;` set true before render, reset in cleanup. Neutralises StrictMode double-invoke.
4. **Cancellable async** — `let cancelled=false` captured by cleanup; after `await Promise.all([...renders])`, if `cancelled` tear down immediately (clear nodes + drop instance).
5. **Real teardown** — in cleanup (`:176-188`) clear the ref nodes' `innerHTML`, drop the instance, call `.close()` if the SDK exposes it.
6. **Trim deps** — drop `locale` from `[selected, ready, locale]` (`:254`); read it from the `latest` ref (only feeds placeholder text `:235`) to stop mount/teardown churn on locale change.

Localized entirely to `CheckoutMethods.tsx`; no change to `paypal-sdk.ts`, `checkout-client.ts`, `SubscriptionModal.tsx`. Lowest-risk minimal patch = steps 3+4 (stop doubling) + step 1 (placement); both small and independent.

**Verify** (per CLAUDE.md): `next build`+`next start`, headless Chromium 1380px + 390px, log pageerror/console. Assert: selecting Creditcard yields exactly **3** iframes (one each in `#kr-card-number/expiry/cvv`), card block sits between Creditcard tile and PayPal in DOM order, and Creditcard->PayPal->Creditcard toggling never increases the iframe count.

---

## C. Loader / AI-timing redesign

### Current timing (why the wait happens)
AI text (summary/positives/risks/recommendation + valuation factors) is generated **only on the first `include_ai=1` request that has access — i.e. AFTER payment.**
- Lookup starts AI-free: `app/page.tsx:82` -> `app/search/[plate]/page.tsx:8` (`FullReportScreen`) -> `useVehicleLookup` (`hooks/useVehicleLookup.ts:14`) hits the vehicle API without `include_ai` -> free branch (`route.ts:351-367`, RDW+enriched+signals, no Claude).
- AI fetch fires on `AiAnalysisScreen` mount (`useAiReport`, `hooks/useAiReport.ts:39`) but the server **gates it**: `hasPaidPlateAccess` (`route.ts:414`) false -> returns `aiInsights:null` **without calling Claude** (`:414-427`, deliberate cost-saving).
- The real Claude call fires on the **post-unlock refetch**: payment -> `grantPaidAccessForPlate` (`SubscriptionModal.tsx:96`) -> `onPlateAccessChanged` -> `useAiReport.ts:72-83` deletes the empty cache + refetches -> paid branch (`route.ts:431`) -> `buildLocalizedWithAi` (`:240`) -> cache-miss -> `generateVehicleAiReport` (`route.ts:279`, Anthropic `lib/api/claude.ts:272-305`, up to 2 passes, `max_tokens:1800`). That live generation = the spinner the owner stares at (`AiAnalysisScreen.tsx:62-67`).
- It only hurts the **first buyer per plate/locale/km-bucket per week**; later buyers hit the cache (`route.ts:259`) and unlock is instant. The owner testing a fresh plate is exactly the first buyer.

### Cost model (why AI is gated behind payment)
Cache key `v3|plate|locale|bucket` (`route.ts:205-210`, bucket = `round(km/5000)*5000`), TTL 7 days (`route.ts:198`, Mongo TTL index `models/AiReportCache.ts:22`). One Claude call serves everyone for a week. Hard rule (CLAUDE.md): **never per-visitor Claude calls.** The post-payment gate is deliberate: a never-paying visitor costs €0.

### Recommended redesign (everything ready up front, unlock instant, no live-text-building)
1. **Prewarm endpoint** — new `POST /api/vehicle/[plate]/prewarm-ai` that runs `buildLocalizedWithAi(plate, locale, userMileage)` (`route.ts:240`) **skipping the `hasPaidPlateAccess` gate**, writes **only** to `AiReportCache`, and returns `{ok:true}` — never the AI content (else premium leaks free). Idempotent: if `readAiCache(key)` already hits, do nothing. Reuses the 7d cache + km-bucket 1:1.
2. **Trigger on checkout-open (high-intent) — RECOMMENDED.** Fire the prewarm fire-and-forget when the buyer opens the pay modal (`setShowPayment(true)` via `PageUnlockContext`, `FullReportScreen.tsx:206/246/316`). The Claude call overlaps PayPal-SDK load + iDEAL bank choice + redirect (often 10-30s), hiding the latency. Optionally also prewarm the sample plate on the loader (already free-unlocked, keeps it cache-warm, gratis-ish).
3. **Post-payment refetch -> short poll** — `useAiReport.ts:72-83`: cache-hit = instant; if the buyer paid faster than Claude, keep the existing spinner (`AiAnalysisScreen.tsx:62-67`) and poll (~1.5s, max ~20s) until the prewarm cache lands. Never show the live-build. Keep `buildFallbackVehicleAiReport` (`route.ts:295`, `claude.ts:495`) for real Claude failures only, not "still busy" (prevents fallback->real flicker).
4. **Free data is already up front** — RDW/enriched/comparables/signals load pre-payment (`route.ts:351`; `warmComparableCache` overlaps the ~3.5s `ScanIntro`, `FullReportScreen.tsx:128-134`). Premium values are a field-strip (`redactPremiumValue`, `route.ts:366/421`), not generation, so instant after unlock. **AI text is the only post-payment generation latency.**

### Cost tradeoff + mitigation
- **(a) Prewarm on every lookup**: zero wait, but pays Claude for ~90%+ who never buy -> **breaks the no-per-visitor rule.** Avoid unless plate-repeat ratio is very high.
- **(b) Hold loader until AI done**: simple but delays the free funnel (bad for conversion) and still pays per visitor. Avoid.
- **(c) Prewarm on checkout-open** *(recommended)*: only high-intent openers, a small fraction of lookups -> cost stays near the current per-buyer level (now per *buyer*, then per *checkout-opener*, marginally more), wait essentially gone. The 7d cache + 5.000-km buckets collapse repeated opens on the same plate to one call.

**Recommendation: (c) as primary**, optionally (a) **only for the sample plate**. Respects "nooit per-bezoeker Claude-calls."

---

## D. Conversion tracking (event-based, no thank-you page)

### Current state — `purchase` per path
One helper, correctly GA4-shaped: `lib/analytics/gtm.ts:38-55` (`trackPurchase` pushes `ecommerce:null` reset then `event:"purchase"` with `transaction_id`=PayPal order id, `value`, `currency`, `items`). One call site: `lib/payments/checkout-client.ts:74`, inside `captureOrderForPlate` after server-confirmed capture.

| Path | Fires `purchase`? | Pin |
|---|---|---|
| Card inline (CardFields) | YES | `CheckoutMethods.tsx:102` -> `checkout-client.ts:74` |
| PayPal button | YES | `CheckoutMethods.tsx:100-104` |
| Apple Pay | YES | `ApplePayButton.tsx:76` -> `checkout-client.ts:74` |
| Google Pay | YES | `GooglePayButton.tsx:100` -> `checkout-client.ts:74` |
| **iDEAL (redirect-return)** | **NO — MISSING** | see below |

**iDEAL gap (root cause):** iDEAL never calls `captureOrderForPlate`. `payIdeal()` (`CheckoutMethods.tsx:256-272`) does `window.location.href = redirect` (`:261`) — buyer leaves; no in-modal success handler runs. Server captures in `ideal-return/route.ts`, then 303-redirects to `/search/[plate]?paid=1` (`:63`). The landing `FullReportScreen` reads `searchParams` only for `mileage`/`compare` (`:196-197`) and fires `report_viewed` (`:143`); **nothing reads `?paid=1`, `trackPurchase` is never imported/called there.** On a Dutch site iDEAL is typically dominant -> the bulk of untracked conversions. The parallel `track("payment_success")` funnel also never runs for iDEAL.

### GTM + consent (already wired, just starved on iDEAL)
GTM `GTM-N4TS8CP9` (`lib/analytics/config.ts:1`, injected `app/layout.tsx:28-32,86`). Cookiebot cbid `c95277a4-b000-4684-910e-1490969d79b1` (`config.ts:3-4`) before GTM (`layout.tsx:79-84`). Consent Mode v2 defaults all-denied, `wait_for_update:500`, `ads_data_redaction:true` (`layout.tsx:13-26,76`). PayPal SDK `data-cookieconsent="ignore"` so payments never block. The dataLayer push always happens; Ads/Linker tags hold via Consent Mode until `ad_storage`/`ad_user_data` granted. Intended tag wiring documented `docs/go-live-checklist.md:156-180`.

### Fix — one `purchase` on ALL paths

**Fix A (primary, client-side on iDEAL return) — required**
1. Carry order id + amount on return: `ideal-return/route.ts:63` currently discards `result.amount`/`result.currency`; capture them and redirect `?paid=1&oid=<orderId>&amt=<amount>&cur=<currency>`. Keep the signed `PAID_COOKIE` (`:64-67`) for access.
2. Fire once on the landing: in `FullReportScreen.tsx` (already client, `useSearchParams` `:121`) add an effect that, when `paid==="1"` AND `unlocked` (`usePlateUnlocked`, `:125`), calls `trackPurchase({transactionId:oid, plate:normalized, value:parseFloat(amt)||settings.payment.amount, currency:cur||"EUR"})`, dedupes via `sessionStorage["kr_purchase_fired:"+oid]`, then `router.replace` to strip params. Reuses `gtm.ts` unchanged -> identical event shape -> existing GTM trigger picks it up, no GTM change. Optionally also `track("payment_success",{plate})` for funnel parity.
3. **Trust boundary**: gate on `unlocked && paid===1` (signed cookie), not bare `?paid=1`, so a spoofed URL can't inflate conversions.

**Fix B (backstop for closed-tab drop-off) — recommended.** If the buyer closes the tab at the bank, the webhook still fulfils (`webhook/route.ts:86-119`) but no browser exists -> no client event ever. Add a server-side conversion in the once-only `weFulfilled` block (`fulfill.ts:111-136`): either a GA4 Measurement Protocol `purchase`, or (better for Ads) capture `gclid`/`wbraid`/`gbraid` at order creation, persist on `PlatePayment`/`CheckoutLead`, and upload an Offline/Enhanced Conversion. There is **no gclid capture anywhere today** (grep: 0 hits). Dedup against Fix A by `transaction_id` (same PayPal order id) so a returning buyer isn't double-counted.

### GTM + Google Ads setup (event-based, no thank-you page) — owner steps in GTM UI
1. **Data Layer Variables**: `ecommerce.transaction_id`, `ecommerce.value`, `ecommerce.currency`.
2. **Trigger**: Custom Event, event name `purchase`.
3. **Tags**: Conversion Linker on All Pages; Google Ads Conversion Tracking tag (your AW- id + conversion label) on the `purchase` trigger, mapping Conversion Value = `{{ecommerce.value}}`, Currency = `{{ecommerce.currency}}`, Transaction ID = `{{ecommerce.transaction_id}}` (enables Ads dedup). Optionally a GA4 ecommerce `purchase` event tag on the same trigger.
4. Consent Mode already gates these; leave PayPal SDK `data-cookieconsent="ignore"`.
5. **Preserve the owner/demo skip** — `SubscriptionModal.tsx:264-285` (comp-/demo- grants) correctly fires NO `purchase`; do not fire `trackPurchase` for `comp-`/`demo-` in Fix A/B.

No change to `gtm.ts`, GTM container, Consent Mode, or the 4 working paths.

---

## E. File inventory (files to change per issue)

**A. Paid-but-no-email**
- `lib/payments/fulfill.ts` (`:111-136`) — add report-link/PDF send in the `weFulfilled` block; recover email from `prior.email` (`:83`); log `SendEmailResult.reason`; persist `emailDelivered`/`emailReason`.
- `components/ui/SubscriptionModal.tsx` (`:191-221`) — make email required + gate pay buttons.
- `app/api/payments/paypal/create-order/route.ts` (~`:50`) — write PENDING row with `{email,plate}`.
- `app/api/payments/paypal/ideal-return/route.ts` (`:37`) — forward email to fulfill.
- `app/api/payments/paypal/webhook/route.ts` (`:112`) — forward email to fulfill.
- `lib/email/templates.ts` (`:41-50`) — thank-you (link only); optionally add report variant.
- `app/api/vehicle/[plate]/route.ts` (`:446-511`, `:322`) — extract PDF/HTML builders for reuse.
- `lib/api/report-email.ts` (new) — shared PDF+HTML report-email builder.
- `lib/payments/paypal.ts` (`:262-268`) — webhook verify (env-dependent, no code change unless adding logging).
- `lib/email/resend.ts` (`:38,69-72`) — surface `reason` to caller.
- CONFIG (Vercel): `PAYPAL_WEBHOOK_ID`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` (rotate/verify).

**B. Creditcard double/misplaced**
- `components/payments/CheckoutMethods.tsx` (`:175-254` effect, `:235-237` renders, `:176-188` cleanup, `:306-311`/`:319-353` JSX, `:254` deps) — only file changed.

**C. Loader / AI timing**
- `app/api/vehicle/[plate]/route.ts` (gate `:414`, gen `:279`, cache `:205-238`, TTL `:198`, `buildLocalizedWithAi` `:240`) — add prewarm path skipping the gate, cache-only.
- `app/api/vehicle/[plate]/prewarm-ai/route.ts` (new) — prewarm endpoint (or `?prewarm_ai=1` on the existing route).
- `hooks/useAiReport.ts` (mount fetch `:55-69`, unlock refetch `:72-83`) — short poll until cache lands.
- `components/vehicle/FullReportScreen.tsx` (`:206/246/316`, scan-overlap precedent `:128-134`) — fire prewarm on checkout-open.
- `components/vehicle/AiAnalysisScreen.tsx` (`:62-67`) — keep spinner; reassuring subline.

**D. Conversion tracking**
- `app/api/payments/paypal/ideal-return/route.ts` (`:63`) — carry `oid/amt/cur` on the `?paid=1` redirect.
- `components/vehicle/FullReportScreen.tsx` (`:121` `useSearchParams`, `:125` `unlocked`) — one effect firing `trackPurchase` on confirmed-paid return, sessionStorage dedup, param strip.
- `lib/payments/fulfill.ts` (`:111-136`) — optional Fix B server-side MP/offline conversion in the once-only block.
- No change: `lib/analytics/gtm.ts`, GTM container, Consent Mode, the 4 working paths.

---

## F. Sequencing, risks, owner decisions

**Sequencing**
1. **A first (URGENT, revenue-affecting).** Order: (i) required-email gate (`SubscriptionModal`), (ii) PENDING row in `create-order`, (iii) report-link send + failure logging in `fulfill.ts`, (iv) env: rotate/verify `GMAIL_*`, set `PAYPAL_WEBHOOK_ID`. Ships the "every payment sends a report link" guarantee. The PDF-attachment extraction (`report-email.ts`) is a follow-up — link-only mail already fixes the core complaint; do it behind try/catch so it can never block capture.
2. **D Fix A** (iDEAL purchase event). Small, isolated, touches `ideal-return` + `FullReportScreen`; high marketing value. Overlaps A in `fulfill.ts`/`ideal-return` — sequence them or land together to avoid merge churn. Then owner does the GTM/Ads tag wiring.
3. **B** (card fields). Self-contained in `CheckoutMethods.tsx`; do once A's email gate is in (both touch the checkout UI). Run the Playwright iframe-count verification before push.
4. **C** (AI prewarm). Largest; new endpoint + hook polling. Land last; it's UX polish, not correctness, and depends on the cost decision.
5. **D Fix B** (offline conversion) after C — needs gclid capture plumbing; lower urgency.

**Risks**
- A: generating the PDF inside fulfilment can block capture if Apify/Claude is slow — mandatory try/catch + timeout, fall back to link-only. Persisting `emailDelivered` is a `PlatePayment` schema add (backward-compatible).
- A/D shared files (`fulfill.ts`, `ideal-return/route.ts`) — coordinate to avoid conflicts.
- B: StrictMode-only repro — the bug may not show in `next dev` after a naive fix; verify in production-mode Chromium per CLAUDE.md (iframe count = 3, no growth on toggle).
- C: option (a) on all lookups breaks the no-per-visitor Claude rule and can spike costs on high-unique-plate traffic; the prewarm endpoint must never return AI content (premium leak) and must stay idempotent on cache hit.
- D: never fire on bare `?paid=1` (spoof risk) — gate on the signed cookie/`unlocked`; preserve the comp/demo no-fire.
- Security (carried, not in these 4): per CLAUDE.md the PayPal secret + Gmail app password were exposed in chat and must be rotated; A depends on the rotated Gmail password being live in Vercel.

**Owner decisions needed**
1. **C cost tradeoff (the real call):** approve **(c) prewarm on checkout-open** (recommended, near-current cost, wait gone), optionally **(a) for the sample plate only**. Reject (a)-on-every-lookup unless you accept paying Claude for non-buyers.
2. **A scope:** link-only report mail now (fast, fixes complaint) vs. full PDF-attachment mail (more work, slight capture-latency risk). Recommendation: ship link-only first, add PDF as best-effort follow-up.
3. **Env/config:** confirm `PAYPAL_WEBHOOK_ID` is set + webhook registered in PayPal dashboard, and `GMAIL_APP_PASSWORD` is rotated and current in Vercel — A's reliability and the iDEAL backstop both depend on these.
4. **D Fix B / gclid:** decide whether to add gclid capture + Google Ads Offline Conversions to recover closed-tab iDEAL buyers (durable attribution) or accept the small under-count that Consent Mode + client-only tracking leaves.