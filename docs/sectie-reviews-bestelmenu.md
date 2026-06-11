# Sectie-reviews: feedback van 7 review-agents (bestelmenu)

> Elke sectie is door een eigen agent van A tot Z doorgelicht op: waarde voor de
> klant, gebruiksvriendelijkheid, weergave op verschillende apparaten, conversie
> en meetbaarheid. Dit document is het bestelmenu: kies wat gebouwd moet worden.
> Prioriteit: H = hoog, M = middel, L = laag.
>
> Items gemarkeerd met ✅ zijn direct na de review al gefixt.

---

## 1. Landing & checkout (agent 1)

**Wat gaat fout / mist (top):**
- (H) **Nul event-tracking.** GA4-id en Clarity-id staan in de instellingen maar er
  wordt geen enkel event verstuurd. Geen funnel-meting mogelijk: klik op zoeken,
  modal geopend, betaling gestart/gelukt/mislukt is allemaal onzichtbaar.
- (H) **Geen succes-scherm na betaling.** Modal sluit gewoon; klant is verward.
  Toon: "Betaling gelukt, rapport ontgrendeld" + downloadknop + bundel-upsell.
- (H) **E-mail wordt vóór de prijs gevraagd** in de betaalmodal (frictie) en er
  volgt geen bevestigingsmail of welkomstmail; verzamelde e-mails gaan verloren.
- (H) **Geen urgentie of social proof**: geen reviews/teller/garantie bij de
  betaalknop; geld-terug-garantie staat alleen in de FAQ.
- (M) Betaalmodal toont alleen "Betalen met PayPal" terwijl de landing
  iDEAL/Apple Pay/Google Pay belooft; toon de methodes expliciet in de modal.
- (M) Mislukte betaling: generieke fout zonder retry-knop of alternatief.
- ✅ Voorbeeldrapport was onvindbaar → nu PDF-knop in de hero + gratis sample.

**Kansen:** exit-intent prompt, bundel-upsell direct na betaling ("+2 rapporten
voor € X"), prijsanker "1/4 van de prijs van CARFAX" als sticky element.

**Tracking-events om te bouwen:** plate_search_submitted, lock_clicked,
modal_opened, email_filled, payment_started/success/failed, pdf_downloaded.

---

## 2. Overzicht, score & AI-laag (agent 2)

**Wat gaat fout / mist (top):**
- (H) **AI-kosten onbeheersbaar: geen server-side cache.** Elke bezoeker = 1 à 2
  Claude-calls (~€0,06-0,18). Cache het AI-resultaat per kenteken in MongoDB
  (TTL 7 dagen) en deel tussen alle bezoekers. Geschatte besparing: ~90%.
- (H) **Score is een black box.** Niemand snapt waarom 78. Toon de opbouw:
  "5 gebreken = -12,5 · onderhoudsrisico = -11 · WOK = -16". Bovendien
  dubbeltelt de formule gebreken (direct én via risicoscore) en is de
  WOK-straf te licht (WOK hoort < 40 te scoren).
- (H) Records-banner cap't bevindingen op 5; bij 7 rode vlaggen lieg je dus.
- (M) "Geschatte waarde" toont stilzwijgend óf de AI-waarde óf de formule-waarde
  zonder label welke je ziet.
- (M) De datapunten-teller (28 + 3×inspecties...) is opvulling; maak hem eerlijk.

**AI-kansen (de gebruiker wil AI maximaal):** waarde-uitleg ("waarom dit bedrag:
leeftijd -€2.100, kilometrage -€300, gebreken -€1.200..."), APK-voorspelling per
gebrekstrend, kosten-per-maand-projectie, één-regel-samenvatting in de
records-banner.

---

## 3. Risico-overzicht & schadesignalen (agent 3)

**Wat gaat fout / mist (top):**
- ✅ (H) "Laag risico" stond hardcoded voor élke auto → nu data-gedreven
  (WOK/recall/gebreken/NAP bepalen het snapshot).
- (H) **WAM-verzekerd-status wordt nergens prominent getoond** terwijl we het
  veld hebben; onverzekerd = niet legaal de weg op. → in risico-kaarten.
- (M) Export-indicator en taxi-verleden zijn beschikbaar maar onzichtbaar in
  het risico-overzicht (taxi staat nu wel in Eigendom ✅).
- (M) Eigenaarsaantal-kaart zegt "Stabiel" zonder context (3 eigenaren op een
  2-jarige auto is niet stabiel).
- (M) Geen concrete actiestappen per risico ("controleer X bij bezichtiging").

**Kansen:** dealbreaker-alarm (WOK + export + recente overdracht = groot rood
blok bovenaan), AI-duiding per risicokaart, bezichtigings-checklist gekoppeld
aan de gevonden risico's.

---

## 4. Marktwaarde & onderhandelcoach (agent 4)

**Wat gaat fout / mist (top):**
- (H) **Wegenbelasting-formule is aantoonbaar fout** (gewicht × factor). MRB is
  exact te berekenen met de Belastingdienst-tabellen (gewichtsklasse +
  brandstof + provincie). Klant googlet het en voelt zich bedrogen.
- (H) **Waardetrend-grafiek is verzonnen** (lineair van 165% naar nu) maar oogt
  als historische data. Herlabelen ("indicatieve afschrijvingscurve") of
  vervangen door het echte formule-verloop.
- (H) Onderhandel-bedragen zijn een black box: leg uit waarom startbod X is
  ("90% van marktwaarde minus risico-correctie").
- (M) APK-slaagkans negeert de gebrekenhistorie; trek per gebrek/recall punten af.
- (M) Verzekering/brandstof zijn statische vuistregels; label als "zeer grof" +
  link naar vergelijker (affiliate-kans).
- (M) Vraagprijs-voorinvulling is hardcoded marktwaarde + €900; maak er +3-5% van.
- (M) Valideer de waarde-formule tegen ±50 echte Marktplaats/AutoScout-prijzen
  en stel de merk-offsets bij.

**Kansen:** AI-vraagprijs-duiding in context, reparatiereserve per merk/model
via AI i.p.v. vaste formule, verkopersmotivatie-inschatting.

---

## 5. APK-historie, APK Intelligence & kilometerstand (agent 5)

**Wat gaat fout / mist (top):**
- ✅ (H) "84% verkeersveiligheidsvertrouwen" stond hardcoded → toont nu de echte
  geschatte APK-slaagkans.
- ✅ (H) Kilometertabel/grafiek was leeg → toont nu het formule-verloop met
  bandbreedte, km/jaar en gebruiksprofiel, eerlijk gelabeld.
- (H) **Reparatiekansen en "bekende problemen" zijn nog mock-templates** (op
  leeftijd/merk). Verwijderen of vervangen door echte aggregatie.
- (H) **Kilometer-anomalieën (rollback e.d.) worden berekend maar nooit
  getoond.** Toon waarschuwingsbanner boven de grafiek.
- (H→kans) **RDW-bulk-pipeline**: aggregeer alle keuringen/gebreken per
  merk/model/bouwjaar tot échte slaagkansen en gebrekfrequenties. Dit vervangt
  alle mock-data en is het meest onderscheidende feature van het hele product.
- (M) Gebrekcategorisering (5 emmers) is te grof; reparatiebanden
  (`180 + index×70`) zijn fictie.
- (M) SVG-grafiek heeft vaste breedte 800px; op telefoons knellen de labels.

---

## 6. Eigendom, specs, vergelijking & watch mode (agent 6)

**Wat gaat fout / mist (top):**
- ✅ (H) Eigendomstijdlijn was volledig verzonnen (lease→bedrijf→particulier) →
  nu alleen echte registratiemomenten (eerste toelating, import, laatste
  tenaamstelling) + eerlijke melding dat eigenarenaantal niet openbaar is +
  taxi/WAM-status toegevoegd.
- (H) **Vergelijkingstabel is kapot op mobiel** (geen horizontale scroll).
- (H) Watch mode controleert niets op de achtergrond: gebruiker moet zelf op
  "check" drukken en er zijn geen e-mailnotificaties. Cron-job + mail nodig,
  anders de sectie verbergen.
- (M) Vergelijking: 25+ rijen zonder weging = informatie-overload; bouw een
  gewogen scorecard + dealbreaker-detectie via AI.
- (M) Specs: leg emissienorm uit (milieuzones!), toon kosten-context.
- (M) Verlopen APK-datum in vergelijking toont kale datum zonder waarschuwing.

**Kansen:** vergelijking = natuurlijke bundel-upsell (koper bekijkt meerdere
auto's); watch mode = abonnementsmotor zodra notificaties werken.

---

## 7. PDF-rapport & e-mail (agent 7)

**Wat gaat fout / mist (top):**
- (H) **PDF mist de onderhandelcoach, AI-aandachtspunten en schadesignalen** die
  de klant op de site wél ziet; het downloadproduct is dunner dan het webproduct.
- (H) **Juridische disclaimers ontbreken in PDF en mail**: indicatieve waarde,
  geen aankoopadvies, herroepingsrecht digitale content (download = afzien van
  herroeping; expliciet laten bevestigen bij checkout).
- (H) Download-tracking werkt alleen voor ingelogde gebruikers (= bijna niemand);
  koppel aan betaling i.p.v. sessie.
- (H) E-mail: geen open/click-tracking (Resend-webhooks), geen unsubscribe-header,
  kale HTML zonder branding.
- ✅ (M) Geen voorbeeld-PDF vóór aankoop → RG-513-T-PDF is nu gratis en opent
  inline, met knop op de landing.
- (M) Geen QR/link in de PDF terug naar de webversie; geen bezichtigings-checklist.

---

## Gecombineerde topprioriteiten (advies-volgorde)

| # | Actie | Waarom | Bron |
|---|---|---|---|
| 1 | **Server-side AI-cache per kenteken** (Mongo, TTL 7 dagen) | AI-kosten ~90% omlaag; sneller voor de klant | Agent 2 |
| 2 | **Event-tracking implementeren** (GA4 + Clarity, funnel-events) | Zonder meting valt niets te optimaliseren | Agent 1+2 |
| 3 | **Succes-scherm + bevestigingsmail na betaling** met bundel-upsell | Direct conversie/AOV-effect | Agent 1 |
| 4 | **Exacte MRB-tabellen** (Belastingdienst) | Aantoonbaar foute getallen schaden vertrouwen | Agent 4 |
| 5 | **RDW-bulk-pipeline: echte faalstatistieken per merk/model/bouwjaar** | Vervangt alle mock-data; uniek in de markt | Agent 5 |
| 6 | **Score-opbouw tonen + formule herijken** (WOK zwaarder, geen dubbeltelling) | Geloofwaardigheid van het kerncijfer | Agent 2 |
| 7 | **PDF gelijktrekken met web** (AI-analyse, coach, schadesignalen, disclaimers) | Het betaalde product moet compleet zijn | Agent 7 |
| 8 | **Mock-reparatiekansen/bekende-problemen verwijderen** tot pipeline er is | Eerlijkheidsprincipe | Agent 5 |
| 9 | **Vergelijkingstabel mobiel fixen + gewogen scorecard** | Bundel-upsell-motor | Agent 6 |
| 10 | **Watch mode: cron + e-mailnotificaties of tijdelijk verbergen** | Halve feature schaadt vertrouwen | Agent 6 |
| 11 | Kilometer-anomalieën tonen, WAM/export in risico-overzicht | Quick wins, echte data | Agent 3+5 |
| 12 | Betaalmodal: prijs eerst, methodes tonen, retry bij fout | Checkout-frictie | Agent 1 |

*Reeds gefixt tijdens deze ronde: hardcoded "Laag risico", hardcoded "84%",
verzonnen eigendomstijdlijn, leeg kilometerscherm, schade-diagram, ontbrekend
voorbeeldrapport (PDF + online), em-dashes, sectienavigatie vervangen door
verticaal scrollen, kaart-spacing.*
