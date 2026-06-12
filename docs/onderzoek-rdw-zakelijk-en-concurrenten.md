# Onderzoek: RDW Zakelijk, CARFAX & carVertical (concurrentie-analyse)

> Vervolg op `product-strategie-en-designblauwdruk.md`. Aanleiding: reactie van RDW
> (Unit IV, juni 2026) op onze aanvraag, VWE die niet reageert, en de vraag wat
> CARFAX en carVertical bieden dat wij niet hebben — en hoe wij hetzelfde niveau
> kunnen uitstralen.

---

## 1. RDW Zakelijk / OVI-zakelijk — is het de moeite waard?

### Wat RDW zelf zegt (e-mail Unit IV)
- XML-koppeling vereist een apart certificaat en aansluitkosten + tarief per bevraging.
- "Er zijn maar weinig klanten die gebruik maken van deze service" en het is
  "niet duidelijk hoelang deze dienst nog blijft bestaan".
- RDW verwijst zelf naar de gratis Open Data als beter alternatief.
- **"Volledige tellerstanden mogen we niet verstrekken."**

### Wat OVI-zakelijk toevoegt boven gratis open data
Uit de RDW-dienstbeschrijving en derden-bronnen:

| Gegeven | In gratis open data? | In OVI-zakelijk? |
|---|---|---|
| Aantal eigenaren/houders | ❌ (geen veld) | ✅ |
| Gestolen-indicator | ❌ | ✅ |
| Exportstatus (tot 2 jr na export) | deels (`export_indicator` actueel park) | ✅ |
| Tellerstanden (volledige historie) | ❌ | ❌ **nergens verkrijgbaar** |
| Alle technische data, APK, NAP-oordeel, recalls, WOK, catalogusprijs | ✅ | ✅ (zelfde) |

### Verdict: **niet doen (nu)**
1. Het enige dat we echt missen is **aantal eigenaren** en **gestolen-status**.
2. De XML-variant heeft aansluitkosten voor een dienst waarvan RDW zelf zegt dat die
   mogelijk verdwijnt; de web-variant is handmatig en niet te automatiseren.
3. De data die het rapport écht sterker zou maken (tellerstanden) zit er toch niet in.

**Alternatieven per ontbrekend veld:**
- *Aantal eigenaren*: open data heeft wél `datum_tenaamstelling` (laatste overdracht)
  en `datum_eerste_tenaamstelling_in_nederland`. Toon die feiten. Het exacte aantal
  laten we weg tot er een betaalbare bron is — eerlijker dan schatten.
- *Gestolen-status*: partnerschap met VbV / stolencars.nl (zelfde route die
  concurrenten gebruiken); lagere prioriteit.
- Heroverwegen zodra klanten expliciet om eigenarenhistorie vragen — dan web-based
  OVI-zakelijk per query (geen vaste kosten) of een reseller (RDC) als VWE blijft zwijgen.

### ⚠️ Codebevinding tijdens dit onderzoek
- `lib/rdw/mapper.ts` leest `m.aantal_houders` — dat veld bestaat niet in de open
  data → de "Eigenaren"-teller in de UI is vrijwel zeker altijd leeg. Verifiëren en
  de UI hierop aanpassen (datums tonen i.p.v. aantal).
- `MileageTimelineScreen` parseert `tellerstand`/`km_stand` uit APK-records, maar de
  open APK-datasets bevatten **geen kilometerstanden** → de kilometergrafiek heeft
  geen echte datapunten. Het hele scherm moet herontworpen worden rond wat wél bestaat
  (zie §2).
- Check ook de dataset-IDs: a34c-vvps wordt door RDW als "Geconstateerde Gebreken"
  geafficheerd en "Meldingen Keuringsinstantie" als `sgfe-77wx` — onze labels
  `apk`/`defects` mogelijk verwisseld.

---

## 2. Kilometerstanden: niemand heeft ze — maak daar een feature van

**Feit:** RDW/NAP-tellerstanden mogen aan niemand commercieel worden verstrekt. Ook
CARFAX en carVertical hebben ze dus **niet** voor Nederlandse auto's — Nederlandse
reviews van carVertical klagen precies daarover ("geen NAP-data", "onbetrouwbare
kilometerstanden", "total loss gemist").

Wat er wél is:
1. **NAP-tellerstandoordeel** (logisch/onlogisch) + jaar laatste registratie — gratis
   open data, hebben we al. Dit prominent en uitgelegd tonen.
2. **Sinds 13-1-2025** registreert RDW ook Belgische tellerstanden bij import uit BE
   (het oordeel dekt dan ook de BE-periode).
3. **Het gratis RDW-Voertuigrapport**: de *eigenaar* kan via DigiD kosteloos een
   officieel rapport met álle tellerstanden opvragen.

**Productkans (uniek, kost geen API):** een stap in ons rapport —
*"Vraag de verkoper om het gratis RDW-tellerrapport (DigiD, 2 minuten). Weigert hij?
Dat is zelf een rode vlag. Upload of vul de standen hier in en wij toetsen ze op
consistentie met de APK-data en het NAP-oordeel."*
Zo krijgen wij geverifieerde kilometerdata die geen enkele concurrent via API kan
kopen, en de weigering van een verkoper wordt zelf een signaal in het rapport.

---

## 3. CARFAX Europe — wat bieden zij dat wij niet hebben?

| Aspect | CARFAX | Wij |
|---|---|---|
| Prijs | ~€19,99 (EU-auto) tot ~€39,99 (met VS-historie); bundels ±3/€50, 5/€75 | €9,95 (voorstel: 3/€19,95) |
| Buitenlandse historie | ✅ 20+ EU-landen + VS/Canada: schade, km, registraties vóór import | ❌ |
| Schade buitenland (incl. schadefoto's VS) | ✅ | ❌ |
| Gestolen-check internationaal | ✅ | ❌ |
| Eigenarenhistorie | ✅ (aantal + type) | ❌ (zie §1) |
| NL APK-historie, NAP-oordeel, recalls, WOK | hooguit gelijk aan ons | ✅ dieper (gebreken + omschrijvingen) |
| Marktwaarde NL, kosten NL (MRB e.d.) | ❌/beperkt | ✅ |
| Actie-laag (onderhandeling, checklist) | ❌ | ✅ |

**Kern:** CARFAX is alleen duidelijk beter bij **importauto's**. Voor de ±80%
binnenlandse auto's is hun rapport niet rijker dan onze gratis laag — maar 2–4× zo duur.
Ze hebben overigens een affiliate-programma; voor import-kentekens kunnen we
overwegen door te verwijzen (commissie) tot we zelf een importbron hebben — afweging:
het voedt wel een concurrent.

---

## 4. carVertical — wat bieden zij dat wij niet hebben?

**Prijs:** ~€30 voor één rapport; agressieve bundelkorting (2e rapport −35%, 3+
richting −40–50%) en permanente "20% korting"-promobanners. Effectief €9–17 per
rapport in bundels — ons prijspunt is dus scherp maar niet extreem lager.

**Rapportinhoud die wij (nog) niet hebben:**
- Schaderecords met **AI-fotodetectie** (schade gespot op oude advertentie-/veilingfoto's,
  ook nooit officieel gemeld)
- **Foto's uit eerdere advertenties/veilingen** van exact deze auto
- Diefstalcheck internationaal
- Natuurramp-/overstromingsblootstelling per regio
- Taxi-/intensief-gebruik-detectie internationaal (NL-taxi-vlag hebben wíj al uit RDW)
- Uitrusting af-fabriek via VIN-decode
- Buitenlandse km-records en registratiemomenten

**Hun zwakte (onze opening):** Nederlandse binnenlandse auto's. NL-reviews:
"geen NAP-data", "bijna geen informatie voor mijn NL-auto", "total loss niet gemeld",
"kilometerstanden inconsistent". Hun kracht is Oost-Europese/Duitse/Amerikaanse
importhistorie — niet de Nederlandse occasion.

---

## 5. "Hoe kunnen we uitstralen" — het presentatie-playbook van de grote spelers

Wat CARFAX/carVertical doen om vertrouwen en conversie uit te stralen, en onze vertaling:

| Tactiek van hen | Onze implementatie |
|---|---|
| **Gratis decoder als teaser** → persoonlijke preview "wij vonden X records" → betaalmuur | Wij kunnen dit béter: kenteken is makkelijker dan VIN en onze gratis preview toont échte RDW-data + teller: "47 datapunten gecontroleerd, 9 met bevindingen — ontgrendel" |
| **Voorbeeldrapport** prominent op homepage en bij elke lock | Demo-kenteken volledig open met watermerk (stond al in blauwdruk §4.5) |
| **Geld-terug-garantie** (carVertical: 100%) | "Niet tevreden? Geld terug." Kost bij €9,95 vrijwel niets, haalt de laatste twijfel weg |
| **Trustpilot overal** (carVertical 4.2★) | Vanaf dag 1: review-uitnodiging in de rapport-mail; widget op landing + checkout |
| **Schaal-claims** ("330 miljoen datapunten", "20+ landen") | Eerlijke variant: "15+ officiële RDW-datasets · 16 miljoen voertuigen · dagelijks ververst · X rapporten gegenereerd" (live teller) |
| **Bundels + kortingsframing** (2e −35%) | 3 rapporten €19,95 framen als "−33% per rapport"; serieuze koper checkt meerdere auto's |
| **Angst-statistieken** ("1 op 3 heeft verborgen verleden") | Onderbouwde NL-variant uit eigen data: "X% van de checks toont een NAP-onlogisch of WOK-signaal" — wij kunnen dit écht meten |
| **SEO-machine**: landingspagina per use-case en per merk | Pagina's: nap-check, importcheck, taxi-check, APK-check + per merk/model met échte APK-faalstatistieken uit onze bulk-pipeline (content die niemand anders heeft) |
| **VIN/internationaal imago** | Tegenpositionering: **"Internationale checkers missen Nederlandse data. Wij zijn gebouwd op de officiële Nederlandse bronnen."** + vergelijkingstabel wij €9,95 vs CARFAX €19,99–39,99 vs carVertical ~€30 |
| Apps in App/Play Store | Later; eerst mobile web perfect |

**Positioneringszin:** *"Voor een Nederlandse auto is een internationaal rapport
vooral leeg. Kentekenrapport is Nederlands-eerst: officiële RDW-diepte, eerlijk over
wat niemand mag weten (tellerstanden), en de enige met een actieplan voor je
bezichtiging en onderhandeling — voor een derde van de prijs."*

---

## 6. Betalingen — besluit

We blijven bij **PayPal**: de PayPal-checkout dekt in NL iDEAL, Apple Pay, Google Pay
en creditcards; een extra PSP (Mollie) is niet nodig. Actiepunten binnen PayPal:
1. iDEAL-knop als eerste/meest prominente funding source tonen voor NL-bezoekers.
2. Guest checkout aan (betalen zonder PayPal-account).
3. De eerdere blauwdruk-aanbeveling "Mollie toevoegen" vervalt.

---

## 7. Bijgewerkte API-/databron-prioriteiten

| Prioriteit | Bron | Status/besluit |
|---|---|---|
| ~~1~~ | ~~RDW Zakelijk XML/NAP~~ | **Vervalt** — geen tellerstanden, onzekere toekomst, weinig meerwaarde (§1) |
| ~~2~~ | ~~Mollie~~ | **Vervalt** — PayPal dekt alle NL-betaalmethoden (§6) |
| 1 | RDW open data bulk-pipeline (APK-faalstatistieken per model) | Gratis, uniek, direct starten |
| 2 | Tellerrapport-upload/invoer + consistentietoets (§2) | Gratis, uniek, geen API nodig |
| 3 | Marktprijzen-comparables (AutoScout24/Marktplaats/Indicata/Autotelex) | Grootste betaalde upgrade; gesprekken starten |
| 4 | VbV/stolencars (gestolen-status) | Partnertraject, middellang |
| 5 | Importhistorie (autoDNA B2B, of CARFAX-affiliate als tussenoplossing) | Alleen triggeren bij import-vlag (~20% van checks) |
| 6 | VWE/RDC (eigenarenhistorie, uitvoeringen) | VWE reageert niet → RDC proberen; anders parkeren |

---

## Bronnen
- RDW e-mail Unit IV (juni 2026, intern)
- [RDW — Betaald toegang tot ongevoelige kentekengegevens](https://www.rdw.nl/over-rdw/dienstverlening/betaald-toegang-tot-ongevoelige-kentekengegevens)
- [RDW — Open Data Gekentekende voertuigen (m9d7-ebf2)](https://opendata.rdw.nl/Voertuigen/Open-Data-RDW-Gekentekende_voertuigen/m9d7-ebf2)
- [RDW — Gratis RDW-Voertuigrapport aanvragen](https://www.rdw.nl/particulier/voertuigen/auto/gegevens-bekijken-of-aanpassen/uw-voertuiggegevens/rdw-voertuigrapport-aanvragen)
- [RDW — Meldingen Keuringsinstantie (sgfe-77wx)](https://opendata.rdw.nl/Keuringen/Open-Data-RDW-Meldingen-Keuringsinstantie/sgfe-77wx)
- [CARFAX NL — prijzen](https://www.carfax.eu/nl/prijzen) · [CARFAX NL — NAP-check](https://www.carfax.eu/nl/nap-check-carfax) · [CARFAX affiliate](https://affi.io/m/carfax)
- [ikwilvanmijnautoaf.nl — Carfax vs NAP check](https://www.ikwilvanmijnautoaf.nl/blog/carfax-vs-nap-check)
- [carVertical — rapportinhoud](https://www.carvertical.com/help/about-the-service/what-information-may-appear-in-the-carvertical-report) · [pricing](https://www.carvertical.com/pricing) · [refund policy](https://www.carvertical.com/refund-policy) · [VIN-decoder](https://www.carvertical.com/vin-decoder)
- [Trustpilot — carVertical NL-reviews](https://nl.trustpilot.com/review/carvertical.com) (klachten NL-data)
- [autorapporten.nl — carVertical recensie](https://autorapporten.nl/carvertical/) · [dollarbreak.com review](https://www.dollarbreak.com/carvertical-vin-review/)
- [Autocoach — kilometerstand importauto checken](https://autocoach.nl/inspiratie/kilometerstand-check-importauto) (BE-tellerstanden sinds 13-1-2025)
