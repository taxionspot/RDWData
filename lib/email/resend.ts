import nodemailer from "nodemailer";

type EmailAttachment = {
  filename: string;
  content: string;
};

export type SendEmailResult = { delivered: boolean; reason?: string; transport?: string };

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

// Maskeer een login/e-mailadres voor veilige diagnostiek (geen volledig adres
// in een API-respons of log). "info@kentekenrapport.com" -> "in***@kentekenrapport.com".
export function maskLogin(login: string): string {
  const at = login.indexOf("@");
  if (at <= 0) return login ? `${login.slice(0, 2)}***` : "";
  const local = login.slice(0, at);
  const domain = login.slice(at);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"*".repeat(Math.max(1, local.length - head.length))}${domain}`;
}

// Vervang voorkomens van de echte login/From-adres in een (fout)tekst door de
// gemaskeerde variant. SMTP-foutmeldingen (bv. Gmail 535) bevatten vaak het
// volledige loginadres; dat mag niet kaal terug in een API-respons of log.
function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join(maskLogin(secret));
  }
  return out;
}

// Ruimere time-outs dan voorheen (was 5s, te krap): een koude serverless-
// functie op Vercel haalt de TLS-handshake + auth + verzending van Gmail soms
// net niet binnen 5s, waardoor mail STIL faalde op een time-out. De OVERALL-cap
// hieronder houdt het geheel onder de Vercel-functielimiet.
const TIMEOUTS = {
  connectionTimeout: 6000,
  greetingTimeout: 6000,
  socketTimeout: 7000
};

// Harde bovengrens voor de hele verzendpoging (incl. fallback), zodat het
// betaal-/capturepad nooit langer dan dit wordt opgehouden.
const OVERALL_TIMEOUT_MS = 7500;

type TransportOption = { port: number; secure: boolean; label: string };

// Probeer eerst SMTPS (465), val daarna terug op STARTTLS (587). Sommige
// netwerken/regio's blokkeren of vertragen de ene poort wel en de andere niet.
const TRANSPORTS: TransportOption[] = [
  { port: 465, secure: true, label: "smtps:465" },
  { port: 587, secure: false, label: "starttls:587" }
];

function isAuthError(error: unknown, details: string): boolean {
  const err = error as { code?: string; responseCode?: number };
  return (
    err?.code === "EAUTH" ||
    err?.responseCode === 535 ||
    /username and password not accepted|invalid login|badcredentials|5\.7\.\d/i.test(details)
  );
}

// Alleen een mislukte VERBINDINGSOPBOUW is veilig om op de volgende poort over
// te doen: er is dan gegarandeerd nog geen bericht naar Gmail gegaan. Bij elke
// andere fout (socket dood tijdens DATA, time-out na verzenden) zou een retry
// op poort 587 hetzelfde bericht een tweede keer kunnen versturen.
function isConnectionError(error: unknown): boolean {
  const err = error as { code?: string; command?: string };
  return err?.command === "CONN" || err?.code === "ECONNECTION" || err?.code === "EDNS";
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
  const fromAddress = parseAddress(from);

  // Net als de oude Resend-flow: ontbreekt de configuratie, dan geen fout
  // gooien maar netjes melden dat er niet bezorgd is, zodat checkout/capture
  // nooit faalt op een ontbrekende mailconfiguratie.
  if (!pass || !user) {
    return { delivered: false, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }

  const redact = (text: string) => redactSecrets(text, [user, fromAddress]);

  const mail = {
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
            encoding: "base64" as const
          }))
        }
      : {})
  };

  const attempt = (async (): Promise<SendEmailResult> => {
    const failures: string[] = [];

    for (let i = 0; i < TRANSPORTS.length; i++) {
      const option = TRANSPORTS[i];
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: option.port,
          secure: option.secure,
          auth: { user, pass },
          ...TIMEOUTS
        });

        await transporter.sendMail(mail);
        return { delivered: true, transport: option.label };
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        failures.push(`${option.label}: ${details}`);

        // Een auth-fout (verkeerd/oud app-wachtwoord, 2FA uit, app-wachtwoorden
        // geblokkeerd) faalt op elke poort hetzelfde -> meteen melden. Dit is de
        // typische "mail komt niet aan"-oorzaak.
        if (isAuthError(error, details)) {
          return { delivered: false, reason: redact(`EMAIL_AUTH_FAILED:${details}`), transport: option.label };
        }

        // Val alleen terug op de volgende poort bij een puur mislukte
        // verbindingsopbouw (geen dubbele verzending mogelijk). Anders stoppen.
        const hasNext = i < TRANSPORTS.length - 1;
        if (!(isConnectionError(error) && hasNext)) {
          return {
            delivered: false,
            reason: redact(`EMAIL_SEND_FAILED:${failures.join(" | ")}`),
            transport: option.label
          };
        }
      }
    }

    return { delivered: false, reason: redact(`EMAIL_SEND_FAILED:${failures.join(" | ")}`) };
  })();

  // Harde overkoepelende time-out: het capturepad mag nooit langer blijven
  // hangen dan dit, ongeacht de individuele SMTP-time-outs.
  const overall = new Promise<SendEmailResult>((resolve) =>
    setTimeout(() => resolve({ delivered: false, reason: "EMAIL_TIMEOUT" }), OVERALL_TIMEOUT_MS)
  );

  return Promise.race([attempt, overall]);
}

/**
 * Veilige (gemaskeerde) status van de e-mailconfiguratie voor de diagnose-
 * endpoint. Bevat NOOIT de echte login of het app-wachtwoord, alleen of ze
 * aanwezig zijn en of de login bij het From-adres past (een veelvoorkomende
 * Gmail-afwijzingsreden: het From-adres is geen geverifieerde "send as").
 */
export function getEmailConfigStatus() {
  const from = getEmailFrom();
  const pass = process.env.GMAIL_APP_PASSWORD ?? "";
  const user = process.env.GMAIL_USER || parseAddress(from);
  const fromAddress = parseAddress(from);
  return {
    from,
    fromAddress,
    user: maskLogin(user),
    hasUser: Boolean(user),
    hasPass: Boolean(pass),
    passLength: pass.length,
    loginMatchesFrom: fromAddress.toLowerCase() === user.toLowerCase()
  };
}
