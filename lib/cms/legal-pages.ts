import { CmsPageModel } from "@/models/CmsPage";

export type LegalPageTemplate = {
  slug: "privacy-policy" | "terms-and-conditions";
  title: string;
  content: string;
  published: boolean;
  showInHeader: boolean;
  showInFooter: boolean;
};

export const LEGAL_PAGE_TEMPLATES: LegalPageTemplate[] = [
  {
    slug: "privacy-policy",
    title: "Privacybeleid",
    published: true,
    showInHeader: false,
    showInFooter: true,
    content: `Privacybeleid

Laatst bijgewerkt: 12 juni 2026

1. Wie zijn wij
Kentekenrapport (kentekenrapport.com) biedt voertuigrapporten op basis van open data van de RDW. Kentekenrapport is verwerkingsverantwoordelijke voor de persoonsgegevens die via deze website worden verwerkt. Contact: info@kentekenrapport.com.

2. Welke gegevens verwerken wij
- Kentekens die je opzoekt. Een kenteken is een voertuiggegeven; wij koppelen het niet aan jouw identiteit, tenzij je een rapport koopt of een account aanmaakt.
- E-mailadres: wanneer je dit invult bij het afrekenen (voor rapportlevering en betaalbevestiging) of bij het aanmaken van een account.
- Betaalgegevens: betalingen verlopen volledig via PayPal (inclusief iDEAL, creditcard, Apple Pay en Google Pay). Wij ontvangen alleen een transactiereferentie, het bedrag en de betaalstatus. Wij slaan nooit kaart- of rekeninggegevens op.
- Accountgegevens: e-mailadres, opgeslagen voertuigen en rapportgeschiedenis, als je een account gebruikt.
- Technische gegevens: IP-adres, browsertype en gebruiksstatistieken, uitsluitend volgens jouw cookievoorkeuren.

3. Waarvoor gebruiken wij deze gegevens
- Het leveren van voertuigrapporten en platformfuncties.
- Het verwerken van betalingen en het ontgrendelen van betaalde content.
- Het versturen van je rapport, een betaalbevestiging en, als je je e-mailadres invulde bij het afrekenen maar de betaling niet afrondde, eenmalig een herinneringsmail.
- Beveiliging van het platform en het voorkomen van misbruik.
- Statistieken en verbetering van de dienst (alleen met jouw toestemming voor analytische cookies).

4. Grondslagen (AVG)
Wij verwerken gegevens op basis van: uitvoering van de overeenkomst (rapportlevering en betaling), gerechtvaardigd belang (beveiliging, fraudepreventie en beperkte service-e-mails), wettelijke verplichtingen (administratie) en jouw toestemming (analytische en marketingcookies; deze kun je altijd intrekken via de cookie-instellingen).

5. Met wie delen wij gegevens
Wij delen gegevens alleen met dienstverleners die nodig zijn om de dienst te leveren:
- PayPal (betalingsverwerking, inclusief iDEAL, creditcard, Apple Pay en Google Pay);
- Resend (verzending van e-mails);
- Hostingproviders en databasediensten voor het draaien van het platform;
- Google (Tag Manager, Analytics en advertentiediensten, uitsluitend na jouw cookietoestemming);
- Cookiebot (beheer van cookietoestemming).
Voertuiggegevens zijn afkomstig uit openbare bronnen van de RDW. Wij verkopen geen persoonsgegevens.

6. Bewaartermijnen
Wij bewaren gegevens niet langer dan nodig: betaal- en ordergegevens conform de wettelijke (fiscale) bewaarplicht, accountgegevens zolang je account bestaat, en checkout-gegevens van niet-afgeronde betalingen maximaal enkele maanden.

7. Doorgifte buiten de EER
Sommige dienstverleners (zoals Google en PayPal) kunnen gegevens buiten de Europese Economische Ruimte verwerken. In dat geval gelden passende waarborgen, zoals door de Europese Commissie goedgekeurde standaardcontractbepalingen.

8. Jouw rechten
Je hebt het recht op inzage, correctie, verwijdering, beperking van de verwerking, bezwaar en gegevensoverdraagbaarheid. Stuur je verzoek naar info@kentekenrapport.com. Je hebt ook het recht een klacht in te dienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).

9. Beveiliging
Wij nemen passende technische en organisatorische maatregelen om gegevens te beschermen, waaronder versleutelde verbindingen (HTTPS) en beveiligde betaalverwerking via PayPal.

10. Cookies
Wij gebruiken cookies voor essentiële functionaliteit en, alleen na jouw toestemming, voor statistieken en marketing. Een volledig en actueel overzicht vind je in onze cookieverklaring op /cookie-policy. Je kunt je voorkeuren op elk moment aanpassen via de cookiebanner.

11. Contact
Voor privacyvragen of -verzoeken: info@kentekenrapport.com.`
  },
  {
    slug: "terms-and-conditions",
    title: "Algemene voorwaarden",
    published: true,
    showInHeader: false,
    showInFooter: true,
    content: `Algemene voorwaarden

Laatst bijgewerkt: 12 juni 2026

1. Toepasselijkheid
Deze algemene voorwaarden zijn van toepassing op elk gebruik van kentekenrapport.com en op elke aankoop van een voertuigrapport via deze website. Door de website te gebruiken of een rapport te kopen, ga je akkoord met deze voorwaarden. Contact: info@kentekenrapport.com.

2. De dienst
Kentekenrapport levert digitale voertuigrapporten over Nederlandse kentekens, op basis van open data van de RDW (zoals voertuiggegevens, APK-historie, tellerstandoordeel en terugroepacties), aangevuld met indicatieve analyses en schattingen die deels met AI-modellen worden gegenereerd.

3. Prijs en betaling
- De prijs per rapport wordt vóór het afrekenen duidelijk getoond en geldt per kenteken.
- Betalen kan met iDEAL, creditcard, Apple Pay, Google Pay en PayPal. De betaalverwerking verloopt via PayPal.
- Na een geslaagde betaling worden alle premium onderdelen voor het betreffende kenteken direct ontgrendeld.

4. Levering en herroepingsrecht
Het rapport is digitale inhoud die direct na betaling wordt geleverd. Door te betalen stem je er uitdrukkelijk mee in dat de levering direct begint en verklaar je afstand te doen van je wettelijke herroepingsrecht (artikel 6:230p Burgerlijk Wetboek). Is er iets misgegaan met de levering of betaling, neem dan contact op via info@kentekenrapport.com; we lossen het op.

5. Gegevens en aansprakelijkheid
- De rapporten zijn gebaseerd op openbare bronnen en geautomatiseerde analyses. Wij streven naar hoge kwaliteit, maar garanderen niet dat alle gegevens op elk moment volledig, actueel of foutloos zijn.
- Marktwaarde, kostenindicaties, kansen en aankoopadviezen zijn indicatieve schattingen en geen taxatie, keuring of bindend advies. Controleer vóór aankoop van een voertuig altijd de fysieke staat en de officiële documenten.
- Aan de inhoud van een rapport kunnen geen rechten worden ontleend. Voor zover wettelijk toegestaan is Kentekenrapport niet aansprakelijk voor indirecte schade of gevolgschade door het gebruik van de dienst. De totale aansprakelijkheid is in elk geval beperkt tot het bedrag dat je voor het betreffende rapport hebt betaald.

6. Toegestaan gebruik
Het is niet toegestaan de dienst te misbruiken, op grote schaal geautomatiseerd te bevragen (scrapen), te proberen ongeautoriseerde toegang te krijgen of de werking van het platform te verstoren.

7. Intellectueel eigendom
Het ontwerp, de software, de huisstijl en de originele content van het platform zijn eigendom van Kentekenrapport of haar licentiegevers en worden beschermd door intellectuele-eigendomsrechten. Het gekochte rapport is voor eigen gebruik.

8. Account
Als je een account aanmaakt, ben je verantwoordelijk voor het vertrouwelijk houden van je inloggegevens en voor activiteiten die via je account plaatsvinden.

9. Wijzigingen
Wij kunnen deze voorwaarden van tijd tot tijd aanpassen. De versie die geldt op het moment van jouw aankoop is van toepassing op die aankoop.

10. Klachten en toepasselijk recht
Klachten kun je sturen naar info@kentekenrapport.com; we reageren zo snel mogelijk. Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in Nederland, tenzij dwingend consumentenrecht anders bepaalt.`
  }
];

// Previously shipped English defaults. Pages whose content still equals one of
// these were never edited by an admin and are safe to migrate to the new copy.
const LEGACY_LEGAL_CONTENT: Record<LegalPageTemplate["slug"], { title: string; content: string }> = {
  "privacy-policy": {
    title: "Privacy Policy",
    content: `Privacy Policy

Last updated: April 3, 2026

1. Introduction
Kentekenrapport ("we", "us", "our") respects your privacy. This Privacy Policy explains what personal data we collect, how we use it, and your rights.

2. Data We Collect
- Account data: email address and login credentials when you create an account.
- Search data: license plate searches and related report activity.
- Payment data: transaction references and payment status from payment providers.
- Technical data: IP address, browser type, device details, and usage logs.

3. How We Use Data
We use your data to:
- deliver vehicle reports and platform features;
- process payments and grant access to paid content;
- secure the platform and prevent abuse;
- improve product quality, analytics, and support.

4. Legal Basis (GDPR)
Where applicable, we process data based on:
- contract performance;
- legal obligations;
- legitimate interests;
- your consent (when required).

5. Data Sharing
We may share data with trusted service providers for hosting, payments, analytics, and support. We do not sell personal data.

6. Data Retention
We keep data only as long as needed for service delivery, legal compliance, dispute resolution, and fraud prevention.

7. International Transfers
If data is processed outside the EEA, we apply appropriate safeguards where legally required.

8. Your Rights
Depending on your location, you may have rights to access, correct, delete, restrict, or object to processing, and data portability rights.

9. Security
We use technical and organizational safeguards to protect data, but no method is 100% secure.

10. Cookies
We use cookies and similar technologies for essential functionality, preferences, and analytics.

11. Contact
For privacy requests, contact: privacy@kentekenrapport.nl`
  },
  "terms-and-conditions": {
    title: "Terms and Conditions",
    content: `Terms and Conditions

Last updated: April 3, 2026

1. Acceptance
By accessing or using Kentekenrapport, you agree to these Terms and Conditions.

2. Service Description
Kentekenrapport provides vehicle-related data insights and reports based on public and partner data sources. Data is provided on an "as available" basis.

3. Account and Access
You are responsible for maintaining account security and for activities performed under your account.

4. Payments
Certain features require payment. Prices, taxes, and payment terms are shown at checkout. Access is granted after successful payment confirmation.

5. Permitted Use
You agree not to misuse the service, attempt unauthorized access, scrape at scale, reverse engineer, or disrupt platform operations.

6. Data Accuracy Disclaimer
We aim for high-quality data but do not guarantee absolute completeness or accuracy at all times. You should independently verify critical information before purchase decisions.

7. Intellectual Property
Platform design, software, branding, and original content are owned by Kentekenrapport or licensors and are protected by law.

8. Limitation of Liability
To the extent permitted by law, Kentekenrapport is not liable for indirect or consequential damages arising from use of the platform.

9. Termination
We may suspend or terminate access for violations of these terms or abuse of the platform.

10. Changes to Terms
We may update these terms from time to time. Continued use after updates means you accept the revised terms.

11. Governing Law
These terms are governed by the laws of the Netherlands, unless mandatory local consumer law applies otherwise.

12. Contact
For legal questions, contact: legal@kentekenrapport.nl`
  }
};

export async function ensureLegalPages(): Promise<void> {
  await Promise.all(
    LEGAL_PAGE_TEMPLATES.map(async (page) => {
      // Migrate pages that still contain the old shipped default text.
      const legacy = LEGACY_LEGAL_CONTENT[page.slug];
      await CmsPageModel.updateOne(
        { slug: page.slug, content: legacy.content },
        { $set: { title: page.title, content: page.content } }
      );
      await CmsPageModel.updateOne(
        { slug: page.slug },
        {
          $setOnInsert: {
            title: page.title,
            slug: page.slug,
            content: page.content,
            published: page.published,
            showInHeader: page.showInHeader,
            showInFooter: page.showInFooter
          }
        },
        { upsert: true }
      );
    })
  );
}

export function getLegalTemplateBySlug(slug: string): LegalPageTemplate | null {
  return LEGAL_PAGE_TEMPLATES.find((item) => item.slug === slug) ?? null;
}
