# Go-live checklist: betalingen, Cookiebot & conversion tracking

Dit document beschrijft wat al in de code zit en wat je nog buiten de code (PayPal,
GTM, Cookiebot, Google Ads) moet configureren om live te gaan en advertenties te draaien.

## Wat al in de code zit

### Consent & tags (`app/layout.tsx`)

Geladen in deze volgorde, bovenaan elke pagina:

1. **Google Consent Mode v2 defaults**, alles `denied` (behalve `security_storage`)
   totdat de bezoeker toestemming geeft. Inclusief `ads_data_redaction`.
2. **Cookiebot banner** (`uc.js`, cbid `c95277a4-b000-4684-910e-1490969d79b1`) met
   `data-blockingmode="auto"`. Cookiebot stuurt consent-updates automatisch door naar
   Consent Mode.
3. **Google Tag Manager** container `GTM-N4TS8CP9` (incl. `<noscript>` fallback).

Beide IDs zijn te overschrijven via `NEXT_PUBLIC_GTM_ID` en `NEXT_PUBLIC_COOKIEBOT_CBID`.

> **Let op:** voeg in GTM **niet** ook nog de "Cookiebot CMP" template-tag toe, de
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

### E-mails (bedankmail & opvolgmail)

Alle e-mails worden verstuurd via Resend met afzender
`Anouk van Kentekenrapport <info@kentekenrapport.com>` (instelbaar via `EMAIL_FROM`).

| Mail | Trigger | Inhoud |
|---|---|---|
| **Bedankmail** | Direct na een geslaagde PayPal-betaling (als er een e-mailadres is ingevuld) | Betaalbevestiging met bedrag, kenteken, ordernummer en knop naar het rapport |
| **Opvolgmail** | Standaard 60 min. na de laatste checkout-activiteit zonder betaling (instelbaar via `ABANDONED_CHECKOUT_DELAY_MINUTES`) | Persoonlijke reminder van Anouk met knop om de betaling af te ronden |
| **Rapportmail** (bestond al) | Na ontgrendeling met e-mailadres | Volledig rapport + PDF-bijlage, nu ook vanaf het Anouk-adres |

Hoe de opvolgmail werkt:

1. Zodra iemand in de betaalmodal een geldig e-mailadres invult, wordt dit (met
   kenteken en taal) opgeslagen als *checkout lead* (`POST /api/checkout/lead`).
2. Betaalt diegene, dan wordt de lead op "converted" gezet, geen opvolgmail.
3. Een cron (`GET /api/cron/abandoned-checkout`, elke 30 min. via `vercel.json`)
   zoekt leads ouder dan de ingestelde wachttijd zonder betaling en stuurt
   **eenmalig** de opvolgmail. Links in de mails hebben UTM-tags
   (`utm_campaign=thank_you` / `abandoned_checkout`) zodat je ze terugziet in GA4.
4. Leads ouder dan 7 dagen worden niet meer gemaild.

De cron-route is beveiligd met `CRON_SECRET` (Vercel stuurt die automatisch mee
als `Authorization: Bearer …` wanneer de env-var is gezet).

### Pagina's & juridisch

- Elke pagina heeft een globale footer met werkende links naar algemene
  voorwaarden, privacybeleid en cookieverklaring.
- `/privacy-policy` en `/terms-and-conditions` bevatten volwaardige Nederlandse
  juridische teksten (AVG, herroepingsrecht digitale levering, betaalmethodes,
  contact via info@kentekenrapport.com). Bestaande databases met de oude Engelse
  standaardteksten worden automatisch gemigreerd; door de admin aangepaste
  teksten blijven staan. Bewerken kan via /admin/legal.
- In de betaalmodal staat de wettelijk vereiste instemming met directe levering
  (afstand van herroepingsrecht) met links naar voorwaarden en privacybeleid.
- `/pricing` toont het echte prijsmodel (eenmalig per kenteken, prijs uit de
  admin-instellingen) in plaats van de oude demo-abonnementen.
- `robots.txt` en `sitemap.xml` worden automatisch geserveerd.

## Nog te doen buiten de code

### 1. PayPal live zetten (productie-env)

```
NEXT_PUBLIC_PAYPAL_CLIENT_ID=<live client id>
PAYPAL_CLIENT_ID=<live client id>
PAYPAL_CLIENT_SECRET=<live secret>
PAYPAL_BASE_URL=https://api-m.paypal.com
NEXT_PUBLIC_PAYPAL_ENV=live
```

Maak de live-app aan op developer.paypal.com onder het zakelijke account en doe na
deploy één echte testbetaling (laag bedrag kan via de admin-prijsinstelling).

**Betaalmethodes**, de checkout ondersteunt PayPal, iDEAL, creditcard/debitcard,
Apple Pay en Google Pay (alles loopt via het PayPal-account):

- **iDEAL & kaarten**: staan aan via de PayPal-knoppenstack (`enable-funding=ideal,card`).
  iDEAL verschijnt automatisch voor bezoekers in Nederland. Controleer in het
  PayPal-zakelijk account dat "iDEAL" en "Debit/Credit cards" als betaalmethodes
  geaccepteerd worden.
- **Apple Pay**: het verificatiebestand staat in de site op
  `/.well-known/apple-developer-merchantid-domain-association`. Registreer daarna
  het domein `kentekenrapport.com` in de PayPal-omgeving
  (developer.paypal.com → je live-app → Features → Apple Pay → Manage domains →
  Add domain). De Apple Pay-knop verschijnt alleen in Safari op Apple-apparaten
  met een ingestelde wallet.
- **Google Pay**: zet Google Pay aan in dezelfde Features-pagina van de live-app.
  `NEXT_PUBLIC_PAYPAL_ENV=live` zorgt dat Google Pay in productie-modus draait
  (bij `sandbox` gebruikt hij testkaarten).
- De prijs wordt altijd server-side bepaald (admin-instelling); een klant kan het
  bedrag niet manipuleren via de browser.

### 2. E-mail live zetten (Resend)

- Verifieer het domein **kentekenrapport.com** in Resend (DNS: SPF + DKIM, en
  stel ook DMARC in) zodat mails van `info@kentekenrapport.com` niet in spam komen.
- Zet in de productie-env:
  ```
  RESEND_API_KEY=<live key>
  EMAIL_FROM=Anouk van Kentekenrapport <info@kentekenrapport.com>
  CRON_SECRET=<lang willekeurig geheim>
  ABANDONED_CHECKOUT_DELAY_MINUTES=60
  NEXT_PUBLIC_BASE_URL=https://kentekenrapport.com
  ```
  (`NEXT_PUBLIC_BASE_URL` wordt gebruikt voor de knoppen/links in de mails.)
- De cron staat in `vercel.json` op 1× per dag (08:00 UTC, ±10:00 NL) omdat het
  Vercel Hobby-plan alleen dagelijkse crons toestaat. Opvolgmails gaan dus
  maximaal één keer per dag uit. Op het Pro-plan kun je de schedule verkorten
  naar bijv. `*/30 * * * *` zodat de opvolgmail al ~1 uur na het afhaken
  binnenkomt.
- Test: vul in de betaalmodal een eigen e-mailadres in, sluit zonder te betalen,
  en roep daarna handmatig de cron aan (met
  `Authorization: Bearer <CRON_SECRET>`) of wacht op de schedule → opvolgmail.
  Doe daarna een testbetaling → bedankmail.

### 3. Cookiebot admin (admin.cookiebot.com)

- Voeg het productiedomein toe aan de domeingroep van cbid `c95277a4-…`.
- Zet "Google Consent Mode" aan in de banner-instellingen (Settings → Your scripts /
  consent mode), zodat de banner consent-updates naar GTM pusht.
- Kies bannertaal NL (+ EN) en publiceer.
- Link in de bannerinstellingen naar `/cookie-policy` als cookieverklaring.

### 4. GTM container `GTM-N4TS8CP9` (tagmanager.google.com)

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

### 5. Google Ads

- Maak een conversieactie "Aankoop" aan (bron: website, via GTM) en gebruik het
  Conversion ID/Label in de GTM-tag hierboven.
- Koppel GA4 aan Google Ads en importeer eventueel ook de GA4 `purchase` als
  secundaire conversie (zet er maar één op "primair" om dubbel tellen te voorkomen).
- Conversion Linker + Consent Mode v2 zijn vereist voor correcte attributie in de EU.

### 6. Direct na de eerste deploy

- **Maak meteen het eerste admin-account aan** via `/admin/signup`. De eerste
  registratie is open (first-run setup); daarna is aanmelden alleen mogelijk
  voor ingelogde admins. Doe dit vóórdat je de URL deelt.
- Open `/privacy-policy`, `/terms-and-conditions` en `/cookie-policy` één keer
  zodat de juridische teksten in de database staan.

### 7. End-to-end test vóór livegang

1. Open de site in incognito → Cookiebot-banner verschijnt, geen marketing-cookies
   vóór toestemming (check DevTools → Application → Cookies).
2. Weiger toestemming → zoeken en **betalen moeten gewoon werken** (PayPal is
   uitgesloten van blocking).
3. Accepteer toestemming → GTM Preview: `plate_search` bij zoeken, `begin_checkout`
   bij openen betaalmodal, `purchase` (met transaction_id en bedrag) na betaling.
4. Controleer dat de "Demo: betaling overslaan"-knop **niet** zichtbaar is.
5. Controleer de conversie in Google Ads (kan tot enkele uren duren).
