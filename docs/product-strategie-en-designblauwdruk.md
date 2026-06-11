# Kentekenrapport — Productstrategie & Designblauwdruk

> Doel van dit document: vastleggen waar we staan, brainstormen over het klantaanbod,
> bepalen hoe we data het meest efficiënt en nauwkeurig inzetten, welke data-API's we
> nog kunnen regelen, en een volledig doordacht design-op-papier voor de hele flow
> (gratis vs. betaald, per apparaat, per sectie, tot in detail).
>
> Kernscenario: iemand wil een tweedehands auto kopen → komt op de site → voert het
> kenteken in → ziet gratis basisinfo → koopt voor meer diepgang het volledige rapport
> → gaat met een gerust hart naar de bezichtiging, kent alle problemen en betaalt de
> juiste prijs.

---

## Deel 1 — Waar we staan (inventaris, juni 2026)

### 1.1 Wat er al gebouwd is

| Onderdeel | Status |
|---|---|
| Next.js + MongoDB platform, NL/EN i18n | ✅ Werkend |
| RDW-lookup: 7 datasets parallel + gebrekbeschrijvingen, 24u cache + background revalidation | ✅ Werkend |
| 12 voertuigschermen: Overzicht, Tech specs, Risico, APK-tijdlijn, Schade, Eigendom, Kilometerstand, Markt, Vergelijking, Onderhandelcoach, APK Intelligence, Watch mode | ✅ Gebouwd |
| PremiumLock + admin-instelbare lock-secties | ✅ Werkend |
| Betaling: PayPal, €9,95 per kenteken (eenmalig, opgeslagen in `PlatePayment`) | ✅ Werkend (alleen PayPal) |
| Claude AI: waardering, inzichten (BUY/CONSIDER/CAUTION/AVOID), vergelijking, onderhandelscript | ✅ Werkend |
| PDF-rapport + vergelijkings-PDF | ✅ Gebouwd |
| Admin: login, users, CMS-pagina's, site-settings, lock-config | ✅ Gebouwd |
| Useraccounts, opgeslagen voertuigen, watch mode | ✅ Gebouwd |
| Imagin.studio voertuigafbeeldingen, Leaflet-garagekaart | ✅ Werkend |

### 1.2 Eerlijke gap-analyse: wat is écht, wat is heuristiek, wat is nep

Dit is de belangrijkste tabel van het document. De klant betaalt voor **accuraatheid**;
alles in kolom "Mock" ondermijnt het product als we het als feit presenteren.

| Datapunt | Bron nu | Kwaliteit |
|---|---|---|
| Merk, model, bouwjaar, kleur, gewichten, motor, APK-vervaldatum | RDW open data | ✅ Echt |
| APK-historie + gebreken + gebrekomschrijvingen | RDW open data | ✅ Echt |
| NAP-tellerstandoordeel (logisch/onlogisch) | RDW (`tellerstandoordeel`) | ✅ Echt |
| Terugroepacties | RDW | ✅ Echt |
| Aantal eigenaren, WOK, export, verzekerd-vlag, catalogusprijs | RDW | ✅ Echt |
| Kilometerschatting + anomaliedetectie (regressie op APK-standen) | Eigen statistiek op RDW-data | 🟡 Degelijk, maar dunne data (alleen APK-punten) |
| Marktwaarde (computeMarketValueV3) | Eigen afschrijvingsmodel + merk-offsets | 🟡 Indicatief; merk-offsets zijn aannames, niet gevalideerd tegen echte verkoopprijzen |
| Wegenbelasting | Grove formule (gewicht × factor) | 🔴 Onnauwkeurig — terwijl dit **exact berekenbaar** is |
| APK-slaagkans (85% − leeftijd − import) | Heuristiek | 🔴 Te grof — terwijl echte statistiek uit RDW-bulk te bouwen is |
| Verzekering / brandstofkosten per maand | Vuistregels, vaste prijzen | 🟡 Indicatief, prijzen verouderen |
| Reparatiekansen ("75% kans remmen") | **Mock-templates op leeftijd** | 🔴 Nep |
| Bekende problemen ("olieverbruik TFSI") | **Mock-templates op merk** | 🔴 Nep |
| Eigenaarstypes in tijdlijn (lease → bedrijf → particulier) | **Verzonnen cyclus** | 🔴 Nep — alleen het áántal is echt |
| Schadehistorie-scherm | APK-gebreken vermomd als "schade-events" | 🔴 Misleidend label — echte schadedata ontbreekt |
| "Hoge vraag in de markt", "roadworthiness 84%", herotekst risico | Hardcoded | 🔴 Nep |
| Waardetrend-grafiek (5 jaar) | Lineaire interpolatie, niet historisch | 🟡 Indicatief, moet als zodanig gelabeld |

### 1.3 Technische/operationele losse eindjes

1. **`canSkipPaymentForDemo = true`** hardcoded in `SubscriptionModal.tsx` en het
   onbeveiligde `POST /api/payments/access/[plate]` demo-endpoint geven iedereen gratis
   premium-toegang. **Moet dicht vóór livegang.**
2. **`data/0000202250Taxionspot02_20260311.pfx`** — een certificaat (private key) staat
   in git. Direct uit de repo halen, intrekken/herinstalleren, en in secret storage
   zetten. (Als dit een RDW-zakelijk certificaat is: goed nieuws, zie §3.2 — dan hebben
   we mogelijk al een ingang voor betaalde RDW-diensten.)
3. Sectie-keys kloppen niet overal: Onderhandelcoach lockt op `marketAnalysis`,
   APK Intelligence op `riskOverview`, Watch mode op `ownershipHistory`. Eigen keys geven.
4. Betaaltoegang leeft client-side in een sessie-`Set`; na refresh is betaalde toegang
   weg tenzij de server-check wordt gebruikt. Toegang moet server-side afgedwongen
   worden (de API moet premium-velden pas teruggeven ná betaling, anders staat alle
   data gewoon in de JSON-response).
5. Alleen PayPal. **iDEAL is in Nederland ~70% van de online betalingen** — zonder
   iDEAL (via Mollie) lekt de funnel het hardst op het allerlaatste scherm.
6. Claude geeft een hard koopadvies (BUY/AVOID). Juridisch risico + bij mock-data eronder
   is dat advies niet te verantwoorden. Herformuleren naar "aandachtspunten /
   bevindingen" met disclaimer.

---

## Deel 2 — Het aanbod aan de klant

### 2.1 Productprincipe

**Wij verkopen geen data, wij verkopen een gerust hart en een betere deal.**
De koper heeft drie vragen:

1. *Klopt deze auto?* (verborgen gebreken, teruggedraaide teller, schade, import, recalls)
2. *Is de prijs eerlijk?* (marktwaarde vs. vraagprijs, vaste lasten)
3. *Wat doe ik nu?* (waar op letten bij bezichtiging, hoe onderhandelen)

Elk scherm, elke sectie en elke euro die we vragen moet aan één van die drie vragen
hangen. Alles wat daar niet aan bijdraagt is decoratie.

Tweede principe: **eerlijkheid als feature**. Elke waarde krijgt een bronlabel:

- 🟢 **RDW-geverifieerd** — officiële overheidsdata
- 🔵 **Berekend** — onze statistiek op officiële data (met uitleg + betrouwbaarheid)
- ⚪ **Indicatief** — schatting, expliciet als schatting getoond

Geen enkel verzonnen datapunt meer in het rapport. Dit is tegelijk ons
onderscheidend vermogen ("Evidence Graph" uit het feature-voorstel): concurrenten
tonen tabellen, wij tonen tabellen **mét bewijs en betrouwbaarheid**.

### 2.2 Gratis vs. betaald (herziene verdeling)

Strategie: **gratis genoeg om te vertrouwen, betaald alles wat een beslissing of
onderhandeling waard is.** De gratis laag moet beter zijn dan elke concurrent
(verkeer + vertrouwen + SEO), de betaalde laag moet de vraag "is €9,95 het waard bij
een aankoop van €15.000?" belachelijk maken.

**Gratis (geen account):**
- Voertuigidentiteit: merk, model, uitvoering, bouwjaar, kleur, brandstof, carrosserie
- Technische specs (volledig — is toch openbaar; goed voor SEO en vertrouwen)
- APK-status: geldig tot + laatste uitslag
- NAP-tellerstandoordeel (het oordeel, niet de grafiek)
- Aantal eigenaren (het getal, niet de tijdlijn)
- Open terugroepactie: **ja/nee** (veiligheid gratis tonen is ook ethisch juist; detail betaald)
- Rode-vlaggen-teaser: "Wij vonden **3 aandachtspunten** bij deze auto" (welke = betaald)
- Rapport-score (het cijfer, niet de opbouw)

**Betaald — Volledig Rapport (per kenteken):**
- Volledige APK-historie met alle gebreken, terugkerende defecten, slaagkans-statistiek
- Kilometertijdlijn + regressie + anomalies (rollback-detectie)
- Schade-signalen (eerlijk gelabeld; later: echte schadedata, zie §3)
- Eigendomstijdlijn (alleen echte data + duidelijk gelabelde inschattingen)
- Marktwaarde + bandbreedte + vraagprijs-check
- Vaste lasten: exacte MRB, verzekeringsindicatie, brandstofkosten
- Model-specifieke APK-faalstatistiek (echte data, zie §3.1.2)
- AI-samenvatting + aandachtspuntenlijst
- Onderhandelcoach (biedrange, walk-away, gesprekspunten, script)
- **Bezichtigings-checklist op maat** (nieuw, zie §2.4)
- PDF-download + e-maillevering
- 14 dagen toegang + gratis her-check binnen die periode

### 2.3 Prijsmodel (voorstel)

| Product | Prijs | Rationale |
|---|---|---|
| **1 rapport** | **€9,95** | Huidige prijs; ankerproduct. Concurrentie zit €4,95–€20. |
| **3 rapporten (bundel)** | **€19,95** | Dé slimme zet: een serieuze koper bekijkt 3–8 auto's. Bundel verhoogt orderwaarde +100% en maakt de vergelijkingsfunctie het verkoopargument. |
| **Vergelijking 2 kentekens** | inbegrepen bij 2+ credits | Vergelijkscherm = bundel-upsell. |
| **Dealer/handelaar-abonnement** | €29/mnd (20 rapporten) / €79/mnd (onbeperkt) | Bestaande README-tiering; B2B later activeren. |
| **Watch mode (na aankoop)** | gratis bij rapport | Retentie + e-mailadres + reden om terug te komen (recall-alerts → nieuwe aankoopcyclus). |

Betaling: **Mollie met iDEAL als eerste knop**, PayPal/kaart als tweede. Eén klik,
geen verplicht account: e-mail invullen → betalen → rapport open + linkje per mail
(de mail is meteen het account-zaadje: "zet een wachtwoord en bewaar je rapporten").

### 2.4 Nieuwe aanbod-ideeën (gerangschikt op waarde/moeite)

1. **Bezichtigings-checklist op maat** (laag effort, hoge waarde): genereer per auto een
   afvinklijst voor bij de bezichtiging op basis van het rapport — terugkerende
   APK-gebreken ("controleer handrem, 2× afgekeurd"), leeftijdspunten (distributieriem),
   recall-status, NAP-twijfel ("vraag onderhoudsboekje"). Mobielvriendelijk + in PDF.
   Dit is het moment waarop de klant óp de parkeerplaats ons rapport in z'n hand heeft.
2. **Vraagprijs-check als landingstool**: invoerveld "vraagprijs" naast kenteken →
   gratis verdict "redelijk/te duur" in grove banden, exacte bandbreedte betaald.
   Sterke share-bare hook en SEO-magneet.
3. **Recall-alert gratis voor altijd** (e-mail per kenteken): kost niets (RDW-data),
   bouwt mailinglijst, ethisch sterk verhaal.
4. **Aankoopkeuring-doorverwijzing** (affiliate): "Wil je zekerheid? Boek een fysieke
   aankoopkeuring" → ANWB/BOVAG-partner. Wij verdienen aan de lead, klant krijgt het
   sluitstuk dat data nooit kan geven. Zelfde voor verzekeringspremie (Independer-achtig)
   en garantiepakketten.
5. **APK-garage-vinder** hebben we al (RDW erkende bedrijven + kaart) — koppelen aan
   "APK verloopt over 2 maanden" in het rapport.
6. **Verkopersrapport** (tweede doelgroep!): dezelfde data, andere framing — "onderbouw
   je vraagprijs met een officieel rapport". Particuliere verkoper deelt link naar
   (door koper te verifiëren) rapport. Latere fase, maar het dubbelt de markt.

---

## Deel 3 — Datastrategie: nauwkeuriger zonder en mét nieuwe API's

### 3.1 Fase A — Quick wins met data die we al (gratis) hebben

Deze vier acties verhogen de accuraatheid het meest, kosten geen externe contracten,
en ruimen tegelijk alle "nep"-rijen uit §1.2 op:

**3.1.1 Exacte wegenbelasting (MRB).**
MRB is deterministisch berekenbaar uit gewicht + brandstof + provincie (tarieftabellen
Belastingdienst, jaarlijks bijwerken als statische tabel in de repo). Vraag in de UI
de provincie (dropdown, default Zuid-Holland) en toon het **exacte kwartaalbedrag**
i.p.v. de huidige grove formule. Label verandert van ⚪ naar 🟢.

**3.1.2 Echte APK-faalstatistiek per merk/model/bouwjaar.**
De RDW-datasets (gekeurde voertuigen + geconstateerde gebreken) zijn als bulk te
downloaden. Bouw een maandelijkse offline pipeline (script + cron):
`merk × model × bouwjaar → slaagpercentage, top-10 gebreken met frequentie, gemiddelde km`.
Sla het geaggregeerd op in Mongo (`model_stats` collectie). Daarmee vervangen we:
- de nep "APK-slaagkans 85%-formule" → echte slaagkans van dít model/bouwjaar
- de nep "bekende problemen"-templates → "bij 23% van de Golf 1.4 TSI uit 2018 werd
  de afgelopen 3 jaar een remgebrek geconstateerd (landelijk gemiddelde: 14%)"
- de nep "reparatiekansen" → gebrekfrequenties met eerlijke kostenbanden ("indicatief")

Dit is **het** differentiërende feature ("APK Failure Intelligence" uit het voorstel)
en niemand in de markt doet het, terwijl de databron gratis is.

**3.1.3 Eigendomstijdlijn eerlijk maken.**
Stop met verzonnen eigenaarstypes. Toon: aantal eigenaren (echt), datum laatste
tenaamstelling (`datum_tenaamstelling`, echt), eerste registratie (echt), importdatum
(echt). De rest weglaten of expliciet als "geschatte verdeling" arceren. Korte
eigendomsduur-waarschuwing alleen tonen als die uit echte datums volgt.

**3.1.4 Schade-scherm herlabelen.**
Tot er een echte schadebron is: noem het "Schadesignalen" en toon eerlijk wat we wél
weten: WOK-status (echt!), afgekeurde APK's met structurele gebreken, importgeschiedenis,
NAP-anomalieën. Eén zin: "Volledige schadehistorie van verzekeraars is in Nederland niet
openbaar; dit zijn de officiële signalen." → eerlijkheid verkoopt en beschermt juridisch.

Daarnaast goedkope verrijkingen uit RDW-velden die we al binnenkrijgen maar niet tonen:
**maximale trekgewichten** (caravan-kopers!), WLTP-verbruik, zuinigheidsclassificatie,
taxi-verleden (hebben we al als vlag — prominenter tonen, het is een klassieke rode vlag).

### 3.2 Fase B — Te regelen externe data-API's (prioriteitsvolgorde)

| # | Bron | Wat het toevoegt | Toegang | Kosten (indicatie) | Prioriteit |
|---|---|---|---|---|---|
| 1 | **RDW Zakelijk / NAP-tellerstanden** (evt. via VWE of RDC) | Volledige kilometerhistorie (alle registratiemomenten, niet alleen APK) → kilometergrafiek wordt 🟢 i.p.v. 🔵 | RDW-erkenning + certificaat — **let op: er ligt al een Taxionspot-.pfx in de repo; check of er al een RDW-zakelijk relatie is** | ~€0,20–0,50/query | **Hoog — dé kern van het rapport** |
| 2 | **Mollie** (geen data, wel omzet) | iDEAL-betalingen | Account aanmaken | ~€0,29/transactie | **Hoog — direct doen** |
| 3 | **VWE voertuigdata** | Uitvoering/opties, importhistorie, schadeverleden-indicatoren, koerslijst-waarde | Commercieel contract (vwe.nl) | per query, custom | Hoog |
| 4 | **Marktprijzen/comparables** — AutoScout24/Marktplaats partner-API, of Indicata/Autotelex koerslijst | Echte marktwaarde + actuele vergelijkbare advertenties ("12 vergelijkbare auto's, mediaan €14.250") → vraagprijs-check wordt hard | Partnercontract; alternatief: eigen comparables-pipeline | custom / scraping-risico afwegen | **Hoog — grootste waarde-upgrade voor de prijsvraag** |
| 5 | **CARFAX Europe / autoDNA** | Buitenlandse historie van importauto's (schade, km, taxi in DE/BE/…) | B2B API | ~€1–3/rapport | Middel — alleen automatisch afnemen bij importvlag (kostenefficiënt: ~20% van de auto's) |
| 6 | **VbV / gestolen-voertuigenregister** | Gestolen-status | Convenant/partner | custom | Middel |
| 7 | **Verzekeringspremie-API** (Independer/Rolls/partner) | Echte premie-indicatie i.p.v. vuistregel + affiliate-omzet | Affiliate-programma | gratis (commissie) | Middel |
| 8 | **Brandstofprijzen** (CBS/UnitedConsumers-feed) | Actuele literprijzen voor kostenraming | Open/feed | gratis | Laag (klein, snel) |
| 9 | **Milieuzone-data** (NDW/gemeenten, open data) | "Mag deze diesel de stad in t/m 2030?" — uniek beslispunt voor dieselkopers | Open data | gratis | Middel — goedkoop en onderscheidend |
| 10 | **TecAlliance/Autodata onderhoudsdata** | Echte onderhoudsschema's en -kosten | Licentie | duur | Laag (later) |

Kostenbeheersing: premium-bronnen **lazy** bevragen — pas ná betaling, en cache het
resultaat permanent bij het rapport (snapshot in `Report`-document zoals de README al
voorzag). Importchecks (CARFAX) alleen bij import-vlag. Zo blijft de marge per rapport
van €9,95 ruim boven €8 zelfs met NAP + VWE erbij.

### 3.3 AI-inzet (efficiënt en verantwoord)

- AI **vertaalt** data naar taal; AI **verzint** geen data. Prompt krijgt uitsluitend
  geverifieerde velden + bronlabels, en de output mag alleen daarnaar verwijzen.
- Verdict afzwakken: geen BUY/AVOID maar "X aandachtspunten, waarvan Y zwaarwegend" +
  standaard disclaimer ("geen aankoopadvies; laat bij twijfel een aankoopkeuring doen").
- Cache AI-output per kenteken+datadigest (zelfde data → zelfde samenvatting, geen
  dubbele tokens). Genereer asynchroon direct na betaling, niet bij paginaweergave.
- Onderhandelscript en vergelijkingsanalyse zijn de twee plekken waar AI écht
  meerwaarde heeft — behouden en aanscherpen met echte comparables zodra bron #4 er is.

---

## Deel 4 — Designblauwdruk (het "design op papier")

### 4.1 Leidend principe: de beslis-trechter

De volgorde van informatie = de volgorde waarin een koper beslist. Van boven naar
beneden, op elk apparaat:

1. **Identiteit** — "is dit de auto uit de advertentie?" (foto, merk/model/jaar, kenteken)
2. **Verdict** — score + stoplicht + de 3 belangrijkste bevindingen
3. **Rode vlaggen** — NAP-oordeel, WOK, recall, import, taxi (de dealbreakers)
4. **Geld** — marktwaarde vs. vraagprijs, vaste lasten per maand
5. **Bewijs** — APK-historie, kilometergrafiek, eigendom, schade-signalen (de diepte)
6. **Actie** — checklist bezichtiging, onderhandelcoach, PDF, vergelijk met andere auto
7. **Vervolg** — watch mode, aankoopkeuring boeken, verzekering checken

Regel: **dealbreakers nooit achter de vouw op mobiel.** Iemand die bij een auto staat
moet binnen 5 seconden zien of er een rode vlag is.

### 4.2 Architectuurkeuze: van 11 subpagina's naar één scrollend rapport

**Huidige situatie:** 11 losse subpagina's met pill-navigatie; premium-locks per pagina.
**Probleem:** voelt als een paywall-doolhof (elke klik → nieuwe lock), fragmenteert het
verhaal, en mobiel is "wat zit waar?" onvindbaar. Conversie-onderzoek bij rapporten
(carVertical, CARFAX) laat consistent één lange pagina zien.

**Voorstel:** één scrollende rapportpagina met sticky anker-navigatie (de bestaande
pills hergebruiken als anchor-links). De subpagina-routes blijven bestaan als
deep-links (SEO + delen) en scrollen naar de sectie. Locks worden **secties in de
scroll** die hun structuur tonen met geblurde echte data (PremiumLock bestaat al en
doet dit al goed) — de gebruiker scrollt dus langs álles wat hij krijgt, en ziet
steeds dezelfde ene prijs.

### 4.3 Wireframe — mobiel (de primaire doelgroep: koper staat bij de auto)

```
┌─────────────────────────────┐
│ ☰  KENTEKENRAPPORT      NL▾ │  ← compacte header, 48px
├─────────────────────────────┤
│ [NL][ 16-RSL-9 ]  [auto-img]│  ← geel kentekenplaat-element + foto
│ Volkswagen Golf 1.4 TSI     │
│ 2018 · Benzine · 92kW       │
├─────────────────────────────┤
│   ◐ SCORE 78/100  "Degelijk"│  ← gauge + één-woord-verdict
│   🟢 NAP logisch            │  ← 3 belangrijkste bevindingen,
│   🟠 1 open terugroepactie  │     altijd boven de vouw
│   🟢 Geen WOK-registratie   │
├─────────────────────────────┤
│ ▸Overzicht ▸APK ▸Km ▸Markt… │  ← sticky anker-pills (horiz. scroll)
├─────────────────────────────┤
│ SECTIE: Rode vlaggen (gratis│
│  samenvatting, detail blur) │
│ SECTIE: Geld 🔒             │  ← blur + "Marktwaarde €1▓.▓50"
│ SECTIE: APK-historie 🔒     │     (eerste regel half leesbaar:
│ SECTIE: Kilometerstand 🔒   │      nieuwsgierigheid > frustratie)
│ SECTIE: Eigendom (gratis)   │
│ SECTIE: Specs (gratis)      │
│ SECTIE: Acties 🔒           │
├─────────────────────────────┤
│ █ Ontgrendel rapport €9,95 █│  ← sticky bottom-CTA, verdwijnt
└─────────────────────────────┘     na aankoop, wordt "Download PDF"
```

Mobiele detailregels:
- Sticky bottom-CTA met iDEAL-logo; één prijs, geen keuzestress op mobiel
  (bundel-upsell komt ná de eerste betaalklik in de checkout: "+2 rapporten voor €10").
- Secties zijn accordions ná de eerste twee (Rode vlaggen en Geld staan open).
- Grafieken full-width, horizontaal scrollbaar waar nodig; tabellen worden
  key-value-kaarten (geen geknepen kolommen).
- Checklist-sectie heeft een "open als checklist"-knop → fullscreen afvinkmodus
  (grote tap-targets, werkt offline na laden — voor op de parkeerplaats).

### 4.4 Wireframe — desktop (≥1024px)

```
┌──────────────────────────────────────────────────────────────────┐
│ KENTEKENRAPPORT          [ ander kenteken zoeken ]        NL▾ ⚙  │
├──────────────────┬───────────────────────────────────────────────┤
│ STICKY LINKS     │  SCROLLENDE RAPPORTKOLOM                      │
│ (320px)          │                                               │
│ [NL] 16-RSL-9    │  ── Rode vlaggen ───────────────────────────  │
│ [voertuigfoto]   │  🟢 NAP logisch  🟠 recall  🟢 geen WOK ...    │
│ Golf 1.4 TSI '18 │                                               │
│                  │  ── Geld 🔒 ────────────────────────────────  │
│ ◐ 78/100         │  marktwaarde · vraagprijs-check · lasten      │
│ "Degelijke koop" │                                               │
│                  │  ── Bewijs ─────────────────────────────────  │
│ ✓ 12 checks ok   │  APK-tijdlijn 🔒 · km-grafiek 🔒 ·            │
│ ⚠ 3 aandachts-   │  eigendom · schade-signalen 🔒                │
│   punten         │                                               │
│                  │  ── Acties 🔒 ──────────────────────────────  │
│ ┌──────────────┐ │  checklist · onderhandelcoach · vergelijk     │
│ │ ONTGRENDEL   │ │                                               │
│ │   €9,95      │ │  ── Specs (gratis) ─────────────────────────  │
│ │ [iDEAL][PP]  │ │  accordions                                   │
│ └──────────────┘ │                                               │
│ anker-navigatie  │  ── Vervolg ────────────────────────────────  │
│ • Rode vlaggen   │  watch mode · aankoopkeuring · verzekering    │
│ • Geld           │                                               │
│ • Bewijs ...     │                                               │
└──────────────────┴───────────────────────────────────────────────┘
```

Desktopregels:
- **Links sticky**: identiteit + score + CTA + anker-nav. Dit paneel is óók de
  PDF-voorpagina en de social-share-card — één visueel systeem overal.
- Rechterkolom max-width ~760px voor leesbaarheid; grafieken mogen breder uitklappen.
- Vergelijkingsmodus: linkerpaneel splitst in twee auto-kaarten, rechterkolom wordt
  de vergelijkingstabel (bestaand scherm hergebruiken).
- Tablet (768–1024): linkerpaneel wordt een niet-sticky hero-band bovenaan, daarna
  zelfde flow als mobiel met sticky top-CTA i.p.v. bottom.

### 4.5 De gratis→betaald-overgang (de conversiekern)

1. **Toon de structuur, blur de waarden.** Huidige PremiumLock-blur behouden, maar per
   sectie 1 regel half-leesbaar maken ("Marktwaarde: €1▓.▓50 – €▓▓.▓00"). Niets is zo
   overtuigend als bijna-zichtbare echte data van déze auto.
2. **Eén prijs, overal hetzelfde.** Elke lock toont "€9,95 — ontgrendelt het hele
   rapport voor dit kenteken", nooit per-feature-prijzen.
3. **Teller in de gratis laag:** "Het volledige rapport bevat 47 gecontroleerde
   datapunten, waarvan 9 met bevindingen" — concreet, eerlijk, telbaar.
4. **Voorbeeldrapport-link** in header en bij elke lock ("bekijk een voorbeeld") —
   een vast demo-kenteken, volledig ontgrendeld, met "VOORBEELD"-watermerk.
5. **Checkout in modal** (bestaat), nieuwe volgorde: e-mail → iDEAL (groot) → PayPal →
   betalen → secties ontgrendelen **in-place zonder reload** + confetti-moment op de
   score → mail met permanente rapportlink + PDF.
6. **Na aankoop verandert de CTA** in "Download PDF · Bekijk checklist · Vergelijk met
   2e auto (+€10 voor 2 extra rapporten)" — de upsell komt pas ná de eerste conversie.

### 4.6 Landing page (homepagina)

Volgorde van boven naar beneden (mobiel = zelfde volgorde, gestapeld):

1. **Hero**: één zin ("Koop je volgende auto niet blind") + kentekeninvoer als geel
   NL-plaatje (groot, autofocus, format-as-you-type, foutmelding vóór submit) +
   optioneel vraagprijsveld ("check direct of de prijs klopt"). Geen andere CTA's.
2. **Trust-strip**: "Officiële RDW-data · X rapporten gegenereerd · iDEAL · 14 dagen toegang".
3. **Voorbeeldrapport-kaart**: screenshot + knop "bekijk voorbeeldrapport".
4. **Drie waardeblokken** = de drie kopersvragen (Klopt de auto? / Klopt de prijs? /
   Wat nu?) — niet zes generieke features.
5. **Hoe het werkt** (3 stappen, bestaat al).
6. **Prijs, klip en klaar**: €9,95 / 3 voor €19,95 — geen abonnement-verstoppertje.
7. FAQ (SEO: "kenteken check gratis", "kilometerstand controleren", "auto importeren
   checken") + footer.

### 4.7 Schermdetails per sectie (rapportpagina)

| Sectie | Boven/onder | Vrij/betaald | Belangrijkste designbeslissing |
|---|---|---|---|
| Identiteit + score | Altijd bovenaan / sticky links | Gratis | Score met één-woord-verdict en "waarom"-popover (opbouw zichtbaar = vertrouwen) |
| Rode vlaggen | Direct onder score | Samenvatting gratis, detail betaald | Stoplicht-chips; nooit meer dan 5; elk chip → anchor naar bewijssectie |
| Geld | Sectie 2 | Betaald (gratis: grove indicatie "€12k–€16k") | Vraagprijs-invoer met meter (bestaat) prominent; provincie-selector voor exacte MRB |
| APK-historie | Bewijsblok 1 | Betaald | Tijdlijn (bestaat); terugkerende gebreken rood gemarkeerd; model-statistiek ernaast ("dit model faalt 23% vaker op remmen") |
| Kilometerstand | Bewijsblok 2 | Betaald | Grafiek (bestaat) + NAP-oordeel-badge 🟢; anomalies als annotaties ín de grafiek |
| Schade-signalen | Bewijsblok 3 | Betaald | Eerlijk gelabeld (§3.1.4); WOK groot als aanwezig |
| Eigendom | Bewijsblok 4 | Gratis (is dun) | Alleen echte data; "datum laatste tenaamstelling" toevoegen |
| Specs | Onderaan | Gratis | Accordions (bestaat); trekgewicht toevoegen |
| Acties (checklist/coach) | Na bewijs | Betaald | Checklist krijgt eigen fullscreen-modus; coach toont biedrange-staafdiagram (bestaat) |
| Vervolg (watch/keuring/verzekering) | Allerlaatst | Gratis/affiliate | Watch mode als cadeau na aankoop framen |

### 4.8 Responsive regels (samengevat)

- **Breakpoints**: <768 één kolom + sticky bottom-CTA; 768–1024 één kolom + hero-band +
  sticky top-CTA; >1024 twee kolommen met sticky linkerpaneel.
- **Scrollen is oké, klikken is duur**: alles in één verticale flow; navigatie is
  versnelling (ankers), nooit vereiste.
- **Touch targets ≥44px**, grafieken pinch-zoomvrij (statisch, leesbaar gerenderd).
- **Performance**: gratis deel server-side gerenderd <1s (SEO + bounce); zware
  grafieken lazy-loaden onder de vouw; AI-content streamt asynchroon binnen met
  skeleton ("Claude analyseert…" bestaat al).
- **PDF spiegelt de webvolgorde** exact — herkenbaarheid van scherm naar print.

---

## Deel 5 — Concreet stappenplan

**Sprint 1 — Vertrouwen & geld (de basis op orde):**
1. Demo-bypass dicht (`canSkipPaymentForDemo`, demo-endpoint) + .pfx uit git + key-rotatie
2. Server-side gating van premium-velden in de API
3. Mollie + iDEAL naast PayPal; e-mail-rapportlink na betaling
4. Mock-data eruit of eerlijk labelen (§3.1.3, §3.1.4, repair/known-issues templates)
5. Exacte MRB-tabellen (§3.1.1); sectie-keys fixen

**Sprint 2 — Accuraatheid als product:**
6. RDW-bulk-pipeline → echte model-statistieken (§3.1.2) in APK Intelligence + checklist
7. Bronlabels (🟢/🔵/⚪) door het hele rapport
8. Bezichtigings-checklist v1
9. AI-verdict herformuleren + output-cache

**Sprint 3 — Conversieflow:**
10. Eén-pagina-rapport met anker-nav + sticky CTA (mobiel/desktop volgens §4.3/4.4)
11. Voorbeeldrapport + landing-herstructurering (§4.6)
12. Bundel-pricing (3 voor €19,95) + post-purchase upsell

**Parallel (zakelijk):** RDW-zakelijk/NAP-aanvraag starten (checken of de bestaande
Taxionspot-erkenning bruikbaar is), gesprek met VWE, marktprijzen-bron kiezen,
affiliate-aanmeldingen (verzekering/aankoopkeuring).

---

*Laatste update: 11 juni 2026 — opgesteld als brainstorm- en ontwerpdocument; nog geen
implementatie-commitment per item.*
