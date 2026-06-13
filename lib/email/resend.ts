import nodemailer from "nodemailer";

type EmailAttachment = {
  filename: string;
  content: string;
};

export type SendEmailResult = { delivered: boolean; reason?: string };

export function getEmailFrom(): string {
  return (
    process.env.EMAIL_FROM ??
    process.env.REPORT_EMAIL_FROM ??
    "Anouk van Kentekenrapport <info@kentekenrapport.com>"
  );
}

// Haal het kale e-mailadres uit een From-header als "Naam <adres@domein>".
// Gebruikt als fallback voor de SMTP-login wanneer GMAIL_USER niet is gezet.
function parseAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim();
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<SendEmailResult> {
  const from = getEmailFrom();
  const pass = process.env.GMAIL_APP_PASSWORD ?? "";
  const user = process.env.GMAIL_USER || parseAddress(from);

  // Net als de oude Resend-flow: ontbreekt de configuratie, dan geen fout
  // gooien maar netjes melden dat er niet bezorgd is, zodat checkout/capture
  // nooit faalt op een ontbrekende mailconfiguratie.
  if (!pass || !user) {
    return { delivered: false, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      ...(args.attachments?.length
        ? {
            // De content is een base64-string (zoals bij de PDF-bijlage),
            // dus expliciet met encoding "base64" doorgeven aan nodemailer.
            attachments: args.attachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content,
              encoding: "base64"
            }))
          }
        : {})
    });

    return { delivered: true };
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return { delivered: false, reason: `EMAIL_SEND_FAILED:${details}` };
  }
}
