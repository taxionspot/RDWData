import { NextResponse } from "next/server";
import { getAdminSessionFromCookies } from "@/lib/admin/session";
import { isCompEmail } from "@/lib/payments/server-access";
import { sendEmail, getEmailConfigStatus } from "@/lib/email/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live e-mail-diagnose. Toegang: ingelogde admin (mag naar elk adres), of
 * zonder login alleen naar een allowlisted eigenaar-adres (isCompEmail).
 * Verstuurt een echte testmail via exact dezelfde sendEmail() als de bedank-/
 * eigenaar-test-mail en geeft het resultaat + de (gemaskeerde) configuratie
 * terug, zodat in één klik duidelijk is OF en WAAROM mail faalt:
 *
 *   GET /api/admin/email-test?to=jouwadres@voorbeeld.nl
 *
 * delivered:true -> check je inbox (config klopt). delivered:false + reason:
 *   - EMAIL_PROVIDER_NOT_CONFIGURED -> GMAIL_USER/GMAIL_APP_PASSWORD ontbreken in Vercel
 *   - EMAIL_AUTH_FAILED:...        -> app-wachtwoord fout/oud, 2FA uit, of app-wachtwoorden geblokkeerd
 *   - EMAIL_SEND_FAILED:...        -> netwerk/poort/time-out of geweigerd From-adres
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = (url.searchParams.get("to") ?? "").trim();
  const config = getEmailConfigStatus();

  // Toegang: een ingelogde admin mag naar elk adres testen; zonder login mag
  // het alleen naar een allowlisted eigenaar-adres (isCompEmail), zodat de
  // eigenaar zonder admin-login kan testen en de blast radius beperkt blijft
  // tot zijn eigen inbox.
  const session = getAdminSessionFromCookies();
  if (!session && !isCompEmail(to)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Geef een geldig e-mailadres op via ?to=adres@voorbeeld.nl",
        config
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const result = await sendEmail({
    to,
    subject: "Kentekenrapport e-mailtest",
    html: `<p>Dit is een e-mailtest vanaf kentekenrapport.com.</p>
<p>Tijdstip: ${now}</p>
<p>Ontvang je deze e-mail, dan werkt de Gmail/SMTP-configuratie correct.</p>`
  });

  return NextResponse.json({
    ok: result.delivered,
    sentTo: to,
    result,
    config,
    timestamp: now
  });
}
