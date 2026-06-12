# CLAUDE.md — projectgeheugen Kentekenrapport

## Wat dit is
Nederlandse kentekencheck (kentekenrapport.com): gratis RDW-basisdata, volledig
rapport eenmalig betaald per kenteken (prijs uit site-settings, nu € 6,95),
AI-analyse via Claude. Next.js 14 App Router + TypeScript + MongoDB (Mongoose),
deploy op Vercel (project "kentekenrapport", team sabur-s-projects). Eigenaar
Sabur communiceert in het Nederlands; antwoord altijd in het Nederlands.

## Werkwijze & harde voorkeuren van de eigenaar
- **NOOIT em-dashes (—) in welke tekst dan ook.** Gewone komma's/punten.
- **Eerlijkheid is het product**: alleen tonen wat echt in officiële data staat.
  Geen verzonnen tijdlijnen, diagrammen, percentages of kostenbanden. Geen data
  = dat eerlijk zeggen. Lege velden verbergen i.p.v. streepjes.
- **AI maximaal benutten** (vertalen van data naar gewone taal), maar eigen
  formules voor kilometers/waarde; AI verzint geen data.
- Kleurenpalet: blauw #2563eb/#1d4ed8 primair, ink #0f172a, secundair #5b6b84,
  vlakken #fff/#f8fafc, randen #e2e8f2; groen/amber/rood alleen voor status;
  **geel uitsluitend voor het kentekenplaat-element**. Ruime spacing.
- Rapport = één verticaal scrollende pagina, géén horizontale navigatie.
- Voorbeeldkenteken: **RG513T** (lib/sample.ts) — overal gratis ontgrendeld,
  incl. gratis inline voorbeeld-PDF (`/api/vehicle/RG513T?download=1`).

## Verificatie-workflow (belangrijk!)
SSR-rooktests missen client-crashes. Altijd testen met headless Chromium:
- Browsers staan in `/opt/pw-browsers` → `npm i --no-save playwright@1.56.1`
  en `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node script.mjs`.
- Productie-modus testen (`next build` + `next start`), pageerror/console
  loggen, desktop 1380px én mobiel 390px, en API's mocken met de échte
  productie-payloads (op te halen via Vercel MCP `web_fetch_vercel_url` +
  `get_access_to_vercel_url`; preview is SSO-beschermd).
- Sandbox kan opendata.rdw.nl en *.vercel.app NIET direct bereiken; MongoDB is
  er niet (API-routes 500'en lokaal, dat is normaal).
- Geleerde les 1: Math.random/Date in eerste render = hydration-crash =
  "Application error" in productie.
- Geleerde les 2: de productie-database wordt door MEERDERE branches
  beschreven; useSiteSettings saneert daarom elke payload (footer-links waren
  objecten i.p.v. strings → crash). Nooit blind op settings-vorm vertrouwen.

## Architectuur-kernpunten
- RDW open data: lib/rdw/* (7 datasets parallel, 24u Mongo-cache + background
  revalidate). RDW publiceert GEEN tellerstanden (niemand mag die hebben, ook
  CARFAX/carVertical niet) en GEEN eigenarenaantal (mapper leest
  `aantal_houders` dat niet bestaat → owners.count is altijd null).
- Kilometers: eigen formule-fallback in heuristics.ts (leeftijd × jaarkm met
  brandstof/carrosserie/taxi-factoren); marktwaarde (computeMarketValueV3)
  rekent daarmee. MRB exact-achtig in lib/tax/mrb.ts (jaarlijks bijwerken).
- AI: lib/api/claude.ts; output server-side gecached in models/AiReportCache
  (7 dagen, km-buckets 5.000) — nooit per-bezoeker Claude-calls toevoegen.
  Client-hook: hooks/useAiReport.ts. Onderhandelcoach-AI vuurt pas ná unlock.
- Modelstatistieken: lib/stats/modelStats.ts + models/ModelStats (on-demand
  SoQL-aggregatie per merk/model/bouwjaar, 240 samples, 30 dagen cache) →
  ApkFailureIntelligenceScreen. Dit vervangt alle vroegere mock-data.
- Rapportcompositie: components/vehicle/FullReportScreen.tsx (secties embedded
  via `embedded`-prop per scherm, SectionErrorBoundary per sectie).
- Betaling: alleen PayPal (dekt iDEAL/Apple Pay/Google Pay/kaart) — GEEN
  Mollie (besloten). Toegang per kenteken in PlatePayment; client-sync via
  lib/payments/access.ts (server-check + event). Succes-scherm + Resend-
  bevestigingsmail in SubscriptionModal/capture-order.
- Tracking: lib/analytics.ts (track()) + components/layout/AnalyticsScripts
  (GA4 + Clarity uit site-settings). Funnel-events zitten in landing,
  PremiumLock, SubscriptionModal, FullReportScreen, VehicleResultScreen.
- Watch mode: lib/watch/checkWatches.ts + dagelijkse Vercel-cron
  (vercel.json, /api/cron/watch-check, Bearer CRON_SECRET) + Resend-mail.
- PDF (lib/api/pdf-report.ts) is gelijkgetrokken met web: AI-analyse,
  onderhandelcoach (lib/api/negotiation-pricing.ts gedeeld), schadesignalen,
  juridische disclaimers.

## Strategische beslissingen (zie docs/)
- docs/product-strategie-en-designblauwdruk.md — productstrategie, prijsmodel
  (bundel 3 voor € 19,95 gepland), API-prioriteiten.
- docs/onderzoek-rdw-zakelijk-en-concurrenten.md — RDW Zakelijk AFGEWEZEN
  (geen tellerstanden, onzekere toekomst); CARFAX/carVertical-analyse +
  presentatie-playbook; VWE reageert niet → RDC als alternatief.
- docs/sectie-reviews-bestelmenu.md — agent-reviews per sectie; alle 10
  bestellingen daaruit zijn gebouwd (commit d1330ae).

## Sessie 12 juni 2026: merge + livegang (kentekenrapport.com)
De branches `claude/charming-bohr-7xou44` (redesign) en
`claude/clever-einstein-v0nx1b` (go-live werk) zijn volledig gemerged en LIVE
op kentekenrapport.com en www.kentekenrapport.com (apex 308 naar www).
Productie deployt automatisch bij push naar `main`.

Toegevoegd in die sessie (bovenop de redesign):
- **Consent & tracking**: Cookiebot banner (cbid c95277a4-b000-4684-910e-
  1490969d79b1, auto-blocking) + Google Consent Mode v2 defaults + GTM
  container GTM-N4TS8CP9, in die volgorde bovenaan body (app/layout.tsx).
  GA4-schema dataLayer-events: plate_search, begin_checkout, purchase (met
  PayPal order-id en echt bedrag) in lib/analytics/gtm.ts. Daarnaast draait
  hun lib/analytics.ts track() + AnalyticsScripts (GA4/Clarity uit settings)
  nog parallel; Cookiebot blokkeert die tot consent. PayPal SDK heeft
  data-cookieconsent="ignore" zodat betalen altijd werkt.
- **E-mails** (afzender "Anouk van Kentekenrapport <info@kentekenrapport.com>",
  EMAIL_FROM env): bedankmail na capture, eenmalige opvolgmail bij
  niet-afgeronde checkout (models/CheckoutLead + /api/checkout/lead +
  dagelijkse cron /api/cron/abandoned-checkout). UTM-tags op alle mail-links.
- **Betaalmethodes**: PayPal-stack met enable-funding=ideal,card + aparte
  ApplePayButton/GooglePayButton (eligibility-gated) via lib/payments/
  paypal-sdk.ts en checkout-client.ts. Apple Pay-verificatiebestand op
  /.well-known/. Prijs komt ALTIJD server-side uit settings (create-order
  negeert client-bedragen); sanitizer normaliseert "6,95" naar "6.95".
- **Juridisch**: NL privacybeleid + algemene voorwaarden templates
  (lib/cms/legal-pages.ts, migreert alleen onbewerkte oude defaults),
  /cookie-policy met Cookiebot-verklaring, herroepingsrecht-regel in de
  betaalmodal, globale SiteFooter (verbergt zichzelf op "/", landing heeft
  eigen footer; gedeelde resolveFooterHref maakt labels klikbaar).
- **Settings-sanitizer**: lib/site-settings/sanitize.ts valideert elke
  DB-payload veld-voor-veld (client én server) tegen defaults; lost de
  object-footer-links-crash structureel op.
- **Beveiliging**: PFX-cert uit de tree (HISTORIE bevat hem nog: certificaat
  laten intrekken/roteren!); POST /api/payments/access/[plate] geeft 403 in
  productie tenzij NEXT_PUBLIC_ENABLE_DEMO_SKIP_PAYMENT=true.
- Metadata gerebrand naar Kentekenrapport, robots.txt + sitemap.xml,
  /pricing-pagina met echt prijsmodel, account-dashboard gebruikt echte
  RDW APK-data i.p.v. hash-nepdata.

**Geleerde les 3 (deploy)**: een vercel.json-cron die vaker dan dagelijks
draait wordt op het Hobby-plan geweigerd en blokkeert dan STIL alle
deployments (geen deployment verschijnt, geen foutmelding bij push). Beide
crons staan nu op dagelijks (07:00 watch-check, 08:00 abandoned-checkout).

## URGENTE issues (door Sabur gemeld op 12 juni, eerst oppakken!)
1. **Betaalmuur werkt niet: alle data is gratis zichtbaar.** Diagnose al
   BEVESTIGD: `GET /api/payments/access/H223JZ` geeft live `{"paid":true}`.
   De productiedatabase bevat oude demo-PlatePayment-records (orderId
   "demo-<PLATE>-<ts>", amount "0.00") uit de periode dat de demo-skip-knop
   altijd aanstond; lib/payments/access.ts ensurePaidAccessChecked ontgrendelt
   die kentekens daardoor voor ALLE bezoekers. Fix: (a) demo-records opruimen
   (PlatePayment.deleteMany({ orderId: /^demo-/ }) of amount "0.00") via
   een admin-beschermd opruim-endpoint of mongosh; (b) overweeg de
   server-check demo-records te laten negeren; (c) daarna oude TODO
   "server-side gating premium-velden" doen (de vehicle-API levert nu nog
   alle premium data in de JSON, alleen UI-blur beschermt). NB: RG513T is
   BEWUST overal gratis (SAMPLE_PLATE) en dus geen bug.
2. **Marktwaarde klopt niet**: moet de EIGEN formule gebruiken
   (computeMarketValueV3 in lib/rdw/heuristics.ts met het formule-
   kilometerverloop), niet een AI-schatting. Controleer wat het rapport en
   de PDF tonen (aiValuation vs enriched.estimatedValueNow), of
   applyMileageValuationOverride goed doorwerkt en of een oude
   AiReportCache-entry verkeerde waardes vasthoudt (cache 7 dagen).
   Getest door Sabur met RG513T en H223JZ.

## Overige openstaande punten
1. Vercel env vars (Production) zetten + redeploy: live PayPal-keys,
   PAYPAL_BASE_URL=https://api-m.paypal.com, NEXT_PUBLIC_PAYPAL_ENV=live,
   RESEND_API_KEY, EMAIL_FROM, CRON_SECRET, NEXT_PUBLIC_BASE_URL=
   https://kentekenrapport.com.
2. Eerste admin-account aanmaken via /admin/signup (eerste registratie open).
3. PayPal-dashboard: domein registreren voor Apple Pay (bestand staat al
   live), Google Pay aanzetten; Cookiebot admin: domein toevoegen + banner
   publiceren; GTM: GA4-tag + Ads-conversietag op purchase-event.
4. Resend: kentekenrapport.com verifiëren (SPF/DKIM/DMARC).
5. Bundel-checkout 3 rapporten € 19,95 (landing toont "binnenkort").
6. Branch `claude/determined-fermi-D5uBD` (multi-agent rapport) is NIET
   gemerged; beoordeel later of daar nog iets waardevols in zit.
7. Marktprijzen-bron regelen (AutoScout24/Marktplaats/Indicata/Autotelex);
   importhistorie via autoDNA (alleen bij import-vlag).
8. Tellerrapport-upload-feature (uniek, geen API nodig).
9. Juridische teksten: in de DB staat een eigen NL-versie van 7 juni; de
   uitgebreidere templates uit lib/cms/legal-pages.ts kunnen desgewenst via
   /admin/legal worden overgenomen.

## Branch & deploy
Productie = `main` op kentekenrapport.com; push naar main deployt automatisch.
Laatste stand: merge-commit 4e7be55 (12 juni). Volledige go-live-stappen staan
in docs/go-live-checklist.md. Build vereist force-dynamic op CMS-pagina's
(gedaan); `npm run build` slaagt lokaal volledig zonder MongoDB.
