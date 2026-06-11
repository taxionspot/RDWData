# CLAUDE.md — projectgeheugen Kentekenrapport

## Wat dit is
Nederlandse kentekencheck (kentekenrapport.nl): gratis RDW-basisdata, volledig
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

## Openstaande punten (volgende sessies)
1. **Beveiliging**: `data/0000202250Taxionspot02_20260311.pfx` staat nog in
   git (certificaat → verwijderen + roteren); onbeveiligd demo-endpoint
   `POST /api/payments/access/[plate]` geeft gratis toegang → dichtzetten.
2. **Cookie-consent banner** (tracking laadt nu zonder toestemming; AVG).
3. **Bundel-checkout** 3 rapporten € 19,95 (landing toont "binnenkort").
4. **Branch-merge**: parallelle branch `claude/determined-fermi-D5uBD` heeft
   eigen features (multi-agent rapport, betaalmethode-kiezer, PDF-redesign)
   en schrijft naar dezelfde database → reconciliatie nodig.
5. Vercel env vars zetten: CRON_SECRET, RESEND_API_KEY, NEXT_PUBLIC_BASE_URL.
6. Marktprijzen-bron regelen (AutoScout24/Marktplaats/Indicata/Autotelex) voor
   echte comparables; importhistorie via autoDNA (alleen bij import-vlag).
7. Tellerrapport-upload-feature (verkoper vraagt gratis RDW-rapport op; wij
   toetsen consistentie) — uniek, geen API nodig.
8. Server-side gating premium-velden in de vehicle-API (data zit nu volledig
   in de JSON-response, alleen UI-blur beschermt).
9. Layout-metadata zegt nog "PlateIntel" (app/layout.tsx) → rebranden.

## Branch & deploy
Werkbranch: `claude/charming-bohr-7xou44` (push → automatische Vercel-preview,
SSO-beschermd). Laatste stand: commit d1330ae. Build vereist force-dynamic op
CMS-pagina's (gedaan); `npm run build` faalt lokaal alleen op ontbrekende
MongoDB bij 3 routes als die force-dynamic ooit wegvalt.
