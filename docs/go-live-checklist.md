# Go-live checklist: betalingen, Cookiebot & conversion tracking

Dit document beschrijft wat al in de code zit en wat je nog buiten de code (PayPal,
GTM, Cookiebot, Google Ads) moet configureren om live te gaan en advertenties te draaien.

## Wat al in de code zit

### Consent & tags (`app/layout.tsx`)

Geladen in deze volgorde, bovenaan elke pagina:

1. **Google Consent Mode v2 defaults** — alles `denied` (behalve `security_storage`)
   totdat de bezoeker toestemming geeft. Inclusief `ads_data_redaction`.
2. **Cookiebot banner** (`uc.js`, cbid `c95277a4-b000-4684-910e-1490969d79b1`) met
   `data-blockingmode="auto"`. Cookiebot stuurt consent-updates automatisch door naar
   Consent Mode.
3. **Google Tag Manager** container `GTM-N4TS8CP9` (incl. `<noscript>` fallback).

Beide IDs zijn te overschrijven via `NEXT_PUBLIC_GTM_ID` en `NEXT_PUBLIC_COOKIEBOT_CBID`.

> **Let op:** voeg in GTM **niet** ook nog de "Cookiebot CMP" template-tag toe — de
> banner wordt al direct vanaf de site geladen. Dubbel laden geeft conflicten.

### DataLayer-events (conversion tracking)

| Event | Wanneer | Payload |
|---|---|---|
| `plate_search` | Bezoeker zoekt een kenteken | `plate` |
| `begin_checkout` | Betaalmodal opent | `plate`, `ecommerce.value`, `ecommerce.currency`, `ecommerce.items` |
| `purchase` | PayPal-capture succesvol afgerond | `plate`, `ecommerce.transaction_id` (PayPal order-ID), `ecommerce.value`, `ecommerce.currency`, `ecommerce.items` |

- `purchase` vuurt **alleen** na een door de server bevestigde capture (`COMPLETED`),
  met het werkelijk afgeschreven bedrag uit het PayPal-capture-antwoord.
- De "Demo: betaling overslaan"-knop vuurt **geen** purchase-event en is in productie
  verborgen (zie hieronder).
- Events volgen het GA4 e-commerce schema, dus de ingebouwde GA4-tags in GTM pikken
  ze direct op.

### Betaling

- De demo-skip-knop staat nu achter `NEXT_PUBLIC_ENABLE_DEMO_SKIP_PAYMENT` en is
  **standaard uit**. Zet deze variabele in productie niet (of op `false`).
- De PayPal SDK is gemarkeerd met `data-cookieconsent="ignore"` zodat Cookiebot
  auto-blocking de checkout nooit blokkeert (betalen = strikt noodzakelijk).

### Cookieverklaring

- Nieuwe pagina `/cookie-policy` toont de automatisch gegenereerde
  Cookiebot-cookieverklaring (in NL of EN, volgt de taalkeuze van de site).

## Nog te doen buiten de code

### 1. PayPal live zetten (productie-env)

```
NEXT_PUBLIC_PAYPAL_CLIENT_ID=<live client id>
PAYPAL_CLIENT_ID=<live client id>
PAYPAL_CLIENT_SECRET=<live secret>
PAYPAL_BASE_URL=https://api-m.paypal.com
```

Maak de live-app aan op developer.paypal.com onder het zakelijke account en doe na
deploy één echte testbetaling (laag bedrag kan via de admin-prijsinstelling).

### 2. Cookiebot admin (admin.cookiebot.com)

- Voeg het productiedomein toe aan de domeingroep van cbid `c95277a4-…`.
- Zet "Google Consent Mode" aan in de banner-instellingen (Settings → Your scripts /
  consent mode), zodat de banner consent-updates naar GTM pusht.
- Kies bannertaal NL (+ EN) en publiceer.
- Link in de bannerinstellingen naar `/cookie-policy` als cookieverklaring.

### 3. GTM container `GTM-N4TS8CP9` (tagmanager.google.com)

1. **Variabelen**: maak Data Layer-variabelen aan voor `ecommerce.transaction_id`,
   `ecommerce.value`, `ecommerce.currency` en `plate`.
2. **Triggers**: Custom Event-triggers voor `plate_search`, `begin_checkout`, `purchase`.
3. **GA4**: voeg een "Google Tag" (GA4-config) toe met je Measurement ID; GA4 leest de
   e-commerce events automatisch. Trigger: All Pages / Initialization.
4. **Google Ads**:
   - **Conversion Linker**-tag, trigger All Pages.
   - **Google Ads Conversion Tracking**-tag op de `purchase`-trigger, met
     Conversion ID/Label uit Google Ads en `transaction_id`, `value`, `currency`
     uit de dataLayer-variabelen (transaction_id voorkomt dubbele tellingen).
   - Optioneel: remarketing-tag op `plate_search`/`begin_checkout` voor doelgroepen.
5. **Consent**: controleer per tag onder "Consent Settings" dat Google-tags hun
   ingebouwde consent checks gebruiken (geen extra consent vereisen nodig; Consent
   Mode v2 regelt het).
6. Test alles met **Preview/Tag Assistant** en publiceer de container.

### 4. Google Ads

- Maak een conversieactie "Aankoop" aan (bron: website, via GTM) en gebruik het
  Conversion ID/Label in de GTM-tag hierboven.
- Koppel GA4 aan Google Ads en importeer eventueel ook de GA4 `purchase` als
  secundaire conversie (zet er maar één op "primair" om dubbel tellen te voorkomen).
- Conversion Linker + Consent Mode v2 zijn vereist voor correcte attributie in de EU.

### 5. End-to-end test vóór livegang

1. Open de site in incognito → Cookiebot-banner verschijnt, geen marketing-cookies
   vóór toestemming (check DevTools → Application → Cookies).
2. Weiger toestemming → zoeken en **betalen moeten gewoon werken** (PayPal is
   uitgesloten van blocking).
3. Accepteer toestemming → GTM Preview: `plate_search` bij zoeken, `begin_checkout`
   bij openen betaalmodal, `purchase` (met transaction_id en bedrag) na betaling.
4. Controleer dat de "Demo: betaling overslaan"-knop **niet** zichtbaar is.
5. Controleer de conversie in Google Ads (kan tot enkele uren duren).
