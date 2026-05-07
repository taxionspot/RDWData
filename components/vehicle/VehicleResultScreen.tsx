"use client";

import { useEffect, useMemo, useState, type ElementType } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Clock3,
  Coins,
  Download,
  Fuel,
  Gauge,
  RefreshCw,
  Settings2,
  Share2,
  ShieldCheck,
  TrendingUp,
  Wrench
} from "lucide-react";

import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { formatDisplayPlate } from "@/lib/rdw/normalize";
import { getVehicleImageUrl } from "@/lib/utils/imagin";
import { useI18n } from "@/lib/i18n/context";
import { hasPaidAccessForPlate } from "@/lib/payments/access";
import styles from "./VehicleResultScreen.module.css";
import { VehicleNavBar } from "./VehicleNavBar";
import { SubscriptionModal } from "@/components/ui/SubscriptionModal";
import { UserAuthModal } from "@/components/ui/UserAuthModal";

type Props = { plate: string };

type ScoreTone = "strong" | "steady" | "mixed" | "caution";

type ScoreResult = {
  score: number;
  tone: ScoreTone;
  label: string;
  description: string;
  confidence: string;
  riskFlag: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatCurrency(amount: number | null) {
  if (amount === null || Number.isNaN(amount)) return "N/A";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(amount);
}

function formatNumber(value: number | null, unit?: string) {
  if (value === null || Number.isNaN(value)) return "-";
  return unit ? `${value.toLocaleString("nl-NL")} ${unit}` : value.toLocaleString("nl-NL");
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function titleCase(value: string | null) {
  if (!value) return "-";
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getScoreTone(score: number): ScoreTone {
  if (score >= 80) return "strong";
  if (score >= 65) return "steady";
  if (score >= 50) return "mixed";
  return "caution";
}

function buildScoreResult(args: {
  defects: number;
  riskScore: number;
  apkPassChance: number | null;
  wok: boolean;
  imported: boolean;
  locale: "nl" | "en";
}): ScoreResult {
  const base = 78;
  const defectPenalty = Math.min(args.defects * 2.5, 18);
  const riskPenalty = Math.round(args.riskScore * 2.2);
  const wokPenalty = args.wok ? 16 : 0;
  const importPenalty = args.imported ? 6 : 0;
  const apkBonus = args.apkPassChance ? Math.round(args.apkPassChance / 12) : 0;

  const score = clamp(base + apkBonus - defectPenalty - riskPenalty - wokPenalty - importPenalty, 32, 95);
  const tone = getScoreTone(score);

  const labelByTone: Record<ScoreTone, string> = {
    strong: args.locale === "nl" ? "Sterk resultaat" : "Strong result",
    steady: args.locale === "nl" ? "Stabiel profiel" : "Steady profile",
    mixed: args.locale === "nl" ? "Gemengde signalen" : "Mixed signals",
    caution: args.locale === "nl" ? "Controle nodig" : "Needs review"
  };

  const descriptionByTone: Record<ScoreTone, string> = {
    strong:
      args.locale === "nl"
        ? "Positief eigendoms- en gebruiksprofiel met een sterk vertrouwenssignaal."
        : "Positive ownership and usage profile with a healthy overall confidence signal.",
    steady:
      args.locale === "nl"
        ? "De meeste signalen zijn stabiel, met enkele kleine aandachtspunten."
        : "Most signals look solid with only minor items to double-check.",
    mixed:
      args.locale === "nl"
        ? "Meerdere signalen vragen extra controle voor je beslist."
        : "Several signals need closer attention before making a decision.",
    caution:
      args.locale === "nl"
        ? "Belangrijke signalen vereisen opvolging voordat je doorgaat."
        : "Key signals require follow-up before moving forward."
  };

  const confidence =
    tone === "strong" || tone === "steady"
      ? args.locale === "nl"
        ? "Hoog"
        : "High"
      : tone === "mixed"
      ? args.locale === "nl"
        ? "Middel"
        : "Medium"
      : args.locale === "nl"
      ? "Laag"
      : "Low";
  const riskFlag = args.wok || args.defects > 4 ? (args.locale === "nl" ? "Verhoogd" : "Elevated") : args.locale === "nl" ? "Laag" : "Low";

  return {
    score,
    tone,
    label: labelByTone[tone],
    description: descriptionByTone[tone],
    confidence,
    riskFlag
  };
}

function ScoreBadgeIcon() {
  return (
    <span className={styles.badgeIcon}>
      <TrendingUp size={12} />
    </span>
  );
}

function LicensePlate({ plate }: { plate: string }) {
  return <div className={styles.licensePlate}>{plate}</div>;
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metaCard}>
      <div className={styles.metaLabel}>{label}</div>
      <div className={styles.metaValue}>{value}</div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailCard}>
      <div className={styles.detailCardLabel}>{label}</div>
      <div className={styles.detailCardValue}>{value}</div>
    </div>
  );
}

function SpecChip({ icon: Icon, label }: { icon: ElementType; label: string }) {
  return (
    <div className={styles.chip}>
      <span className={styles.chipIcon}>
        <Icon size={16} />
      </span>
      {label}
    </div>
  );
}

function InsightCard({
  icon: Icon,
  title,
  value,
  isLoading
}: {
  icon: ElementType;
  title: string;
  value: React.ReactNode;
  isLoading?: boolean;
}) {
  return (
    <div className={styles.insightCard}>
      <div className={styles.insightIcon}>
        {isLoading ? <RefreshCw className={styles.spinningIcon} size={18} /> : <Icon size={18} />}
      </div>
      <div className={styles.insightCopy}>
        <div className={styles.insightTitle}>
          {title}
          {isLoading && <span className={styles.tooltipText}>Calculating...</span>}
        </div>
        <div className={styles.insightValue}>{value}</div>
      </div>
    </div>
  );
}

function ScoreModule({
  score,
  locale,
  onDownload,
  isDownloading,
  onSave,
  isSaving,
  isSaved
}: {
  score: ScoreResult;
  locale: "nl" | "en";
  onDownload: () => void;
  isDownloading: boolean;
  onSave: () => void;
  isSaving: boolean;
  isSaved: boolean;
}) {
  const degrees = Math.round((score.score / 100) * 360);
  const ringColor =
    score.tone === "strong"
      ? "var(--success)"
      : score.tone === "steady"
      ? "#38BDF8"
      : score.tone === "mixed"
      ? "var(--warning)"
      : "var(--destructive)";

  return (
    <div className={styles.scoreModule}>
      <div className={styles.scoreHeader}>
        <div className={styles.scoreTitle}>Kentekenrapport Score</div>
        <div className={styles.scoreBadge}>
          <ScoreBadgeIcon />
          {score.label}
        </div>
      </div>

      <div className={styles.gaugeWrap}>
        <div
          className={styles.gaugeRing}
          style={{
            background: `conic-gradient(${ringColor} 0 ${degrees}deg, rgba(255,255,255,0.12) ${degrees}deg 360deg)`
          }}
        >
          <div className={styles.gaugeContent}>
            <div className={styles.scoreValue}>{score.score}</div>
            <div className={styles.scoreMax}>{locale === "nl" ? "van 100" : "out of 100"}</div>
          </div>
        </div>
      </div>

      <div className={styles.scoreCopy}>{score.description}</div>

      <div className={styles.scoreMetrics}>
        <div className={styles.scoreMetricCard}>
          <div className={styles.scoreMetricLabel}>{locale === "nl" ? "Betrouwbaarheid" : "Confidence"}</div>
          <div className={styles.scoreMetricValue}>{score.confidence}</div>
        </div>
        <div className={styles.scoreMetricCard}>
          <div className={styles.scoreMetricLabel}>{locale === "nl" ? "Risico-indicatie" : "Risk flag"}</div>
          <div className={styles.scoreMetricValue}>{score.riskFlag}</div>
        </div>
      </div>

      <div className={styles.scoreActions}>
        <button className={styles.actionPrimary} type="button" onClick={onDownload} disabled={isDownloading}>
          {isDownloading ? <RefreshCw size={18} className={styles.inlineSpinner} /> : <Download size={18} />}
          {isDownloading
            ? locale === "nl"
              ? "Rapport wordt gegenereerd..."
              : "Generating report..."
            : locale === "nl"
            ? "Rapport downloaden"
            : "Download Report"}
        </button>
        <div className={styles.actionRow}>
          <button className={styles.actionSecondary} type="button" onClick={onSave} disabled={isSaving}>
            <Bookmark size={16} />
            {isSaving ? (locale === "nl" ? "Opslaan..." : "Saving...") : isSaved ? (locale === "nl" ? "Opgeslagen" : "Saved") : locale === "nl" ? "Voertuig opslaan" : "Save Vehicle"}
          </button>
          <button className={styles.actionSecondary} type="button">
            <Share2 size={16} />
            {locale === "nl" ? "Delen" : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen({ locale }: { locale: "nl" | "en" }) {
  return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingCard}>
        <RefreshCw className={styles.loadingIcon} />
        <p>{locale === "nl" ? "Voertuigrapport ophalen..." : "Fetching vehicle report..."}</p>
      </div>
    </div>
  );
}

function ErrorScreen({ plate, locale }: { plate: string; locale: "nl" | "en" }) {
  return (
    <div className={styles.errorScreen}>
      <div className={styles.errorCard}>
        <div className={styles.errorIcon}>
          <ShieldCheck size={20} />
        </div>
        <h1>{locale === "nl" ? "Voertuig niet gevonden" : "Vehicle Not Found"}</h1>
        <p>
          {locale === "nl"
            ? `We konden ${plate} niet vinden of de RDW-service is tijdelijk niet beschikbaar.`
            : `We couldn't find ${plate} or the RDW service is unavailable.`}
        </p>
        <div className={styles.errorActions}>
          <Link href="/" className={styles.errorButton}>
            <ArrowLeft size={16} /> {locale === "nl" ? "Home" : "Home"}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function VehicleResultScreen({ plate }: Props) {
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const { settings } = useSiteSettings();
  const mileageInput = useMemo(() => {
    const raw = searchParams.get("mileage");
    if (!raw || raw.trim().length === 0) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }, [searchParams]);
  const { normalized, isValid, data, isLoading, isError } = useVehicleLookup(plate, mileageInput);
  const [lastUpdated] = useState(() => new Date());
  const [currentAngle, setCurrentAngle] = useState("01");
  const [showPayment, setShowPayment] = useState(false);
  const [downloadAfterUnlock, setDownloadAfterUnlock] = useState(false);
  const [isPaidForPlate, setIsPaidForPlate] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isUserLoggedIn, setIsUserLoggedIn] = useState(false);
  const [claudeValue, setClaudeValue] = useState<number | null>(null);
  const [isCalculatingClaude, setIsCalculatingClaude] = useState(false);

  useEffect(() => {
    if (!normalized || isError) return;
    let active = true;
    setIsCalculatingClaude(true);
    void (async () => {
      try {
        const response = await fetch(`/api/vehicle/${encodeURIComponent(normalized)}?lang=${encodeURIComponent(locale)}&include_ai=1${
          typeof mileageInput === "number" && Number.isFinite(mileageInput) ? `&mileage=${encodeURIComponent(String(mileageInput))}` : ""
        }`, { cache: "no-store" });
        if (!response.ok || !active) return;
        const payload = await response.json();
        if (active && payload.aiValuation?.estimatedValueNow) {
          setClaudeValue(payload.aiValuation.estimatedValueNow);
        }
      } catch {
        // silently fallback
      } finally {
        if (active) setIsCalculatingClaude(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [normalized, locale, isError, mileageInput]);

  const score = useMemo(() => {
    if (!data?.vehicle || !data.enriched) {
      return buildScoreResult({ defects: 0, riskScore: 6, apkPassChance: 78, wok: false, imported: false, locale });
    }

    return buildScoreResult({
      defects: data.defects.length,
      riskScore: data.enriched.maintenanceRiskScore,
      apkPassChance: data.enriched.apkPassChance,
      wok: data.vehicle.wok,
      imported: data.enriched.isImported,
      locale
    });
  }, [data, locale]);

  const normalizedPlate = normalized;
  useEffect(() => {
    if (!normalizedPlate) {
      setIsPaidForPlate(false);
      return;
    }
    setIsPaidForPlate(hasPaidAccessForPlate(normalizedPlate));
  }, [normalizedPlate]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch("/api/user/session", { cache: "no-store" });
      if (!response.ok || !active) return;
      const payload = (await response.json()) as { authenticated?: boolean };
      if (active) setIsUserLoggedIn(Boolean(payload.authenticated));
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!isValid || isError) return <ErrorScreen plate={plate} locale={locale} />;
  if (isLoading || !data || !data.enriched) return <LoadingScreen locale={locale} />;

  const v = data.vehicle;
  const e = data.enriched;
  const displayPlate = formatDisplayPlate(normalizedPlate);

  const downloadReport = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadReportFile(normalizedPlate, locale, mileageInput);
      if (recipientEmail) {
        await sendReportByEmail(normalizedPlate, locale, recipientEmail);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : locale === "nl"
          ? "Kon PDF rapport niet genereren."
          : "Unable to generate PDF report.";
      window.alert(message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownload = () => {
    if (isDownloading) return;
    const downloadRequiresPayment = settings.paymentEnabled && settings.lockSections.reportDownload;
    if (!downloadRequiresPayment) {
      void downloadReport();
      return;
    }
    if (isPaidForPlate) {
      void downloadReport();
      return;
    }
    setDownloadAfterUnlock(true);
    setShowPayment(true);
  };

  const saveVehicle = async () => {
    if (isSaving) return;
    if (!isUserLoggedIn) {
      setShowAuthModal(true);
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/user/saved-vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: normalizedPlate,
          title: [data?.vehicle?.brand, data?.vehicle?.tradeName].filter(Boolean).join(" ").trim(),
          mileageInput
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Unable to save vehicle.");
      }
      setIsSaved(true);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to save vehicle.");
    } finally {
      setIsSaving(false);
    }
  };

  const vehicleTitle = [v.brand, v.tradeName].filter(Boolean).join(" ").trim();
  const vehicleSubtitle = [
    v.engine?.displacement ? `${(v.engine.displacement / 1000).toFixed(1)}L` : null,
    v.fuelType,
    v.engine?.powerKw ? `${Math.round(v.engine.powerKw * 1.36)} HP` : null
  ]
    .filter(Boolean)
    .join(" | ");

  const conditionLabel =
    data.defects.length === 0
      ? locale === "nl"
        ? "Goed onderhouden"
        : "Well maintained"
      : data.defects.length < 3
      ? locale === "nl"
        ? "Kleine aandachtspunten"
        : "Minor issues"
      : locale === "nl"
      ? "Controle nodig"
      : "Needs review";
  const ownersLabel = v.owners.count
    ? locale === "nl"
      ? `${v.owners.count} vorige eigenaar(s)`
      : `${v.owners.count} previous`
    : locale === "nl"
    ? "Onbekend"
    : "Unknown";
  const marketLabel = e.estimatedValueNow
    ? locale === "nl"
      ? "Stabiele vraag"
      : "Stable demand"
    : locale === "nl"
    ? "Marktdata in afwachting"
    : "Market data pending";

  const detailCards = [
    { label: locale === "nl" ? "Brandstof" : "Fuel type", value: titleCase(v.fuelType) },
    {
      label: locale === "nl" ? "APK vervalt" : "APK Expiry",
      value: v.apkExpiryDate ? new Date(v.apkExpiryDate).toLocaleDateString("nl-NL") : locale === "nl" ? "Onbekend" : "Unknown"
    },
    {
      label: locale === "nl" ? "Wegenbelasting (schatting)" : "Road Tax (est)",
      value: e.roadTaxEstQuarter
        ? `EUR ${e.roadTaxEstQuarter.min} - EUR ${e.roadTaxEstQuarter.max} / qtr`
        : locale === "nl"
        ? "Onbekend"
        : "Unknown"
    },
    { label: locale === "nl" ? "Deuren" : "Doors", value: formatNumber(v.doors) },
    { label: locale === "nl" ? "Zitplaatsen" : "Seats", value: formatNumber(v.seats) },
    { label: locale === "nl" ? "Kleur" : "Color", value: titleCase(v.color.primary) },
    { label: locale === "nl" ? "Leeggewicht" : "Empty weight", value: formatNumber(v.weight?.empty, "kg") }
  ];



  return (
    <div className={styles.page}>
      <div className={styles.pageContainer}>
        <div className={styles.contentContainer}>
          <VehicleNavBar plate={normalizedPlate} />

          <div className={styles.heroShell}>
            <div className={styles.heroCard}>
              <div className={styles.heroImagePanel}>
                <div className={styles.heroImageWrapper}>
                  <Image
                    alt={`${v.brand} ${v.tradeName}`}
                    src={getVehicleImageUrl(v.brand, v.tradeName, {
                      angle: currentAngle,
                      zoomtype: "relative",
                      color: v.color?.primary ?? null
                    })}
                    width={580}
                    height={340}
                    className="h-full w-full object-contain transition-all duration-500"
                    priority
                    unoptimized
                  />
                  <div className={styles.angleSwitcher}>
                    {["01", "09", "28"].map((angle) => (
                      <button
                        key={angle}
                        onClick={() => setCurrentAngle(angle)}
                        className={`${styles.angleBtn} ${currentAngle === angle ? styles.angleBtnActive : ""}`}
                        type="button"
                        title={locale === "nl" ? `Bekijk hoek ${angle}` : `View angle ${angle}`}
                      >
                        {angle === "01" && <span className="text-[10px]">{locale === "nl" ? "Voor" : "Front"}</span>}
                        {angle === "09" && <span className="text-[10px]">{locale === "nl" ? "Zij" : "Side"}</span>}
                        {angle === "28" && <span className="text-[10px]">{locale === "nl" ? "Achter" : "Rear"}</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.imageMetaRow}>
                  <MetaCard label={locale === "nl" ? "Conditie" : "Condition"} value={conditionLabel} />
                  <MetaCard label={locale === "nl" ? "Eigenaren" : "Owners"} value={ownersLabel} />
                  <MetaCard label={locale === "nl" ? "Markt" : "Market"} value={marketLabel} />
                </div>
              </div>

              <div className={styles.heroInfo}>
                <div className={styles.eyebrowRow}>
                  <div className={styles.eyebrowPill}>
                    <ShieldCheck size={14} />
                    {locale === "nl" ? "Vertrouwde databron" : "Trusted data source"}
                  </div>
                </div>

                <LicensePlate plate={displayPlate} />

                <div className={styles.vehicleTitleBlock}>
                  <div className={styles.carTitle}>
                    {vehicleTitle || (locale === "nl" ? "Voertuigoverzicht" : "Vehicle overview")}
                    {v.year ? ` ${v.year}` : ""}
                  </div>
                  <div className={styles.carSubtitle}>
                    {vehicleSubtitle ||
                      (locale === "nl"
                        ? "Snelle samenvatting van identiteit, aandrijving, gebruik en score voor een snellere beslissing."
                        : "Quick summary of the vehicle identity, drivetrain, usage, and score so you can decide faster.")}
                  </div>
                </div>

                <div className={styles.carSpecsChips}>
                  <SpecChip icon={Fuel} label={titleCase(v.fuelType)} />
                  <SpecChip icon={Settings2} label={v.emissionStandard ?? (locale === "nl" ? "Emissienorm" : "Emission standard")} />
                  <SpecChip icon={Gauge} label={v.napVerdict ? `NAP ${v.napVerdict}` : locale === "nl" ? "NAP onbekend" : "NAP unknown"} />
                  <SpecChip icon={BadgeCheck} label={v.year ? v.year.toString() : locale === "nl" ? "Bouwjaar" : "Year"} />
                </div>

                <div className={styles.detailGrid}>
                  {detailCards.map((card) => (
                    <DetailCard key={card.label} label={card.label} value={card.value} />
                  ))}
                </div>
              </div>

              <div className={styles.heroActions}>
                <ScoreModule
                  score={score}
                  locale={locale}
                  onDownload={handleDownload}
                  isDownloading={isDownloading}
                  onSave={() => {
                    void saveVehicle();
                  }}
                  isSaving={isSaving}
                  isSaved={isSaved}
                />
              </div>
            </div>

            <div className={styles.insightStrip}>
              <InsightCard
                icon={BadgeCheck}
                title={locale === "nl" ? "Registratiestatus" : "Registration status"}
                value={v.transferPossible ? (locale === "nl" ? "Geldig en actief" : "Valid and active") : locale === "nl" ? "Overdracht beperkt" : "Transfer restricted"}
              />
              <InsightCard
                icon={Wrench}
                title={locale === "nl" ? "Onderhoudssignaal" : "Service signal"}
                value={data.defects.length < 3 ? (locale === "nl" ? "Historie lijkt consistent" : "History looks consistent") : locale === "nl" ? "Onderhoud gemarkeerd" : "Maintenance flagged"}
              />
              <InsightCard
                icon={Coins}
                title={locale === "nl" ? "Geschatte waarde" : "Estimated value"}
                value={formatCurrency(claudeValue ?? e.estimatedValueNow)}
                isLoading={isCalculatingClaude && !claudeValue}
              />
              <InsightCard
                icon={Clock3}
                title={locale === "nl" ? "Laatst bijgewerkt" : "Last updated"}
                value={formatDateTime(lastUpdated)}
              />
            </div>
          </div>
        </div>
      </div>
      <SubscriptionModal
        isOpen={showPayment}
        onClose={() => {
          setShowPayment(false);
          setDownloadAfterUnlock(false);
        }}
        featureName={locale === "nl" ? "Rapportdownload en premium toegang" : "Report download and premium access"}
        plate={normalizedPlate}
        onUnlocked={(payload) => {
          setIsPaidForPlate(true);
          setRecipientEmail(payload?.email ?? null);
          if (downloadAfterUnlock) {
            void downloadReport();
          }
          setDownloadAfterUnlock(false);
        }}
      />
      <UserAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthenticated={async () => {
          setIsUserLoggedIn(true);
          await saveVehicle();
        }}
      />
    </div>
  );
}

async function downloadReportFile(plate: string, locale: "nl" | "en", mileage?: number | null): Promise<void> {
  const response = await fetch(`/api/vehicle/${encodeURIComponent(plate)}?lang=${encodeURIComponent(locale)}&download=1${
    typeof mileage === "number" && Number.isFinite(mileage) ? `&mileage=${encodeURIComponent(String(mileage))}` : ""
  }`, {
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Report download failed.");
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `kentekenrapport-${plate}.pdf`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

async function sendReportByEmail(plate: string, locale: "nl" | "en", email: string): Promise<void> {
  const response = await fetch(`/api/vehicle/${encodeURIComponent(plate)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, lang: locale })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Sending report email failed.");
  }
}
