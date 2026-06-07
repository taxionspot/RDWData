import type { ElementType } from "react";
import { Coins, Gauge, Leaf, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import type { AnalystVerdict, ReportSection, SectionId, SectionTone, Severity, VehicleReport } from "@/lib/agents/types";
import styles from "./AgentReport.module.css";

type Locale = "nl" | "en";

function verdictMeta(verdict: AnalystVerdict, locale: Locale): { label: string; color: string } {
  const nl = locale === "nl";
  switch (verdict) {
    case "BUY":
      return { label: nl ? "Kopen" : "Buy", color: "#16a34a" };
    case "CONSIDER":
      return { label: nl ? "Overwegen" : "Consider", color: "#0ea5e9" };
    case "CAUTION":
      return { label: nl ? "Voorzichtig" : "Caution", color: "#d97706" };
    default:
      return { label: nl ? "Afraden" : "Avoid", color: "#dc2626" };
  }
}

const SECTION_ICONS: Record<SectionId, ElementType> = {
  odometer: Gauge,
  defects: Wrench,
  compliance: Leaf,
  value: Coins
};

function toneColors(tone: SectionTone): { bg: string; fg: string; icon: string } {
  switch (tone) {
    case "success":
      return { bg: "#dcfce7", fg: "#15803d", icon: "#16a34a" };
    case "warning":
      return { bg: "#fef3c7", fg: "#b45309", icon: "#d97706" };
    case "danger":
      return { bg: "#fee2e2", fg: "#b91c1c", icon: "#dc2626" };
    default:
      return { bg: "#e0f2fe", fg: "#0369a1", icon: "#0ea5e9" };
  }
}

function severityColor(severity: Severity): string {
  switch (severity) {
    case "high":
      return "#dc2626";
    case "medium":
      return "#d97706";
    case "low":
      return "#65a30d";
    default:
      return "#2563eb";
  }
}

function SectionCard({ section }: { section: ReportSection }) {
  const Icon = SECTION_ICONS[section.id] ?? ShieldCheck;
  const tone = toneColors(section.tone);
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionIcon} style={{ background: tone.bg, color: tone.icon }}>
            <Icon size={18} />
          </span>
          {section.title}
        </div>
        {section.status ? (
          <span className={styles.statusPill} style={{ background: tone.bg, color: tone.fg }}>
            {section.status}
          </span>
        ) : null}
      </div>

      {section.summary ? <p className={styles.sectionSummary}>{section.summary}</p> : null}

      {section.facts.length > 0 ? (
        <div className={styles.facts}>
          {section.facts.map((f) => (
            <div key={f.label} className={styles.fact}>
              <div className={styles.factLabel}>{f.label}</div>
              <div className={styles.factValue}>{f.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {section.findings.length > 0 ? (
        <div className={styles.findings}>
          {section.findings.map((finding, i) => (
            <div key={`${section.id}-${i}`} className={styles.finding}>
              <span className={styles.sevDot} style={{ background: severityColor(finding.severity) }} />
              <div className={styles.findingBody}>
                <div className={styles.findingLabel}>{finding.label}</div>
                <div className={styles.findingDetail}>{finding.detail}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AgentReport({ report, locale }: { report: VehicleReport; locale: Locale }) {
  const a = report.analyst;
  const v = verdictMeta(a.verdict, locale);
  const degrees = Math.round((a.score / 100) * 360);

  return (
    <div className={styles.wrap}>
      <div className={styles.cover}>
        <div className={styles.scoreBlock}>
          <div className={styles.ring} style={{ background: `conic-gradient(${v.color} 0 ${degrees}deg, rgba(148,163,184,0.25) ${degrees}deg 360deg)` }}>
            <div className={styles.ringInner}>
              <div className={styles.scoreValue}>{a.score}</div>
              <div className={styles.scoreMax}>{locale === "nl" ? "van 100" : "out of 100"}</div>
            </div>
          </div>
          <span className={styles.verdictChip} style={{ background: v.color }}>
            {v.label}
          </span>
        </div>

        <div className={styles.coverBody}>
          <span className={styles.eyebrow}>
            <Sparkles size={14} /> {locale === "nl" ? "AI-aankoopoordeel" : "AI purchase verdict"}
          </span>
          {a.headline ? <div className={styles.headline}>{a.headline}</div> : null}
          {a.summary ? <p className={styles.summary}>{a.summary}</p> : null}

          {(a.positives.length > 0 || a.risks.length > 0) && (
            <div className={styles.cols}>
              {a.positives.length > 0 && (
                <div className={styles.col}>
                  <div className={`${styles.colTitle} ${styles.colTitlePos}`}>{locale === "nl" ? "Sterke punten" : "Strengths"}</div>
                  <ul className={`${styles.list} ${styles.colPos}`}>
                    {a.positives.map((p, i) => (
                      <li key={`p${i}`}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {a.risks.length > 0 && (
                <div className={styles.col}>
                  <div className={`${styles.colTitle} ${styles.colTitleNeg}`}>{locale === "nl" ? "Aandachtspunten" : "Watch-outs"}</div>
                  <ul className={`${styles.list} ${styles.colNeg}`}>
                    {a.risks.map((r, i) => (
                      <li key={`r${i}`}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {a.recommendation ? (
            <div className={styles.recommendation}>
              <strong>{locale === "nl" ? "Advies: " : "Recommendation: "}</strong>
              {a.recommendation}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.sections}>
        {report.sections.map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
      </div>

      <p className={styles.disclaimer}>
        {report.aiSource === "fallback"
          ? locale === "nl"
            ? "Automatisch gegenereerd (AI tijdelijk niet beschikbaar). Indicatie op basis van RDW-data, geen garantie."
            : "Automatically generated (AI temporarily unavailable). Indication based on RDW data, no guarantee."
          : locale === "nl"
          ? "Analyse door gespecialiseerde AI-agents op basis van officiele RDW-data. Een indicatie, geen taxatie of garantie. Combineer altijd met een fysieke inspectie."
          : "Analysis by specialised AI agents based on official RDW data. An indication, not an appraisal or guarantee. Always combine with a physical inspection."}
      </p>
    </div>
  );
}
