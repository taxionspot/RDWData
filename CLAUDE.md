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
- Rapport = één verticaal scrollende pagina met een sticky sectie-navigatie
  (ReportSectionNav, scrollspy) om snel naar een sectie te springen; geen
  aparte tab-pagina's.
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

## URGENTE issues van 12 juni: GEFIXT + LIVE (gemerged naar main 13 juni)
Beide issues zijn opgelost en LIVE op kentekenrapport.com (commits d5dc2ad +
ade9ee3 op main, 13 juni). Live geverifieerd via /api/payments/access:
H223JZ = paid:false (betaalmuur dicht), RG513T (sample) = paid:true. Eerder ook
met Playwright geverifieerd (26 checks groen). cleanup-demo endpoint NOG
uitvoeren (optioneel; het lek is al dicht via de servercheck).

1. **Betaalmuur** (oorzaak: oude demo-PlatePayment-records, orderId
   "demo-<PLATE>-<ts>", amount "0.00", ontgrendelden elk getest kenteken
   voor iedereen):
   - lib/payments/server-access.ts (nieuw): hasCompletedPlatePayment negeert
     demo-records tenzij demo-modus expliciet aanstaat; hasPaidPlateAccess
     bundelt sample/demo/paymentEnabled/betaald-check. Gebruikt in
     GET /api/payments/access/[plate] en de vehicle-API.
   - Opruim-endpoint (admin-cookie vereist): GET
     /api/admin/payments/cleanup-demo toont count+kentekens, POST verwijdert
     de demo-records definitief. NA DEPLOY NOG UITVOEREN (eerst inloggen op
     /admin). Lek is door de servercheck al dicht, opruimen is hygiëne.
   - Server-side gating AI-content: /api/vehicle/[plate]?include_ai=1 geeft
     aiInsights/aiValuation alleen nog bij betaald/sample/demo (scheelt ook
     Claude-kosten); negotiation-copilot-endpoint geeft 402 zonder betaling.
     hooks/useAiReport.ts refetcht na unlock (onPlateAccessChanged), anders
     bleef de lege pre-betaling-respons in de client-cache hangen.
   - NOG OPEN (vervolgstap, bewust niet in deze fix): de basis-JSON van de
     vehicle-API bevat nog steeds alle RDW-/enriched-data; per-sectie
     veldgating vergt een audit van welke velden het gratis overzicht nodig
     heeft (risico: gratis funnel breken). AI-content is wel al gegated.
   - NB: RG513T blijft BEWUST overal gratis (SAMPLE_PLATE).
2. **Marktwaarde**: overal de EIGEN formule (computeMarketValueV3):
   - lib/api/market-value.ts: alignValuationWithFormula overschrijft
     AI-bedragen hard met enriched.estimatedValueNow/Min/Max + confidence
     (AI-bedragen alleen als de formule geen waarde heeft, bv. geen
     catalogusprijs). Toegepast in generateVehicleAiReport zelf (claude.ts,
     geldt dus ook voor copilot/PDF/mail) én op AiReportCache-reads.
   - Prompt (claude.ts) instrueert Claude expliciet de formulewaarden uit
     enriched te kopiëren; factors/explanation blijven AI-werk.
   - AiReportCache-key gebumpt naar "v2|..." zodat oude entries met
     AI-verzonnen bedragen/toelichtingen vervallen.
   - Web toont formulewaarde eerst (VehicleResultScreen), PDF-hero en
     "Waarde nu"-kaart lezen enriched eerst; labels hernoemd van
     "AI-waardering" naar "Geschatte marktwaarde"/"Marktwaardering".
   - Onderhandelcoach rekent met formulewaarden (mileage werkt door via
     applyMileageValuationOverride); bij AI-failure formule-fallback i.p.v.
     client-bedragen.

## Sessie 13 juni 2026: livegang-feedback (LIVE)
Branch feedback/livegang-finetune (commit d522af5) + sample-fix (ade9ee3),
ff-gemerged op main bovenop d5dc2ad. Verwerkt n.a.v. Sabur-feedback:
- **Checkout-bug**: PayPal/Google Pay verdwenen zodra je het e-mailveld typte.
  Oorzaak: email + callbacks in de useEffect-deps van PayPalCheckout/
  GooglePayButton, waardoor de cleanup de knop afbrak. Fix: knop één keer
  renderen, verse props via een ref (latest.current). ApplePayButton was al veilig.
- **Geld-terug-garantie verwijderd** (was vals): FAQ + badge in app/page.tsx,
  SubscriptionModal-guaranteeLine, FullReportScreen unlockMicro; ook de
  "Beste prijs garantie"-claims weg. Vervangen door eerlijke teksten (directe
  levering/herroepingsrecht, support via info@, "eenmalig per kenteken").
- **Rapport-navigatie**: nieuwe components/vehicle/ReportSectionNav.tsx (sticky
  tabbalk + scrollspy, mobiel horizontaal scrollend). De CSS (.navWrap/.navPill in
  FullReportScreen.module.css) bestond al maar de JSX ontbrak, daarom was "de menu
  weg".
- **Gratis-eerst** expliciet met een voorproefje-uitleg in RecordsSummary.
- **Marktwaarde v3**: formule was al exact (computeMarketValueV3); BMW-coeff
  0.02 -> 0.01 gelijk aan de spec-PDF (market-value-formula-v3).
- **PDF (pdf-report.ts) herordend**: AI-analyse naar boven, dubbele marktwaarde
  samengevoegd, Kilometerstand/NAP-sectie toegevoegd, lege tabellen
  (repairChances/knownIssues zijn nu altijd leeg) verborgen, jargon-labels
  ("raw.main") leesbaar gemaakt.
- **Bedankmail** wijst nu op de PDF-download.
- **Sample-fix**: GET /api/payments/access gebruikt nu hasPaidPlateAccess
  (sample-bewust) i.p.v. hasCompletedPlatePayment, zodat RG513T weer paid:true
  geeft zonder de betaalmuur te openen.

## Sessie 13 juni 2026 deel 2: feedback-ronde 2 (LIVE, commit d63ca74)
Na live-test door Sabur op mobiel. Live geverifieerd: RG513T AI-API 0 dashes/0
providernaam; landing 0 dashes/0 providernaam/0 oude claims; 27 report-JS-chunks
0 providernaam.
- **Em-dash hardcoded weg**: lib/api/sanitize-text.ts (sanitizeText/sanitizeList/
  sanitizeDeep, unicode-escapes) in claude.ts + claude-comparison.ts parsers +
  fallbacks, EN sanitizeDeep op de AiReportCache-READ in app/api/vehicle/[plate]/
  route.ts zodat oude cache-entries op leesmoment geschoond worden. escapeHtml
  in report-template strikt ook.
- **AI-provider verborgen**: elke klant-zichtbare "Claude" -> "Kentekenrapport AI"
  (AiAnalysisScreen, NegotiationCopilotScreen, VehicleComparisonScreen, account).
  Prompt verbiedt nu ook eurobedragen in proza.
- **Marktwaarde 1 bron (enriched.estimatedValue*)**: cataloguePrice-fallback weg
  (MarketAnalysisScreen toonde anders de NIEUWprijs), verzonnen *1.65-trend +
  "vergelijkbare advertenties" weg, *0.9/1.1-nepbanden weg (market-value.ts,
  NegotiationCopilot, pdf-report), dubbel eurobedrag uit report-template
  AI-sectie, e-mailpad (route POST) + account-dashboard forwarden nu de km-stand,
  PDF-hero leest alleen enriched + bar-geometrie gelijk aan labels.
- **Mobiele horizontale scroll weg**: overflow-x:hidden + min-width:0/max-width
  100%-keten (globals, FullReportScreen, hero/specs/market CSS). PremiumLock-
  overlay leesbaar; sticky onderbalk wijkt (padding-left + z-index) voor de
  zwevende knop.
- **Checkout**: misleidende methode-opsomming weg (alleen tonen wat echt rendert),
  eerlijke regel, echte retry die de SDK herlaadt (retryKey), PAYPAL_CONFIG_ERROR/
  LOAD_ERROR + zichtbare melding i.p.v. lege knop. (Betaalknoppen vereisen nog
  steeds de Vercel PayPal-env-vars + PayPal-dashboard, zie punt 1 hieronder.)
- **Meer voertuigdata uit RDW**: mapper/types/service + TechnicalSpecs + PDF tonen
  nu typeCode/variant/uitvoering, afmetingen (l/b/h, wielbasis) en massa rijklaar;
  eerlijke regel "Transmissie: niet in RDW open data" (RDW heeft geen
  versnellingsbak/uitvoering/opties; trim/opties = toekomstig VWE/RDC).
- **Eigenaar-test (gratis betaalde flow)**: saburm1997@gmail.com ontgrendelt zonder
  te betalen. server-access.ts isCompEmail (env COMP_ACCESS_EMAILS + hardcoded
  default saburm1997@gmail.com), access-route POST maakt een comp-record (orderId
  comp-, echt bedrag, telt mee in hasCompletedPlatePayment, opent de muur NIET voor
  anderen), SubscriptionModal toont een "Eigenaar-test"-knop zodra dat adres is
  ingevuld (client NEXT_PUBLIC_COMP_EMAILS). LET OP/beveiliging: wie dit e-mailadres
  intypt krijgt gratis toegang; via COMP_ACCESS_EMAILS te wijzigen, of vraag om een
  extra token-slot als je het strakker wilt.
- Aanpak: multi-agent audit (6 dim + tegencheck) -> 18 implementatie-agents
  (disjuncte bestanden) -> build -> deploy -> live verificatie.

## Sessie 13 juni 2026 deel 3: betaal-keys live, marktwaarde/design, checkout-plan
- **PayPal LIVE + werkend** (commits e397dbc..d4612ca). User heeft de Vercel env-vars
  gezet; diag bevestigt environment=live, auth ok, client-id ASLN..., secret niet
  meer in de bundle. Correcte env: PAYPAL_CLIENT_ID + NEXT_PUBLIC_PAYPAL_CLIENT_ID =
  de A-sleutel (client-id); PAYPAL_CLIENT_SECRET = de E-sleutel; PAYPAL_BASE_URL=
  https://api-m.paypal.com; NEXT_PUBLIC_PAYPAL_ENV=live. BEVEILIGING: user plakte de
  PayPal-secret EN het Gmail app-wachtwoord in de chat, en had even
  NEXT_PUBLIC_PAYPAL_CLIENT_ID met de secret gevuld (secret stond kort publiek in de
  JS-bundle) -> BEIDE secrets moeten geroteerd worden.
- **E-mail via Gmail SMTP** (Google Workspace): env GMAIL_USER=info@kentekenrapport.com
  + GMAIL_APP_PASSWORD. nodemailer in lib/email/resend.ts; vehicle-route sendReportEmail
  ook gemigreerd; Resend eruit.
- **Marktwaarde nu OVERAL uit de formule**: AiAnalysisScreen toonde de AI-waarde
  (bv. EUR 28.800) i.p.v. enriched (EUR 6.150, mét km). Leest nu enriched.
  estimatedValueNow/Min/Max via useVehicleLookup(plate, mileage), gelijk aan
  Marktprijsanalyse + PDF.
- **"AI"-buzzword weg uit alle klanttekst** (professioneler): AI-analyse->Analyse,
  AI aankoopadvies->Aankoopadvies, AI Verdict->Oordeel, APK Intelligence->APK-inzichten,
  "Kentekenrapport AI ..."->neutraal. Provider blijft verborgen.
- **PremiumLock = teaser**: zichtbare gebluurde data (opacity 0.6, blur 5px), compacte
  sectie (max-height 300px = minder scrollen), 1 nette unlock-kaart onderaan (dubbele
  VERGRENDELD-badge weg).
- **Voorbeeldrapport = H223JZ** (SAMPLE_PLATE in lib/sample.ts; alle links volgen).
- **TGK-transmissie LIVE** (gratis; RDW 7rjk-eycs + x5v3-sewk; ~77% dekking).
- **Comp/eigenaar-test = sessie-cookie** (kr_comp); comp- records uitgesloten van
  globale toegang -> geen betaalmuur-lek meer.
- Nav: dekkende achtergrond + scroll-padding-top 120px + ruimte onder de balk.
- TIJDELIJK: POST /api/payments/paypal/create-order?diag=1 geeft veilige PayPal-diag
  (geen secret) -> LATER VERWIJDEREN (lib/payments/paypal.ts getPaypalDiagnostics +
  probePaypalAuth, en de diag-tak in de route).

## NEXT (volgende sessie): checkout EXACT als annuleren via PayPal + Tikkie
KERN-CORRECTIE door user: annuleren draait op ALLEEN PayPal + Tikkie (GEEN Mollie).
De directe iDEAL-flow op annuleren (link pay.ideal.nl -> kies je bank) komt via
**Tikkie (ABN AMRO)**, dat iDEAL-based is. PayPal-iDEAL geeft die directe bankkeuze
NIET (wrapt iDEAL in PayPals checkout). Plan: bouw de kentekenrapport-checkout 1-op-1
als annuleren.com/thankyou:
- Radio-keuzelijst met "Betaal nu": iDEAL (via Tikkie -> pay.ideal.nl bankkeuze),
  Tikkie, Creditcard (in POPUP, niet inline uitklappen), PayPal, + IBAN-overschrijving
  als fallback. Zelfde design als annuleren.
- Integreer de Tikkie/ABN AMRO-API (user heeft account, ook bij annuleren/taxionspot)
  voor iDEAL+Tikkie; PayPal blijft voor PayPal + creditcard.
- Doel: identieke betaalervaring aan annuleren.

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

## Sessie 14 juni 2026: marktwaarde = PREMIUM-ONLY + Carapis dood + aggregaten-logging
NOG NIET GEDEPLOYED (user beslist push naar main). `npm run build` slaagt (exit 0).
- **Carapis-key getest, API DOOD**: `https://api.carapis.com/v2/listings` geeft 404 op
  alles (mét/zonder key, ook hun eigen encar-voorbeeld); dashboard = "Asian Car
  Market Data"; NL-platformpagina's zijn SEO, geen live dataset. -> Carapis laten
  vallen. Visuele "vergelijkbare auto's te koop" kan alleen veilig-synthetisch
  (RDW + generiek/OEM-plaatje + dieplink); echte advertentiefoto's = hoog
  juridisch risico ongeacht de bron (foto-auteursrecht + databankenrecht).
- **MARKTWAARDE NU PREMIUM-ONLY (server-side)**: de eigen formulewaarde mag alleen
  zichtbaar zijn voor wie het kenteken betaalde. Nieuw `lib/api/premium-value.ts`:
  `PREMIUM_VALUE_FIELDS` = estimatedValueNow/Min/Max/NextYear + marketValueConfidence
  + marketValueSe; `redactPremiumValue(localized, hasAccess)` nullt die velden in
  `enriched` als geen toegang. Toegepast in:
  - `app/api/vehicle/[plate]/route.ts`: basis-tak (was ONGEGATE -> nu hasPaidPlateAccess
    + redactie) en de onbetaalde include_ai-tak. Betaald/sample houden de waarde.
  - `app/api/vehicle/compare/route.ts` (de tweede deur, gevonden door de audit, had
    3 HIGH-lekken): rauwe JSON nu per-kenteken geredigeerd; AI draait alleen als
    BEIDE kentekens betaald zijn (anders eurobedrag-lek via basePros/comparePros);
    PDF vereist nu BEIDE betaald via cookie-bewuste `hasPaidPlateAccess` i.p.v.
    OR-gating + globale `PlatePayment.exists` -> geen pivot meer via het gratis
    sample-kenteken, geen "1 betaling = globaal" gat.
  - Client: `hooks/useVehicleLookup.ts` refetcht na unlock (onPlateAccessChanged);
    `MarketAnalysisScreen.tsx` herberekent client-side alleen bij een AANWEZIGE
    serverwaarde (geen reconstructie uit cataloguePrice voor niet-betalers);
    `VehicleResultScreen.tsx` gratis hero toont "Premium" i.p.v. de waarde.
  - `cataloguePrice` (RDW-catalogusprijs/nieuwprijs) blijft GRATIS (legit RDW-spec,
    getoond in VehicleCard/VehicleComparison); is wel de formule-input.
- **Prijsoordeel**: bestond al in MarketAnalysisScreen ("Controleer vraagprijs" +
  verdict-meter), zit achter PremiumLock -> niet dubbel gebouwd.
- **Aggregaten-logging (data-product stap 1)**: nieuw `models/MarketValueAggregate.ts`
  (_id = `plate|locale|YYYY-MM-DD` dag-bucket; ONZE eigen waarde, GEEN advertentie-
  data) + `logMarketAggregate()` in de basis-tak (best-effort, blokkeert de respons
  niet). Bouwt een rechtmatige NL-prijstijdreeks voor een later dealer-prijsindex.
- **Verificatie**: adversariele audit (workflow, 5 agents) -> alleen compare-route lekte
  -> gefixt; hoofd-changeset 0 blokkerende regressies (betalers/sample houden waarde,
  null-safe, refetch klopt). Build exit 0.
- **POST-DEPLOY polish (niet-blokkerend)**: (a) redactie uitlijnen met
  `lockSections.marketAnalysis` (als admin die sectie gratis zet bij payments-aan
  ziet de bezoeker nu een leeg "-"-panel i.p.v. open data); (b) compound index +
  evt. TTL op MarketValueAggregate vóór het prijsindex-product; (c) RESIDUAL:
  computeMarketValueV3 zit in de client-bundle en cataloguePrice is gratis -> de
  waarde is met devtools+console theoretisch tot op de euro reconstrueerbaar
  (bewust geaccepteerd; echte fix = waardering server-only, buiten scope).

## Branch & deploy
Productie = `main` op kentekenrapport.com; push naar main deployt automatisch.
Laatste stand: commit ade9ee3 (13 juni, livegang-feedback + sample-fix). Volledige go-live-stappen staan
in docs/go-live-checklist.md. Build vereist force-dynamic op CMS-pagina's
(gedaan); `npm run build` slaagt lokaal volledig zonder MongoDB.
