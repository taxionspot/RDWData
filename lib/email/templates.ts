import { formatDisplayPlate } from "@/lib/rdw/normalize";
import type { Locale } from "@/lib/i18n/messages";

export type EmailContent = { subject: string; html: string };

function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "https://kentekenrapport.com").replace(/\/+$/, "");
}

function formatAmount(amount: string, currency: string, locale: Locale): string {
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  const value = locale === "nl" ? amount.replace(".", ",") : amount;
  return `${symbol}${value}`;
}

function renderLayout(args: { bodyHtml: string; footerHtml: string }): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
      <div style="background:#0f172a;padding:20px 28px;">
        <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.4px;">Kentekenrapport</span>
      </div>
      <div style="padding:28px;color:#0f172a;font-size:15px;line-height:1.65;">
        ${args.bodyHtml}
      </div>
      <div style="padding:18px 28px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
        ${args.footerHtml}
      </div>
    </div>
  </body>
</html>`;
}

function renderButton(url: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 28px;border-radius:8px;">${label}</a>
  </p>`;
}

export function buildThankYouEmail(args: {
  plate: string;
  amount: string;
  currency: string;
  orderId: string;
  locale: Locale;
}): EmailContent {
  const displayPlate = formatDisplayPlate(args.plate) || args.plate;
  const amount = formatAmount(args.amount, args.currency, args.locale);
  const reportUrl = `${getBaseUrl()}/search/${encodeURIComponent(args.plate)}?utm_source=kentekenrapport&utm_medium=email&utm_campaign=thank_you`;

  if (args.locale === "en") {
    return {
      subject: `Thank you for your purchase: vehicle report ${displayPlate}`,
      html: renderLayout({
        bodyHtml: `
          <p>Hi!</p>
          <p>Thank you for your purchase at Kentekenrapport. We have successfully received your payment of <strong>${amount}</strong> for license plate <strong>${displayPlate}</strong>.</p>
          <p>All premium sections of the report are now unlocked for you:</p>
          ${renderButton(reportUrl, "View your report")}
          <p>Questions about your report or payment? Just reply to this email, I am happy to help.</p>
          <p>Best regards,<br><strong>Anouk van Kentekenrapport</strong></p>`,
        footerHtml: `You are receiving this email because you purchased a vehicle report on kentekenrapport.com.<br>Order reference: ${args.orderId}`
      })
    };
  }

  return {
    subject: `Bedankt voor je aankoop: kentekenrapport ${displayPlate}`,
    html: renderLayout({
      bodyHtml: `
        <p>Hoi!</p>
        <p>Bedankt voor je aankoop bij Kentekenrapport. Je betaling van <strong>${amount}</strong> voor kenteken <strong>${displayPlate}</strong> is goed ontvangen.</p>
        <p>Alle premium onderdelen van het rapport zijn nu voor je ontgrendeld:</p>
        ${renderButton(reportUrl, "Bekijk je rapport")}
        <p>Heb je vragen over je rapport of de betaling? Beantwoord gewoon deze e-mail, ik help je graag verder.</p>
        <p>Groetjes,<br><strong>Anouk van Kentekenrapport</strong></p>`,
      footerHtml: `Je ontvangt deze e-mail omdat je een kentekenrapport hebt gekocht op kentekenrapport.com.<br>Ordernummer: ${args.orderId}`
    })
  };
}

export function buildFollowUpEmail(args: { plate: string; locale: Locale }): EmailContent {
  const displayPlate = formatDisplayPlate(args.plate) || args.plate;
  const checkoutUrl = `${getBaseUrl()}/search/${encodeURIComponent(args.plate)}?utm_source=kentekenrapport&utm_medium=email&utm_campaign=abandoned_checkout`;

  if (args.locale === "en") {
    return {
      subject: `Your vehicle report for ${displayPlate} is still waiting for you`,
      html: renderLayout({
        bodyHtml: `
          <p>Hi!</p>
          <p>I noticed you wanted to view the vehicle report for license plate <strong>${displayPlate}</strong>, but the payment was not completed. No worries, that happens!</p>
          <p>Your report is still ready for you. You can finish the payment in just a few clicks:</p>
          ${renderButton(checkoutUrl, "Complete your report")}
          <p>Still in doubt or running into an issue? Just reply to this email, I am happy to help.</p>
          <p>Best regards,<br><strong>Anouk van Kentekenrapport</strong></p>`,
        footerHtml: `You are receiving this one-time email because you entered your email address at checkout on kentekenrapport.com.`
      })
    };
  }

  return {
    subject: `Je kentekenrapport voor ${displayPlate} staat nog voor je klaar`,
    html: renderLayout({
      bodyHtml: `
        <p>Hoi!</p>
        <p>Ik zag dat je het kentekenrapport voor <strong>${displayPlate}</strong> wilde bekijken, maar dat de betaling niet helemaal is afgerond. Geen zorgen, dat gebeurt wel vaker!</p>
        <p>Je rapport staat nog steeds voor je klaar. Je rondt de betaling in een paar klikken af:</p>
        ${renderButton(checkoutUrl, "Rapport afronden")}
        <p>Twijfel je nog of loop je ergens tegenaan? Beantwoord gewoon deze e-mail, ik help je graag verder.</p>
        <p>Groetjes,<br><strong>Anouk van Kentekenrapport</strong></p>`,
      footerHtml: `Je ontvangt deze e-mail eenmalig omdat je je e-mailadres hebt ingevuld bij het afrekenen op kentekenrapport.com.`
    })
  };
}
