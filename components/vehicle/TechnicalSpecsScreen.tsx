"use client";

import Link from "next/link";
import { useMemo, useState, type ElementType } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Gauge,
  GaugeCircle,
  Leaf,
  Ruler,
  Settings,
  ShieldCheck,
  Zap
} from "lucide-react";
import styles from "./TechnicalSpecsScreen.module.css";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { classifyFuel } from "@/lib/rdw/heuristics";
import { VehicleNavBar } from "./VehicleNavBar";
import { useI18n } from "@/lib/i18n/context";
import { PremiumLock } from "../ui/PremiumLock";

type Props = {
  plate?: string;
};

function buildPlateHref(plate: string | undefined, suffix = "") {
  if (!plate) return suffix || "/";
  return `/search/${plate}${suffix}`;
}

function formatNumber(value: number | null, unit?: string) {
  if (value === null || Number.isNaN(value)) return null;
  return unit ? `${value.toLocaleString("nl-NL")} ${unit}` : value.toLocaleString("nl-NL");
}

function formatDisplacement(value: number | null) {
  if (!value) return null;
  return `${(value / 1000).toFixed(1)} L`;
}

function formatPower(value: number | null) {
  if (!value) return null;
  return `${value} kW / ${Math.round(value * 1.36)} pk`;
}

function titleCase(value: string | null) {
  if (!value) return null;
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(parsed);
}

function SpecItem({
  label,
  value,
  meta,
  icon: Icon
}: {
  label: string;
  value: string;
  meta?: string;
  icon: ElementType;
}) {
  return (
    <div className={styles.specItem}>
      <div className={styles.specIcon}>
        <Icon size={24} />
      </div>
      <div className={styles.specDetails}>
        <div className={styles.specLabel}>{label}</div>
        <div className={styles.specValue}>{value}</div>
        {meta ? <div className={styles.specMeta}>{meta}</div> : null}
      </div>
    </div>
  );
}

function AccordionSection({
  title,
  subtitle,
  icon: Icon,
  expanded,
  specs,
  onToggle,
  locale
}: {
  title: string;
  subtitle: string;
  icon: ElementType;
  expanded: boolean;
  specs: Array<{ id: string; label: string; value: string; meta?: string; icon: ElementType }>;
  onToggle: () => void;
  locale: "nl" | "en";
}) {
  return (
    <div className={`${styles.accordionCard} ${styles.surfacePanel} ${expanded ? "" : styles.collapsed}`}>
      <button className={styles.accordionHeader} type="button" onClick={onToggle}>
        <div className={styles.accordionHeaderLeft}>
          <div className={styles.accordionIconWrap}>
            <Icon size={20} />
          </div>
          <div className={styles.accordionTitleBlock}>
            <div className={styles.accordionTitle}>{title}</div>
            <div className={styles.accordionSubtitle}>{subtitle}</div>
          </div>
        </div>
        <div className={styles.accordionToggle}>
          {expanded ? (locale === "nl" ? "Inklappen" : "Collapse") : locale === "nl" ? "Uitklappen" : "Expand"}
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>
      <div className={styles.accordionContent}>
        {specs.length ? (
          <div className={styles.specsGrid}>
            {specs.map((spec) => (
              <SpecItem key={spec.id} {...spec} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyNotice}>
            {locale === "nl" ? "Nog geen data geladen voor deze sectie." : "No data loaded yet for this section."}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingScreen() {
  const { locale } = useI18n();
  return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingCard}>
        {locale === "nl" ? "Technische specificaties laden..." : "Loading technical specifications..."}
      </div>
    </div>
  );
}

function ErrorScreen({ plate }: { plate?: string }) {
  const { locale } = useI18n();
  return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingCard}>
        {locale === "nl"
          ? `We konden geen technische specificaties laden voor ${plate ?? "dit voertuig"}.`
          : `We couldn't load technical specifications for ${plate ?? "this vehicle"}.`}
      </div>
    </div>
  );
}

export function TechnicalSpecsScreen({ plate }: Props) {
  const { locale } = useI18n();
  const backHref = buildPlateHref(plate, "/risk-overview");
  const { isValid, data, isLoading, isError } = useVehicleLookup(plate ?? "");

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    performance: true,
    efficiency: true,
    dimensions: false,
    registration: false
  });

  const sections = useMemo(() => {
    const v = data?.vehicle;
    if (!v) return [];

    // EVs report combined consumption in kWh/100km, combustion engines in L/100km.
    const fuelKind = classifyFuel(v.fuelType);
    const consumptionUnit = fuelKind.isElectric && !fuelKind.isPetrol && !fuelKind.isDiesel ? "kWh/100km" : "L/100km";

    const performanceSpecs = [
      { id: "power", label: locale === "nl" ? "Motorvermogen" : "Engine power", value: formatPower(v.engine?.powerKw), meta: locale === "nl" ? "Fabrieksopgave" : "Factory output", icon: Zap },
      { id: "displacement", label: locale === "nl" ? "Cilinderinhoud" : "Displacement", value: formatDisplacement(v.engine?.displacement), icon: Settings },
      { id: "cylinders", label: locale === "nl" ? "Cilinders" : "Cylinders", value: formatNumber(v.engine?.cylinders), icon: GaugeCircle }
    ].filter((spec) => spec.value) as Array<{ id: string; label: string; value: string; meta?: string; icon: ElementType }>;

    const efficiencySpecs = [
      { id: "fuel", label: locale === "nl" ? "Brandstof" : "Fuel type", value: titleCase(v.fuelType), icon: Gauge },
      { id: "consumption", label: locale === "nl" ? "Verbruik" : "Fuel consumption", value: formatNumber(v.consumptionCombined, consumptionUnit), icon: Gauge },
      { id: "co2", label: locale === "nl" ? "CO2-uitstoot" : "CO2 emissions", value: formatNumber(v.co2, "g/km"), icon: Leaf },
      { id: "emission", label: locale === "nl" ? "Emissienorm" : "Emission standard", value: v.emissionStandard ?? null, icon: Leaf },
      { id: "energy", label: locale === "nl" ? "Energielabel" : "Energy label", value: v.energyLabel ?? null, icon: Leaf }
    ].filter((spec) => spec.value) as Array<{ id: string; label: string; value: string; meta?: string; icon: ElementType }>;

    const dimensionSpecs = [
      { id: "body", label: locale === "nl" ? "Carrosserie" : "Body type", value: titleCase(v.bodyType), icon: Ruler },
      { id: "doors", label: locale === "nl" ? "Deuren" : "Doors", value: formatNumber(v.doors), icon: Ruler },
      { id: "seats", label: locale === "nl" ? "Zitplaatsen" : "Seats", value: formatNumber(v.seats), icon: Ruler },
      { id: "axles", label: locale === "nl" ? "Assen" : "Axles", value: formatNumber(v.axles), icon: Ruler },
      { id: "weight-empty", label: locale === "nl" ? "Leeggewicht" : "Empty weight", value: formatNumber(v.weight?.empty, "kg"), icon: Ruler },
      { id: "weight-max", label: locale === "nl" ? "Max gewicht" : "Max weight", value: formatNumber(v.weight?.max, "kg"), icon: Ruler },
      { id: "payload", label: locale === "nl" ? "Laadvermogen" : "Payload", value: formatNumber(v.weight?.payload, "kg"), icon: Ruler }
    ].filter((spec) => spec.value) as Array<{ id: string; label: string; value: string; meta?: string; icon: ElementType }>;

    return [
      {
        id: "performance",
        title: locale === "nl" ? "Motor & Prestaties" : "Engine & Performance",
        subtitle: locale === "nl" ? "Vermogen en prestatiewaarden" : "Power output, speed limits, and acceleration",
        icon: Gauge,
        specs: performanceSpecs
      },
      {
        id: "efficiency",
        title: locale === "nl" ? "Efficientie & Milieu" : "Efficiency & Environment",
        subtitle: locale === "nl" ? "Verbruik en emissies" : "Fuel economy and emissions ratings",
        icon: Leaf,
        specs: efficiencySpecs
      },
      {
        id: "dimensions",
        title: locale === "nl" ? "Afmetingen & Gewicht" : "Dimensions & Weight",
        subtitle: locale === "nl" ? "Maten en gewichten van het voertuig" : "Vehicle measurements and capacities",
        icon: Ruler,
        specs: dimensionSpecs
      },
      {
        id: "registration",
        title: locale === "nl" ? "Registratie & Keuring" : "Registration & Inspection",
        subtitle: locale === "nl" ? "Belangrijke RDW-datums en APK-status" : "Key RDW registration dates and APK status",
        icon: ShieldCheck,
        specs: [
          {
            id: "first-nl",
            label: locale === "nl" ? "Eerste toelating (NL)" : "First registration (NL)",
            value: formatDate(v.firstRegistrationNL),
            icon: ShieldCheck
          },
          {
            id: "first-world",
            label: locale === "nl" ? "Eerste toelating (wereld)" : "First registration (world)",
            value: formatDate(v.firstRegistrationWorld),
            icon: ShieldCheck
          },
          {
            id: "apk-expiry",
            label: locale === "nl" ? "APK vervaldatum" : "APK expiry",
            value: formatDate(v.apkExpiryDate),
            icon: ShieldCheck
          },
          {
            id: "road-tax",
            label: locale === "nl" ? "Wegenbelasting (schatting)" : "Road tax (est)",
            value: data.enriched?.roadTaxEstQuarter
              ? `EUR ${data.enriched.roadTaxEstQuarter.min} - EUR ${data.enriched.roadTaxEstQuarter.max} / ${locale === "nl" ? "kw" : "qtr"}`
              : null,
            meta:
              locale === "nl"
                ? "Schatting o.b.v. gewicht & brandstof. Werkelijke MRB verschilt per provincie — bereken exact op belastingdienst.nl."
                : "Estimate from weight & fuel. Actual road tax varies by province — calculate the exact amount at belastingdienst.nl.",
            icon: ShieldCheck
          }
        ].filter((spec) => spec.value) as Array<{ id: string; label: string; value: string; meta?: string; icon: ElementType }>
      }
    ];
  }, [data, locale]);


  if (!plate || !isValid || isError) return <ErrorScreen plate={plate} />;
  if (isLoading || !data) return <LoadingScreen />;

  return (
    <div className={styles.page}>
      <div className={styles.pageContainer}>
        <div className={styles.contentContainer}>
          <VehicleNavBar plate={plate} subtitle={locale === "nl" ? "Technische specificaties" : "Technical specifications"} />

          <div className={styles.pageHeader}>
            <Link href={backHref} className={styles.backLink}>
              <ArrowLeft size={16} /> {locale === "nl" ? "Terug naar Risico-overzicht" : "Back to Risk Overview"}
            </Link>
            <div className={styles.headerTitleBlock}>
              <div className={styles.headerTitle}>{locale === "nl" ? "Technische specificaties" : "Technical Specifications"}</div>
              <div className={styles.headerSubtitle}>
                {locale === "nl"
                  ? "Bekijk de fabrieksgegevens voor prestaties, verbruik en milieuspecificaties van dit voertuig."
                  : "Review the factory-recorded performance metrics and environmental impact data for this vehicle."}
              </div>
            </div>
          </div>

          <PremiumLock
            featureName={locale === "nl" ? "Technische specificaties" : "Technical specifications"}
            isLocked={true}
            plate={plate}
            sectionKey="technicalSpecs"
          >
            <div className={styles.specsContainer}>
              {sections.map((section) => (
                <AccordionSection
                  key={section.id}
                  {...section}
                  locale={locale}
                  expanded={openSections[section.id] ?? false}
                  onToggle={() =>
                    setOpenSections((prev) => ({ ...prev, [section.id]: !prev[section.id] }))
                  }
                />
              ))}
            </div>
          </PremiumLock>
        </div>
      </div>
    </div>
  );
}

