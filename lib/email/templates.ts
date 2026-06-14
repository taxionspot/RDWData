import { formatDisplayPlate } from "@/lib/rdw/normalize";
import type { Locale } from "@/lib/i18n/messages";

export type EmailContent = { subject: string; html: string };

/** Stage of the abandoned-checkout follow-up sequence (1 = ~1h, 2 = ~24h, 3 = ~72h). */
export type FollowUpStage = 1 | 2 | 3;

const BRAND = {
  ink: "#0f172a",
  blue: "#2563eb",
  body: "#334155",
  muted: "#475569",
  faint: "#64748b",
  line: "#e2e8f0",
  cardBg: "#f8fafc",
  pageBg: "#eef2f8",
  plateYellow: "#facc15",
  plateBorder: "#d4af00"
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif";

function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "https://kentekenrapport.com").replace(/\/+$/, "");
}

// Escape a value for safe use inside an HTML attribute (href) or text node.
// URLs carry "&" between UTM params, which must be "&amp;" in HTML.
function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatAmount(amount: string, currency: string, locale: Locale): string {
  const symbol = currency === "EUR" ? "€ " : `${currency} `;
  const value = locale === "nl" ? amount.replace(".", ",") : amount;
  return `${symbol}${value}`;
}

function formatDate(locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    dateStyle: "long"
  }).format(new Date());
}

// Hidden preview text (what inboxes show next to the subject). The trailing
// zero-width spacers stop Gmail from pulling body copy into the preview.
function preheader(text: string): string {
  const spacer = "&#8199;&#65279;&#847;".repeat(30);
  return `<div style="display:none;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${text}${spacer}</div>`;
}

function renderLayout(args: { preheader: string; bodyHtml: string; footerHtml: string; locale: Locale }): string {
  return `<!DOCTYPE html>
<html lang="${args.locale === "nl" ? "nl" : "en"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<title>Kentekenrapport</title>
<style>
  @media (max-width:600px){
    .kr-pad{padding-left:22px!important;padding-right:22px!important;}
    .kr-h1{font-size:23px!important;}
    .kr-btn{display:block!important;width:100%!important;box-sizing:border-box;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};">
${preheader(args.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.pageBg};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;border:1px solid ${BRAND.line};overflow:hidden;">
      <tr><td style="background:${BRAND.ink};padding:18px 32px;">
        <span style="font-family:${FONT};color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.3px;">Kentekenrapport</span>
      </td></tr>
      <tr><td class="kr-pad" style="padding:30px 32px 10px;font-family:${FONT};color:${BRAND.body};font-size:16px;line-height:1.65;">
        ${args.bodyHtml}
      </td></tr>
      <tr><td class="kr-pad" style="padding:20px 32px 28px;border-top:1px solid ${BRAND.line};font-family:${FONT};color:${BRAND.faint};font-size:12px;line-height:1.6;">
        ${args.footerHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function renderH1(text: string): string {
  return `<h1 class="kr-h1" style="margin:0 0 14px;font-family:${FONT};color:${BRAND.ink};font-size:26px;line-height:1.25;font-weight:700;">${text}</h1>`;
}

function renderButton(url: string, label: string): string {
  const href = htmlEscape(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 18px;width:100%;">
    <tr><td align="center" bgcolor="${BRAND.blue}" style="border-radius:8px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:300px;" arcsize="16%" strokecolor="${BRAND.blue}" fillcolor="${BRAND.blue}">
      <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a class="kr-btn" href="${href}" style="display:inline-block;background:${BRAND.blue};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:700;text-decoration:none;padding:15px 32px;border-radius:8px;">${label}</a>
      <!--<![endif]-->
    </td></tr>
  </table>`;
}

function fallbackLink(url: string, locale: Locale): string {
  const intro = locale === "nl" ? "Lukt de knop niet? Open dit adres:" : "Button not working? Open this link:";
  const href = htmlEscape(url);
  return `<p style="margin:0 0 18px;font-family:${FONT};color:${BRAND.faint};font-size:13px;line-height:1.5;word-break:break-all;">${intro}<br><a href="${href}" style="color:${BRAND.blue};">${href}</a></p>`;
}

function platePill(plate: string): string {
  return `<span style="display:inline-block;background:${BRAND.plateYellow};color:${BRAND.ink};font-family:Arial,Helvetica,sans-serif;font-weight:700;letter-spacing:1px;border-radius:5px;padding:3px 10px;border:1px solid ${BRAND.plateBorder};">${plate}</span>`;
}

function summaryCard(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .map(
      (row) => `<tr>
        <td style="padding:7px 0;font-family:${FONT};font-size:13px;color:${BRAND.faint};">${row.label}</td>
        <td align="right" style="padding:7px 0;font-family:${FONT};font-size:15px;color:${BRAND.ink};font-weight:600;">${row.value}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cardBg};border:1px solid ${BRAND.line};border-radius:12px;margin:6px 0 8px;">
    <tr><td style="padding:16px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
    </td></tr>
  </table>`;
}

function supportLine(locale: Locale): string {
  const text =
    locale === "nl"
      ? "Vragen over je rapport of betaling? Beantwoord gewoon deze e-mail, ik help je graag verder."
      : "Questions about your report or payment? Just reply to this email, I am happy to help.";
  const sign = locale === "nl" ? "Groetjes,<br><strong>Anouk van Kentekenrapport</strong>" : "Best regards,<br><strong>Anouk van Kentekenrapport</strong>";
  return `<p style="margin:18px 0 0;font-family:${FONT};color:${BRAND.body};font-size:15px;line-height:1.6;">${text}</p>
  <p style="margin:14px 0 0;font-family:${FONT};color:${BRAND.body};font-size:15px;line-height:1.6;">${sign}</p>`;
}

function utm(url: string, campaign: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=kentekenrapport&utm_medium=email&utm_campaign=${campaign}`;
}

export function buildThankYouEmail(args: {
  plate: string;
  amount: string;
  currency: string;
  orderId: string;
  locale: Locale;
  /** Whether the report PDF is actually attached to this email. */
  hasPdf: boolean;
}): EmailContent {
  const displayPlate = formatDisplayPlate(args.plate) || args.plate;
  const amount = formatAmount(args.amount, args.currency, args.locale);
  const reportUrl = utm(`${getBaseUrl()}/search/${encodeURIComponent(args.plate)}`, "thank_you");
  const date = formatDate(args.locale);
  const nl = args.locale === "nl";

  const rows = nl
    ? [
        { label: "Kenteken", value: platePill(displayPlate) },
        { label: "Bedrag", value: amount },
        { label: "Ordernummer", value: args.orderId },
        { label: "Datum", value: date }
      ]
    : [
        { label: "License plate", value: platePill(displayPlate) },
        { label: "Amount", value: amount },
        { label: "Order number", value: args.orderId },
        { label: "Date", value: date }
      ];

  // Only claim the PDF is attached when it really is (the build is best-effort
  // and can time out; otherwise the report is reachable via the link).
  const leadLine = nl
    ? args.hasPdf
      ? "We hebben je betaling ontvangen. Hieronder vind je je gegevens. Het volledige rapport zit als PDF bij deze e-mail en staat ook online klaar."
      : "We hebben je betaling ontvangen. Hieronder vind je je gegevens. Je rapport staat online voor je klaar."
    : args.hasPdf
      ? "We have received your payment. Your details are below. The full report is attached as a PDF and is also available online."
      : "We have received your payment. Your details are below. Your report is ready online.";

  const extraLine = nl
    ? args.hasPdf
      ? "Het volledige rapport zit ook als PDF-bijlage bij deze e-mail, zodat je het altijd bij de hand hebt."
      : "Tip: op de rapportpagina kun je het volledige rapport ook als PDF downloaden."
    : args.hasPdf
      ? "The full report is also attached as a PDF so you always have it on hand."
      : "Tip: on the report page you can also download the full report as a PDF.";

  const bodyHtml = `${renderH1(nl ? "Bedankt, je rapport staat klaar" : "Thank you, your report is ready")}
      <p style="margin:0 0 14px;">${leadLine}</p>
      ${summaryCard(rows)}
      ${renderButton(reportUrl, nl ? "Bekijk je rapport online" : "View your report online")}
      ${fallbackLink(reportUrl, args.locale)}
      <p style="margin:0;color:${BRAND.muted};font-size:14px;line-height:1.6;">${extraLine}</p>
      ${supportLine(args.locale)}`;

  const footerHtml = nl
    ? `Je ontvangt deze e-mail omdat je een kentekenrapport hebt gekocht op kentekenrapport.com.<br>Ordernummer: ${args.orderId}`
    : `You are receiving this email because you purchased a vehicle report on kentekenrapport.com.<br>Order reference: ${args.orderId}`;

  const preheaderText = nl
    ? args.hasPdf
      ? "Je betaling is gelukt. Je rapport staat klaar en zit als PDF in deze e-mail."
      : "Je betaling is gelukt. Je rapport staat online voor je klaar."
    : args.hasPdf
      ? "Your payment was successful. Your report is ready and attached as a PDF."
      : "Your payment was successful. Your report is ready online.";

  return {
    subject: nl
      ? `Bedankt voor je aankoop: kentekenrapport ${displayPlate}`
      : `Thank you for your purchase: vehicle report ${displayPlate}`,
    html: renderLayout({ preheader: preheaderText, bodyHtml, footerHtml, locale: args.locale })
  };
}

/**
 * Abandoned-checkout follow-up. Stage 1 (~1h) is a gentle reminder, stage 2
 * (~24h) explains the value, stage 3 (~72h) is the final, honest reminder.
 * No fake discounts or urgency.
 */
export function buildFollowUpEmail(args: { plate: string; locale: Locale; stage?: FollowUpStage }): EmailContent {
  const stage: FollowUpStage = args.stage ?? 1;
  const displayPlate = formatDisplayPlate(args.plate) || args.plate;
  const checkoutUrl = utm(`${getBaseUrl()}/search/${encodeURIComponent(args.plate)}`, `abandoned_checkout_${stage}`);
  const nl = args.locale === "nl";

  let subject: string;
  let pre: string;
  let h1: string;
  let intro: string;
  let cta: string;
  let extra = "";

  if (nl) {
    if (stage === 1) {
      subject = `Je kentekenrapport voor ${displayPlate} staat nog klaar`;
      pre = "Je betaling is niet helemaal afgerond. Je rapport staat nog voor je klaar.";
      h1 = "Je rapport staat nog voor je klaar";
      intro = `Ik zag dat je het kentekenrapport voor <strong>${displayPlate}</strong> wilde bekijken, maar dat de betaling niet helemaal is afgerond. Geen zorgen, dat gebeurt wel vaker. Je rondt het in een paar klikken af:`;
      cta = "Rapport afronden";
    } else if (stage === 2) {
      subject = `Twijfel je nog over ${displayPlate}? Dit staat in het rapport`;
      pre = "Een eerlijk oordeel, de marktwaarde en de risico's voor dit kenteken.";
      h1 = "Wat je in het rapport vindt";
      intro = `Je rapport voor <strong>${displayPlate}</strong> staat nog klaar. Het geeft je in een oogopslag:`;
      cta = "Bekijk het rapport";
      extra = `<ul style="margin:0 0 6px;padding-left:20px;color:${BRAND.body};font-size:15px;line-height:1.7;">
        <li>Een eerlijk koopoordeel en de geschatte marktwaarde</li>
        <li>Open terugroepacties en risicosignalen</li>
        <li>APK-historie en de kilometer/NAP-check</li>
        <li>Vergelijkbaar aanbod om de prijs te toetsen</li>
      </ul>
      <p style="margin:0 0 4px;color:${BRAND.muted};font-size:14px;">Alles op basis van officiële RDW-data, eenmalig voor dit kenteken.</p>`;
    } else {
      subject = `Laatste herinnering: je rapport voor ${displayPlate}`;
      pre = "Dit is mijn laatste mailtje hierover. Je rapport staat nog klaar.";
      h1 = "Laatste herinnering";
      intro = `Dit is mijn laatste mailtje hierover. Je rapport voor <strong>${displayPlate}</strong> staat nog steeds voor je klaar. Wil je het toch bekijken, dan kan dat hieronder. Anders hoor je verder niets meer van me.`;
      cta = "Rapport bekijken";
    }
  } else {
    if (stage === 1) {
      subject = `Your vehicle report for ${displayPlate} is still waiting`;
      pre = "Your payment was not completed. Your report is still ready for you.";
      h1 = "Your report is still ready";
      intro = `I noticed you wanted to view the vehicle report for <strong>${displayPlate}</strong>, but the payment was not completed. No worries, that happens. You can finish it in a few clicks:`;
      cta = "Complete your report";
    } else if (stage === 2) {
      subject = `Still unsure about ${displayPlate}? Here is what is in the report`;
      pre = "A clear verdict, the market value and the risks for this plate.";
      h1 = "What you get in the report";
      intro = `Your report for <strong>${displayPlate}</strong> is still ready. At a glance it gives you:`;
      cta = "View the report";
      extra = `<ul style="margin:0 0 6px;padding-left:20px;color:${BRAND.body};font-size:15px;line-height:1.7;">
        <li>A clear buying verdict and the estimated market value</li>
        <li>Open recalls and risk signals</li>
        <li>Inspection history and the mileage check</li>
        <li>Comparable listings to sanity-check the price</li>
      </ul>
      <p style="margin:0 0 4px;color:${BRAND.muted};font-size:14px;">All based on official RDW data, one-time for this plate.</p>`;
    } else {
      subject = `Last reminder: your report for ${displayPlate}`;
      pre = "This is my last email about this. Your report is still ready.";
      h1 = "Last reminder";
      intro = `This is my last email about this. Your report for <strong>${displayPlate}</strong> is still ready for you. If you would still like to view it, you can below. Otherwise you will not hear from me again.`;
      cta = "View the report";
    }
  }

  const footerHtml = nl
    ? "Je ontvangt deze e-mail omdat je je e-mailadres hebt ingevuld bij het afrekenen op kentekenrapport.com."
    : "You are receiving this email because you entered your email address at checkout on kentekenrapport.com.";

  return {
    subject,
    html: renderLayout({
      preheader: pre,
      bodyHtml: `${renderH1(h1)}
        <p style="margin:0 0 14px;">${intro}</p>
        ${extra}
        ${renderButton(checkoutUrl, cta)}
        ${fallbackLink(checkoutUrl, args.locale)}
        ${supportLine(args.locale)}`,
      footerHtml,
      locale: args.locale
    })
  };
}
