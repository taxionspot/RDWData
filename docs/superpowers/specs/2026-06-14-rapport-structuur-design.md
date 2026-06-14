# Ontwerp: rapport-structuur kentekenrapport (online + PDF)

Datum: 2026-06-14
Status: richting goedgekeurd door eigenaar. Klaar voor implementatieplan in een aparte code-sessie.
Onderbouwing: research-workflow `wg26t3dyb` (3 sporen: conversie/paywall, mobiel-UX/overweldiging, concurrent-teardowns). Alle sporen wijzen naar dezelfde structuur.

## 1. Doel & context

- **Hoofdklant:** een twijfelende occasion-KOPER. Kernvraag: *"is dit een veilige koop EN een eerlijke prijs?"*
- **Probleem nu:** het betaalde rapport = 12 platte secties, te druk, te veel scrollen ("door de bomen zie je het bos niet").
- **Kanaal:** het meeste NL-verkeer is mobiel -> mobiel-eerst ontwerpen.
- **Prijs:** eenmalig EUR 6,95 per kenteken.

## 2. Beslissing: structuur "A-hybrid"

Oordeel-eerst + thema-groepen waarvan elke (ingeklapte) kop ALTIJD een statusregel toont (de scanbaarheid van een dashboard, in de rust van inklapbare groepen).

- Niet **B** (dashboard van kaartjes): valt op mobiel terug op 1 kolom en voelt fragmentarisch.
- Niet kale **C** (lange platte scroll): exact het Finnik-faalpatroon dat we verlaten. C blijft wel de veilige terugval EN is de PDF-vorm.
- Marktbewijs: HPI, Carfax, autoDNA, Motorcheck/Cartell, AutoUncle leiden allemaal met een oordeel boven inklapbare groepen; Finnik (platte secties) is de uitzondering/faalcase.

## 3. Gratis vs premium

**Gratis (bouwt vertrouwen, bewijst dat het rapport echt is):**
- Auto-identiteit: kenteken, merk/model/jaar, foto, kernspecs.
- Officiele-data-regel: "Officiele RDW + APK + NAP-gegevens".
- Echte signalen: APK-status, NAP-oordeel, open terugroepactie, milieuzone, import, taxi.
- **Concrete teaser** (aantal + categorie + inzet, nooit het antwoord): *"We controleerden 14 risicosignalen. 2 vragen aandacht voor je koopt. 1 raakt de eerlijke prijs."*

**Nooit gratis:** het koop-oordeel zelf, de marktwaarde/eerlijke-prijs-getallen, de benoemde issues, vergelijkbare auto's te koop, onderhandelhulp, diepte-analyse.

**Verboden:** nep-blur, nep-countdown, vage mysterie-teaser. Elke gratis claim verifieerbaar; elke vergrendelde teaser concreet. (Bewijs: news-paywall-studie , het antwoord gratis previewen verlaagt conversie sterk; Nature-studie , vage gaten verlagen kliks en tevredenheid.)

## 4. Paywall-kaart (direct na de teaser, "heetste" plek)

1. Officiele-data-trust-regel eerst.
2. "Wat krijg je"-waardestack: koopadvies, marktwaarde/eerlijke prijs, vergelijkbare auto's te koop, onderhandelhulp, diepte-analyse , met een paar ECHTE vergrendelde sectie-rijen als bewijs van inhoud (geen nep-blur).
3. Eerlijk inzet-anker (geen valse streepprijs): *"Een verkeerde occasion kost zo honderden euro's. Dit rapport: EUR 6,95."*
4. **GEEN geld-terug-garantie** (bewust weg, was vals). Wel: herroepingsrecht-regel + iDEAL/beveiligd-badge + 2-3 ECHTE NL-reviews (met foto/regio).
5. Prijs klein gerenderd; eerlijke beslis-context ("je staat op het punt deze auto te kopen"), geen nep-timer.
6. Mobiel: sticky "Ontgrendel volledig rapport , EUR 6,95"-balk.

Prijs-rechtvaardiging: Finnik ankert NL op EUR 4,99; ons verschil = juist het oordeel + eerlijke prijs + vergelijkbare auto's + onderhandelhulp die Finnik niet heeft.

## 5. Het oordeel-blok (BLUF, bovenaan premium)

Inverted-pyramid: het antwoord op "veilige koop tegen eerlijke prijs?" staat als eerste boven de vouw.

- Eén oordeel-kop, bijv. *"Redelijke koop , 2 aandachtspunten"*.
- 3-5 gekleurde signaalregels: **icoon + woord + kleur** (3-staps groen / amber / rood, nooit alleen kleur , toegankelijkheid). Set die past bij de koper:
  1. Veilig om te kopen (historie & schade)
  2. Eerlijke prijs vs markt (getal + positie t.o.v. markt)
  3. Kilometerstand / NAP-plausibiliteit
  4. APK / rijwaardigheid
  5. Aantal rode vlaggen
- **Risico-bij-uitzondering:** alleen de echte waarschuwingen naar boven (notification-center-/alerts-patroon). Schone auto = direct gerustgesteld; probleemauto = onmisbaar.
- Elke signaalregel is tikbaar -> springt naar de detailgroep (oordeel = ook navigatie). Eén kolom op mobiel.

## 6. De 6 detailgroepen (volgorde + standaardstand)

| # | Groep | Standaard | Waarom |
|---|-------|-----------|--------|
| 1 | Overzicht / koopoordeel (detail achter het oordeel) | OPEN | iedereen leest dit; niet gaten |
| 2 | Marktwaarde & eerlijke prijs (+ vergelijkbare auto's te koop, onderhandelhulp) | OPEN | de premium-differentiator + de helft van de kernvraag |
| 3 | Risico's & schade (alerts-detail) | Ingeklapt, statusregel zichtbaar | status volstaat voor de meesten |
| 4 | Kilometerstand / NAP | Ingeklapt, statusregel | "logisch" volstaat; volledige historie = referentie |
| 5 | APK-historie & rijwaardigheid | Ingeklapt, statusregel | oordeelregel scanbaar, detail op aanvraag |
| 6 | Eigendom & voertuiggegevens (historie, eigendom, volledige RDW-spectabel) | Ingeklapt, statusregel | meest referentie-zwaar, minst nodig in z'n geheel |

Regels:
- Sticky jump-nav boven de groepen (herstelt de nav die "weg" was).
- Elke kop: **titel + gekleurde statusregel + chevron** (nooit een kale titel , informatie-geur is de voorwaarde dat accordions werken).
- "Alles uitklappen / inklappen"-knop bovenaan.
- Koppen als anchor/jumplinks zodat Back inklapt; 1 kolom in panelen; lange tabellen (spectabel) eigen sub-samenvatting + sticky sluit-kop; alternerende rij-arcering.

## 7. PDF (papieren versie = alles-uitgeklapt)

- **Pagina 1 = oordeel-blok plat:** oordeel-kop + de 3-5 gekleurde signaalregels (icoon + woord + kleur, overleeft z/w-print) + de alerts/uitzonderingen-lijst. Het hele antwoord staat op pagina 1.
- Daarna de 6 groepen in dezelfde volgorde, elk een titelsectie met de statusregel als subkop, panelen volledig uitgeklapt (1 kolom, semantische groepering, alternerende arcering).
- Klikbare/anchored inhoudsopgave bovenaan (spiegelt de jump-nav).
- Blijft de duurzame, volledig-onthulde kopie die de koper opslaat en meeneemt naar de verkoper (zoals carVertical/Carfax een persistente PDF naast het webrapport leveren).

## 8. Te vermijden

1. 12 platte gelijke secties zonder nav (Finnik-faalpatroon).
2. Een kaal scorecijfer zonder peer-context; nep/vage teasers; nep-blur.
3. Het oordeel/waarde onderaan verstoppen, of het antwoord gratis weggeven.

## 9. Buiten scope (aparte sub-projecten, apart ontwerpen)

Deze brainstorm ging ALLEEN over de rapport-structuur (#1). De rest doen we daarna, elk met eigen ontwerp:
- **#2 Laad-architectuur:** klant typt kenteken -> op het loader-scherm wordt alles opgehaald (RDW + AI + AutoScout/Gaspedaal-kaartjes) -> daarna het complete rapport tonen met betaalde delen afgeschermd (lost "kaartjes pas bij 2e refresh" op).
- **#3 Eigen foto + km uit de live advertentie:** staat de auto online op AutoScout/Gaspedaal? Pak die foto + km; anders Imagin Studio + eigen km-calculator.
- **#4 Listing-historie opslaan:** elke scrape bewaren -> "deze auto stond ooit voor EUR X met Y km online".
- **#6 Thank-you-mail komt niet aan:** losse bug-fix (geen ontwerp).

## 10. Open punten / te beslissen bij implementatie

- Exacte set van 3-5 signaalregels + drempels voor groen/amber/rood.
- Of groep 1 en 2 echt volledig "open" zijn of "samenvatting + uitklap".
- Bron voor echte NL-reviews (verzamelen).
- Welke RDW-velden in de gratis basis vs de premium spec-tabel.
