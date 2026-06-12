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

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  if (!apiKey) {
    return { delivered: false, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: getEmailFrom(),
      to: [args.to],
      subject: args.subject,
      html: args.html,
      ...(args.attachments?.length ? { attachments: args.attachments } : {})
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const details = await response.text();
    return { delivered: false, reason: `EMAIL_SEND_FAILED:${response.status}:${details}` };
  }
  return { delivered: true };
}
