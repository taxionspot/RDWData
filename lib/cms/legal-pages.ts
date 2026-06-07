import { CmsPageModel } from "@/models/CmsPage";

export type LegalPageTemplate = {
  slug: "privacy-policy" | "terms-and-conditions" | "cookie-policy";
  title: string;
  content: string;
  published: boolean;
  showInHeader: boolean;
  showInFooter: boolean;
};

// Bump this when the legal copy below changes so ensureLegalPages refreshes the
// stored pages. (Increase the number to push new text live.)
export const LEGAL_CONTENT_VERSION = 2;

export const LEGAL_PAGE_TEMPLATES: LegalPageTemplate[] = [
  {
    slug: "privacy-policy",
    title: "Privacybeleid",
    published: true,
    showInHeader: false,
    showInFooter: true,
    content: `Privacybeleid

Laatst bijgewerkt: 7 juni 2026

1. Inleiding
Kentekenrapport ("wij", "ons") respecteert je privacy. Dit privacybeleid legt uit welke persoonsgegevens we verwerken, waarom, en welke rechten je hebt.

2. Gegevens die we verwerken
- Accountgegevens: e-mailadres en inloggegevens als je een account aanmaakt.
- Zoekgegevens: opgevraagde kentekens en rapportactiviteit.
- Betaalgegevens: transactiereferenties en betaalstatus van onze betaaldienstverlener (PayPal). Wij slaan geen volledige kaartgegevens op.
- Technische gegevens: IP-adres, browser- en apparaatinformatie en gebruikslogs.

3. Hoe we gegevens gebruiken
- om kentekenrapporten en functies te leveren;
- om betalingen te verwerken en toegang tot betaalde rapporten te verlenen;
- om het platform te beveiligen en misbruik te voorkomen;
- om de dienst te verbeteren (analyse) en ondersteuning te bieden.

4. Grondslag (AVG)
Wij verwerken gegevens op basis van de uitvoering van de overeenkomst, wettelijke verplichtingen, gerechtvaardigd belang en, waar vereist, jouw toestemming.

5. Bronnen van voertuigdata
Voertuiggegevens komen uit de open data van de RDW. Dit zijn voertuiggegevens, geen persoonsgegevens van eigenaren; de RDW publiceert om privacyredenen geen naam- of adresgegevens van houders.

6. Delen met derden
We delen gegevens alleen met vertrouwde verwerkers voor hosting, betalingen, e-mail en analyse. We verkopen geen persoonsgegevens.

7. Bewaartermijn
We bewaren gegevens niet langer dan nodig voor de dienstverlening, wettelijke verplichtingen en fraudepreventie.

8. Jouw rechten
Je hebt recht op inzage, correctie, verwijdering, beperking en bezwaar, en op dataportabiliteit. Een klacht indienen kan bij de Autoriteit Persoonsgegevens.

9. Beveiliging
We nemen passende technische en organisatorische maatregelen. Geen enkele methode is 100% veilig.

10. Cookies
We gebruiken functionele en analytische cookies. Zie ons Cookiebeleid voor details.

11. Contact
Vragen over privacy? Mail naar info@kentekenrapport.com.`
  },
  {
    slug: "terms-and-conditions",
    title: "Algemene voorwaarden",
    published: true,
    showInHeader: false,
    showInFooter: true,
    content: `Algemene voorwaarden

Laatst bijgewerkt: 7 juni 2026

1. Toepasselijkheid
Door Kentekenrapport te gebruiken ga je akkoord met deze algemene voorwaarden.

2. Dienst
Kentekenrapport levert voertuigrapporten en inzichten op basis van openbare RDW-data en eigen modellen (zoals een schatting van de kilometerstand en de marktwaarde). De gegevens worden "as is" geleverd.

3. Aard van schattingen
Marktwaarde, geschatte kilometerstand, wegenbelasting en soortgelijke cijfers zijn indicaties op basis van data en modellen, geen taxatie of garantie. Controleer een voertuig altijd ook fysiek en met documentatie van de verkoper voordat je koopt.

4. Prijzen en betaling
Bepaalde rapporten zijn betaald. De prijs (inclusief btw) wordt vóór betaling getoond. Toegang wordt verleend na bevestigde betaling via onze betaaldienstverlener.

5. Direct geleverde digitale dienst en herroepingsrecht
Een kentekenrapport is digitale content die direct na betaling volledig wordt geleverd en beschikbaar gesteld. Je geeft bij aankoop uitdrukkelijk toestemming voor onmiddellijke levering en erkent dat je daarmee afstand doet van het wettelijke herroepingsrecht van 14 dagen (art. 6:230p sub g BW). Er is daarom geen recht op terugbetaling zodra het rapport is opgehaald of verzonden. Werkt er technisch iets niet? Neem contact op via info@kentekenrapport.com en we lossen het op.

6. Toegestaan gebruik
Je gebruikt de dienst niet voor misbruik, ongeoorloofde toegang, grootschalig scrapen, reverse engineering of verstoring van het platform.

7. Disclaimer en aansprakelijkheid
Wij streven naar correcte data maar garanderen geen volledigheid of juistheid op elk moment. Voor zover wettelijk toegestaan zijn wij niet aansprakelijk voor indirecte of gevolgschade die voortvloeit uit het gebruik van het platform of beslissingen op basis van een rapport.

8. Intellectueel eigendom
Ontwerp, software, merk en originele content zijn eigendom van Kentekenrapport of haar licentiegevers.

9. Wijzigingen
We kunnen deze voorwaarden van tijd tot tijd aanpassen. Voortgezet gebruik na wijziging betekent acceptatie.

10. Toepasselijk recht
Op deze voorwaarden is Nederlands recht van toepassing, behoudens dwingend consumentenrecht.

11. Contact
Bedrijfsgegevens: Kentekenrapport, KVK 65752376, Pastoor Petersstraat 170-46, 5612 LW Eindhoven. E-mail: info@kentekenrapport.com.`
  },
  {
    slug: "cookie-policy",
    title: "Cookiebeleid",
    published: true,
    showInHeader: false,
    showInFooter: true,
    content: `Cookiebeleid

Laatst bijgewerkt: 7 juni 2026

1. Wat zijn cookies?
Cookies zijn kleine bestanden die op je apparaat worden opgeslagen wanneer je een website bezoekt.

2. Welke cookies gebruiken we?
- Noodzakelijke cookies: nodig om de site te laten werken (bijvoorbeeld het onthouden van je sessie, taalkeuze en cookievoorkeur en het verlenen van toegang tot een betaald rapport).
- Analytische cookies: om geanonimiseerd te begrijpen hoe de site gebruikt wordt zodat we hem kunnen verbeteren.

We gebruiken geen advertentie- of trackingcookies van derden voor profilering.

3. Toestemming
Bij je eerste bezoek vragen we je voorkeur. Je kunt later van gedachten veranderen door de cookies in je browser te verwijderen.

4. Cookies beheren
Via de instellingen van je browser kun je cookies bekijken, blokkeren of verwijderen. Het blokkeren van noodzakelijke cookies kan de werking van de site beperken.

5. Contact
Vragen over cookies? Mail naar info@kentekenrapport.com.`
  }
];

export async function ensureLegalPages(): Promise<void> {
  await Promise.all(
    LEGAL_PAGE_TEMPLATES.map(async (page) => {
      // 1) Insert the page in full if it does not exist yet.
      await CmsPageModel.updateOne(
        { slug: page.slug },
        {
          $setOnInsert: {
            slug: page.slug,
            title: page.title,
            content: page.content,
            published: page.published,
            showInHeader: page.showInHeader,
            showInFooter: page.showInFooter,
            legalVersion: LEGAL_CONTENT_VERSION
          }
        },
        { upsert: true }
      );

      // 2) Refresh the copy only when the stored version is older than (or
      //    predates) the current template version, so admin edits made at the
      //    current version are preserved until LEGAL_CONTENT_VERSION is bumped.
      await CmsPageModel.updateOne(
        {
          slug: page.slug,
          $or: [{ legalVersion: { $lt: LEGAL_CONTENT_VERSION } }, { legalVersion: { $exists: false } }]
        },
        {
          $set: {
            title: page.title,
            content: page.content,
            published: page.published,
            legalVersion: LEGAL_CONTENT_VERSION
          }
        }
      );
    })
  );
}

export function getLegalTemplateBySlug(slug: string): LegalPageTemplate | null {
  return LEGAL_PAGE_TEMPLATES.find((item) => item.slug === slug) ?? null;
}
