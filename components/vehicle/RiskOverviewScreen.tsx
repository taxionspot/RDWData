"use client";

import Link from "next/link";
import type { ElementType } from "react";
import {
  ArrowUpRight,
  FileCheck2,
  Gauge,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import styles from "./RiskOverviewScreen.module.css";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { VehicleNavBar } from "./VehicleNavBar";
import { PremiumLock } from "../ui/PremiumLock";
import { useI18n } from "@/lib/i18n/context";


type Props = {
  plate?: string;
};

function buildPlateHref(plate: string | undefined, suffix = "") {
  if (!plate) return suffix || "/";
  return `/search/${plate}${suffix}`;
}

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
}

type RiskCardTone = "success" | "warning" | "primary";

type RiskCardDef = {
  id: string;
  title: string;
  status: string;
  description: string;
  badge: string;
  trend: string;
  icon: ElementType;
  tone: RiskCardTone;
  link: string;
};

function RiskCard({
  title,
  status,
  description,
  badge,
  trend,
  icon: Icon,
  tone,
  link,
  locale
}: {
  title: string;
  status: string;
  description: string;
  badge: string;
  trend: string;
  icon: ElementType;
  tone: RiskCardTone;
  link: string;
  locale: "nl" | "en";
}) {
  return (
    <Link href={link} className={styles.riskCard}>
      <div className={styles.cardTop}>
        <div className={styles.cardIconStack}>
          <div className={`${styles.riskIconWrapper} ${styles[`icon${tone}`]}`}>
            <Icon size={24} />
          </div>
          <div className={`${styles.cardBadge} ${styles[`badge${tone}`]}`}>{badge}</div>
        </div>
        <div className={styles.riskChevron}>
          <ArrowUpRight size={18} />
        </div>
      </div>
      <div className={styles.riskBody}>
        <div className={styles.riskTitle}>{title}</div>
        <div className={styles.riskStatus}>{status}</div>
        <div className={styles.riskDescription}>{description}</div>
      </div>
      <div className={styles.riskFooter}>
        <div className={styles.trendRow}>
          <span className={`${styles.trendDot} ${styles[`trend${tone}`]}`} />
          <span className={styles.trendText}>{trend}</span>
        </div>
        <div className={styles.viewLink}>{locale === "nl" ? "Open historie" : "Open history"}</div>
      </div>
    </Link>
  );
}

export function RiskOverviewScreen({ plate }: Props) {
  const { locale } = useI18n();
  const { isValid, data, isLoading, isError } = useVehicleLookup(plate ?? "");

  if (!plate || !isValid || isError) {
    return (
      <div className={styles.page}>
        <div className={styles.pageContainer}>
          <div className={styles.contentContainer}>
            <div className={styles.glassPanel}>{locale === "nl" ? "Voertuig niet gevonden." : "Vehicle not found."}</div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className={styles.page}>
        <div className={styles.pageContainer}>
          <div className={styles.contentContainer}>
            <div className={styles.glassPanel}>{locale === "nl" ? "Risico-overzicht laden..." : "Loading risk overview..."}</div>
          </div>
        </div>
      </div>
    );
  }

  const v = data.vehicle;

  // Trust snapshot computed from the real RDW signals (no hardcoded verdict).
  const nl = locale === "nl";
  const napIllogical = !!v.napVerdict && v.napVerdict.toLowerCase().includes("onlogisch");
  const apkExpired = !!v.apkExpiryDate && new Date(v.apkExpiryDate).getTime() < Date.now();
  const attentionItems = [
    v.hasOpenRecall ? (nl ? "openstaande terugroepactie" : "open recall") : null,
    apkExpired ? (nl ? "verlopen APK" : "expired APK") : null,
    data.defects.length > 3 ? (nl ? `${data.defects.length} defectrecords` : `${data.defects.length} defect records`) : null,
    (v.owners.count ?? 0) > 4 ? (nl ? "veel tenaamstellingen" : "many registrations") : null,
    v.isTaxi ? (nl ? "ex-taxi (intensief gebruik)" : "ex-taxi (intensive use)") : null,
    v.exportIndicator ? (nl ? "gemarkeerd voor export" : "marked for export") : null
  ].filter(Boolean) as string[];
  const riskLevel: "low" | "medium" | "high" =
    napIllogical || v.wok ? "high" : attentionItems.length > 0 ? "medium" : "low";
  const riskLabel =
    riskLevel === "high" ? (nl ? "Hoog risico" : "High risk") : riskLevel === "medium" ? (nl ? "Aandachtspunten" : "Needs attention") : (nl ? "Laag risico" : "Low risk");
  const riskColor = riskLevel === "high" ? "#dc2626" : riskLevel === "medium" ? "#d97706" : undefined;
  const riskNote =
    riskLevel === "high"
      ? napIllogical
        ? nl ? "Tellerstand is door RDW als onlogisch gemarkeerd (NAP)." : "Odometer is flagged illogical by RDW (NAP)."
        : nl ? "Registratieblokkade (WOK) actief op dit voertuig." : "Registration block (WOK) active on this vehicle."
      : riskLevel === "medium"
      ? nl ? `Let op: ${attentionItems.join(", ")}.` : `Attention: ${attentionItems.join(", ")}.`
      : nl ? "Geen grote rode vlaggen in de belangrijkste RDW-datasets." : "No major red flags in the key RDW datasets.";
  const nextAction =
    napIllogical || data.enriched?.mileageVerdict === "ONLOGISCH"
      ? nl ? "Open de kilometerhistorie om de tellerstand te controleren." : "Open mileage history to verify the odometer."
      : data.defects.length > 0
      ? nl ? "Open de schadehistorie om de gemelde defecten te bekijken." : "Open damage history to review the reported defects."
      : nl ? "Open de eigendomshistorie om de registratiedatums te bekijken." : "Open ownership history to review the registration dates.";

  // Full, data-grounded analysis: every relevant RDW signal turned into a plain
  // language finding with a severity. This is the "analyse van alle data met de
  // bevindingen" — deterministic (no AI dependency) so it is always available.
  type Severity = "high" | "medium" | "low" | "info";
  type Finding = { id: string; severity: Severity; title: string; detail: string };
  const findings: Finding[] = [];
  const fmtEur = (n: number | null | undefined) =>
    n == null ? "-" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  if (napIllogical || data.enriched?.mileageVerdict === "ONLOGISCH") {
    findings.push({ id: "odo", severity: "high", title: nl ? "Kilometerstand onlogisch (NAP)" : "Odometer illogical (NAP)", detail: nl ? "RDW markeert de tellerstand als onlogisch. Serieus risico op een teruggedraaide teller; koop niet zonder onafhankelijke controle." : "RDW marks the odometer as illogical. Serious rollback risk; do not buy without an independent check." });
  } else if (data.enriched?.mileageVerdict === "TWIJFELACHTIG") {
    findings.push({ id: "odo", severity: "medium", title: nl ? "Kilometerstand twijfelachtig" : "Odometer doubtful", detail: nl ? "De kilometerhistorie vertoont onregelmatigheden. Vraag facturen en het onderhoudsboekje op." : "The mileage history shows irregularities. Ask for invoices and the service book." });
  }
  if (v.wok) findings.push({ id: "wok", severity: "high", title: nl ? "Registratieblokkade (WOK)" : "Registration block (WOK)", detail: nl ? "Het voertuig is niet rijklaar tot een herkeuring akkoord is. Dit is een serieus aandachtspunt." : "Not road-legal until it passes a re-inspection. A serious concern." });
  if (v.hasOpenRecall) findings.push({ id: "recall", severity: "medium", title: nl ? "Openstaande terugroepactie" : "Open recall", detail: nl ? "Er staat een terugroepactie open. Laat dit kosteloos verhelpen bij een merkdealer." : "An open recall exists. Have it fixed free of charge at a brand dealer." });
  if (apkExpired) findings.push({ id: "apk", severity: "medium", title: nl ? "APK verlopen" : "MOT expired", detail: nl ? "De APK is verlopen; reken op een keuring en mogelijk herstel voordat je mag rijden." : "The MOT has expired; budget for an inspection and possible repairs before driving." });
  else if (v.apkExpiryDate) findings.push({ id: "apk", severity: "info", title: nl ? "APK geldig" : "MOT valid", detail: `${nl ? "Geldig tot" : "Valid until"} ${formatDate(v.apkExpiryDate)}.` });
  if (v.isTaxi) findings.push({ id: "taxi", severity: "medium", title: nl ? "Ex-taxi (intensief gebruik)" : "Ex-taxi (intensive use)", detail: nl ? "Geregistreerd als taxi: hoog jaarkilometrage en meer slijtage. Weegt mee in onze kilometer- en waardeschatting." : "Registered as a taxi: high annual mileage and more wear. Factored into our mileage and value estimate." });
  if (v.exportIndicator) findings.push({ id: "export", severity: "medium", title: nl ? "Gemarkeerd voor export" : "Marked for export", detail: nl ? "Het voertuig staat als export gemarkeerd; controleer de status voordat je koopt." : "The vehicle is marked for export; verify the status before buying." });
  if (data.enriched?.isImported) findings.push({ id: "import", severity: "low", title: nl ? "Geïmporteerd voertuig" : "Imported vehicle", detail: nl ? "Eerste toelating in het buitenland. Vaak een iets lagere of lastiger te bepalen marktwaarde." : "First admitted abroad. Often a slightly lower or harder-to-determine market value." });
  if ((v.owners.count ?? 0) > 4) findings.push({ id: "owners", severity: "medium", title: `${v.owners.count} ${nl ? "tenaamstellingen" : "registrations"}`, detail: nl ? "Relatief veel registraties. Vraag naar de reden van de wisselingen." : "Relatively many registrations. Ask why it changed hands so often." });

  // Recurring defects from the real APK records (top 4 by frequency).
  const defectFreq = new Map<string, { count: number; desc: string }>();
  for (const row of data.defects as Array<Record<string, unknown>>) {
    const code = String(row.gebrek_identificatie ?? "").trim();
    if (!code) continue;
    const desc = data.defectDescriptions[code] || code;
    const cur = defectFreq.get(code);
    if (cur) cur.count += 1;
    else defectFreq.set(code, { count: 1, desc });
  }
  Array.from(defectFreq.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .forEach((d, i) =>
      findings.push({
        id: `defect-${i}`,
        severity: d.count > 1 ? "medium" : "low",
        title: d.desc,
        detail: `${d.count}× ${nl ? "geconstateerd bij de APK. Controleer of dit is verholpen." : "found at the APK. Check whether it has been fixed."}`
      })
    );

  if (data.enriched?.estimatedMileageNow != null) {
    findings.push({ id: "km", severity: "info", title: nl ? "Geschatte kilometerstand" : "Estimated mileage", detail: `~${Math.round(data.enriched.estimatedMileageNow).toLocaleString("nl-NL")} km${data.enriched.mileageEstimateSource === "formula" ? (nl ? " (schatting o.b.v. leeftijd en gebruik; RDW publiceert geen kilometerhistorie)" : " (estimate from age and usage; RDW publishes no odometer history)") : ""}.` });
  }
  if (data.enriched?.estimatedValueNow != null) {
    findings.push({ id: "value", severity: "info", title: nl ? "Geschatte marktwaarde" : "Estimated market value", detail: `${fmtEur(data.enriched.estimatedValueNow)}${data.enriched.marketValueConfidence ? ` (${nl ? "betrouwbaarheid" : "confidence"} ${data.enriched.marketValueConfidence})` : ""}.` });
  }
  if (!findings.some((f) => f.severity === "high" || f.severity === "medium")) {
    findings.unshift({ id: "clean", severity: "low", title: nl ? "Geen grote rode vlaggen" : "No major red flags", detail: nl ? "In de belangrijkste RDW-datasets vonden we geen zware risicosignalen. Beoordeel de auto altijd ook fysiek." : "We found no serious risk signals in the key RDW datasets. Always inspect the car physically too." });
  }

  const severityMeta: Record<Severity, { label: string; color: string; bg: string }> = {
    high: { label: nl ? "Hoog" : "High", color: "#991b1b", bg: "#fef2f2" },
    medium: { label: nl ? "Aandacht" : "Attention", color: "#92400e", bg: "#fffbeb" },
    low: { label: nl ? "Laag" : "Low", color: "#3f6212", bg: "#f7fee7" },
    info: { label: "Info", color: "#1e3a8a", bg: "#eff6ff" }
  };

  const resolvedMileageVerdict =
    data.enriched?.mileageVerdict && data.enriched.mileageVerdict !== "UNKNOWN"
      ? data.enriched.mileageVerdict
      : v.napVerdict ?? (locale === "nl" ? "Onbekend" : "Unknown");

  const mileageTone =
    typeof resolvedMileageVerdict === "string" && resolvedMileageVerdict.toLowerCase().includes("logisch")
      ? "success"
      : "warning";

  const riskCards: RiskCardDef[] = [
    {
      id: "mileage",
      title: locale === "nl" ? "Kilometerhistorie" : "Mileage History",
      status: resolvedMileageVerdict,
      description:
        locale === "nl"
          ? "Klopt de kilometerstand met de keuringshistorie? Belangrijk om een teruggedraaide teller te herkennen."
          : "Does the odometer match the inspection history? Key to spotting a rolled-back meter.",
      badge: resolvedMileageVerdict !== "Unknown" ? (locale === "nl" ? "Geverifieerd" : "Verified") : (locale === "nl" ? "Onbekend" : "Unknown"),
      trend: resolvedMileageVerdict ?? (locale === "nl" ? "Geen oordeel" : "No verdict"),
      icon: Gauge,
      tone: mileageTone,
      link: "/mileage-history"
    },
    {
      id: "damage",
      title: locale === "nl" ? "Schadehistorie" : "Damage History",
      status: data.defects.length === 0 ? (locale === "nl" ? "Geen defecten" : "No defects found") : `${data.defects.length} ${locale === "nl" ? "records" : "records"}`,
      description:
        locale === "nl"
          ? "Welke gebreken zijn bij keuringen gemeld? Dit bepaalt mogelijke herstelkosten."
          : "Which defects were reported at inspections? This drives potential repair costs.",
      badge: data.defects.length === 0 ? (locale === "nl" ? "Schoon" : "Clear") : (locale === "nl" ? "Controleren" : "Review"),
      trend: data.defects.length === 0 ? (locale === "nl" ? "Schoon dossier" : "Clean record") : (locale === "nl" ? "Controleer defecten" : "Check defects"),
      icon: ShieldCheck,
      tone: data.defects.length === 0 ? "success" : "warning",
      link: "/damage-history"
    },
    {
      id: "ownership",
      title: locale === "nl" ? "Eigendom" : "Ownership",
      status: v.owners.count ? `${v.owners.count} ${locale === "nl" ? "tenaamstellingen" : "registrations"}` : (locale === "nl" ? "Zie registratiedatums" : "See registration dates"),
      description:
        locale === "nl"
          ? "Hoe vaak is de auto op naam gezet? Veel wisselingen vragen om uitleg."
          : "How often was the car re-registered? Many changes are worth questioning.",
      badge: v.owners.count && v.owners.count > 2 ? (locale === "nl" ? "Controleren" : "Review") : (locale === "nl" ? "Stabiel" : "Stable"),
      trend: v.owners.count ? (locale === "nl" ? "Overdrachtsdatums" : "Transfer dates") : (locale === "nl" ? "Geen data" : "No data"),
      icon: Users,
      tone: v.owners.count && v.owners.count > 2 ? "warning" : "success",
      link: "/ownership-history"
    },
    {
      id: "apk",
      title: locale === "nl" ? "APK-keuring" : "APK Inspection",
      status: v.apkExpiryDate
        ? `${locale === "nl" ? "Geldig tot" : "Valid until"} ${formatDate(v.apkExpiryDate)}`
        : (locale === "nl" ? "Onbekend" : "Unknown"),
      description:
        locale === "nl"
          ? "Tot wanneer is de auto APK-gekeurd? Bepaalt of je binnenkort opnieuw moet keuren."
          : "How long is the MOT valid? Tells you if a new inspection is due soon.",
      badge: v.apkExpiryDate ? (locale === "nl" ? "Actueel" : "Current") : (locale === "nl" ? "Onbekend" : "Unknown"),
      trend: v.apkExpiryDate ? (locale === "nl" ? "APK actief" : "Inspection active") : (locale === "nl" ? "Ontbreekt" : "Missing"),
      icon: FileCheck2,
      tone: v.apkExpiryDate ? "primary" : "warning",
      link: "/inspection-timeline"
    }
  ];

  const resolvedCards = riskCards.map((card) => ({
    ...card,
    link: buildPlateHref(plate, card.link)
  }));

  return (
    <div className={styles.page}>
      <div className={styles.pageContainer}>
        <div className={styles.contentContainer}>
          <VehicleNavBar plate={plate} subtitle={locale === "nl" ? "Risico-overzicht" : "Risk overview"} />

          <PremiumLock featureName={locale === "nl" ? "Risico-overzicht" : "Risk Overview"} isLocked={true} plate={plate} sectionKey="riskOverview">
            <div className={`${styles.heroPanel} ${styles.glassPanel}`}>
              <div className={styles.heroCopy}>
                <div className={styles.eyebrow}>
                  <Sparkles size={14} /> {locale === "nl" ? "Slim risico-overzicht" : "Smart risk summary"}
                </div>
                <div className={styles.heroTitle}>{locale === "nl" ? "Begrijp het voertuig in seconden" : "Understand the vehicle in seconds"}</div>
                <div className={styles.heroSubtitle}>
                  {locale === "nl"
                    ? "Elke kaart toont een kerncontrole met status, context en een directe route naar detailhistorie."
                    : "Each card highlights a core checkpoint with status signals, supportive context, and a clear path into the detailed history."}
                </div>
              </div>
              <div className={styles.heroSide}>
                <div className={styles.spotlightCard}>
                  <div className={styles.spotlightLabel}>{locale === "nl" ? "Vertrouwenssnapshot" : "Vehicle trust snapshot"}</div>
                  <div className={styles.spotlightValue} style={{ color: riskColor }}>{riskLabel}</div>
                  <div className={styles.spotlightNote}>{riskNote}</div>
                </div>
                <div className={styles.spotlightCard}>
                  <div className={styles.spotlightLabel}>{locale === "nl" ? "Beste vervolgstap" : "Next best action"}</div>
                  <div className={styles.spotlightNote}>{nextAction}</div>
                </div>
              </div>
            </div>

            <div className={`${styles.riskSection} ${styles.glassPanel}`}>
              <div style={{ marginBottom: "16px" }}>
                <div className={styles.heroTitle} style={{ fontSize: "20px" }}>
                  {nl ? "Volledige analyse: bevindingen en risico's" : "Full analysis: findings and risks"}
                </div>
                <div className={styles.heroSubtitle} style={{ marginTop: "4px" }}>
                  {nl
                    ? "Elke relevante RDW-bron beoordeeld en vertaald naar wat het voor jou als koper betekent."
                    : "Every relevant RDW source assessed and translated into what it means for you as a buyer."}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {findings.map((f) => {
                  const meta = severityMeta[f.severity];
                  return (
                    <div
                      key={f.id}
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "flex-start",
                        padding: "12px 14px",
                        borderRadius: "12px",
                        background: meta.bg,
                        border: `1px solid ${meta.color}22`
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: "11px",
                          fontWeight: 700,
                          color: meta.color,
                          background: "#ffffff",
                          border: `1px solid ${meta.color}33`,
                          borderRadius: "999px",
                          padding: "3px 9px",
                          minWidth: "62px",
                          textAlign: "center"
                        }}
                      >
                        {meta.label}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{f.title}</div>
                        <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5, marginTop: "2px" }}>{f.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${styles.riskSection} ${styles.glassPanel}`}>
              <div className={styles.riskGrid}>
                {resolvedCards.map((card) => (
                  <RiskCard key={card.id} {...card} locale={locale} />
                ))}
              </div>
            </div>
          </PremiumLock>

        </div>
      </div>
    </div>
  );
}

