"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { track } from "@/lib/analytics";
import { buildAlternativeLinks, buildExactLinks, type ListingVehicle } from "@/lib/listings/deeplinks";
import { PremiumLock } from "../ui/PremiumLock";
import styles from "./ComparableListings.module.css";

/**
 * "Comparable cars for sale." Premium section: shows real NL listing CARDS
 * (photo, price, km, year) from /api/listings/comparable, sorted by similarity,
 * with a deeplink to the source listing. The route returns listings only for
 * paid plates (so the paid Apify actor is never called for free visitors), and
 * the whole block sits behind PremiumLock. Falls back to plain marketplace
 * search links when no listings are available. Legal: minimal facts + a
 * thumbnail + a prominent source deeplink, never claiming the cars as our own.
 */

type ApiCar = {
  title: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  priceEur: number | null;
  mileageKm: number | null;
  fuelType: string | null;
  city: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  source: string | null;
};

function eur(value: number | null): string {
  if (value == null) return "";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function sourceLabel(car: ApiCar): string {
  try {
    if (car.sourceUrl) return new URL(car.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    // ignore
  }
  return car.source ?? "verkoper";
}

export function ComparableListings({ plate, embedded = false }: { plate: string; embedded?: boolean }) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const { normalized, data } = useVehicleLookup(plate);
  const v = data?.vehicle;
  // No standalone chrome (nav bar / back link) on this screen, so embedded does
  // not change the markup; consumed for call-site consistency with the others.
  void embedded;

  const [cars, setCars] = useState<ApiCar[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!normalized) return;
    let active = true;
    setLoading(true);
    fetch(`/api/listings/comparable/${encodeURIComponent(normalized)}?lang=${locale}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { cars: [] }))
      .then((d) => {
        if (!active) return;
        setCars(Array.isArray(d.cars) ? (d.cars as ApiCar[]) : []);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setCars([]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [normalized, locale]);

  const model: ListingVehicle = useMemo(
    () => ({
      brand: v?.brand ?? null,
      model: v?.tradeName ?? null,
      year: v?.year ?? null,
      estValue: data?.enriched?.estimatedValueNow ?? null
    }),
    [v?.brand, v?.tradeName, v?.year, data?.enriched?.estimatedValueNow]
  );

  const exact = useMemo(() => buildExactLinks(model), [model]);
  const alternatives = useMemo(() => buildAlternativeLinks(model), [model]);

  const label = model.brand && model.model ? `${model.brand} ${model.model}`.replace(/\s+/g, " ").trim() : null;
  const hasCards = Boolean(cars && cars.length > 0);

  // Nothing to show at all: not loading, no cards, and we cannot even build links.
  // We still render a short honest line (behind the same PremiumLock) so the
  // group body is never an empty panel. Live listings are currently unavailable
  // (no working marketplace feed), so this is the expected path for most plates.
  const nothingToShow = !loading && !hasCards && (!model.brand || !model.model || exact.length === 0);

  const moreLinks =
    exact.length > 0 ? (
      <div className={styles.moreRow}>
        <span className={styles.altLabel}>{nl ? "Meer aanbod:" : "More listings:"}</span>
        <span className={styles.altLinks}>
          {exact.map((link, i) => (
            <span key={link.provider}>
              {i > 0 ? <span className={styles.altDot}> · </span> : null}
              <a
                className={styles.altLink}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow sponsored"
                onClick={() => track("listing_click", { provider: link.provider, tier: "more" })}
              >
                {link.provider}
              </a>
            </span>
          ))}
        </span>
      </div>
    ) : null;

  let inner: React.ReactNode;
  if (nothingToShow) {
    inner = (
      <div className={styles.wrap}>
        <p className={styles.intro}>
          {nl
            ? "We konden voor dit voertuig op dit moment geen vergelijkbaar aanbod ophalen. Zoek dezelfde auto handmatig op de grote verkoopsites en vergelijk met onze geschatte marktwaarde."
            : "We could not retrieve comparable listings for this vehicle right now. Search for the same car manually on the big marketplaces and compare against our estimated market value."}
        </p>
      </div>
    );
  } else if (loading) {
    inner = (
      <div className={styles.wrap}>
        <p className={styles.intro}>{nl ? "Vergelijkbaar aanbod laden..." : "Loading comparable listings..."}</p>
        <div className={styles.grid}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${styles.card} ${styles.skeleton}`} aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  } else if (hasCards) {
    inner = (
      <div className={styles.wrap}>
        <p className={styles.intro}>
          {nl
            ? `Vergelijkbaar aanbod, gesorteerd op gelijkenis met deze ${label}.`
            : `Comparable listings, sorted by similarity to this ${label}.`}
        </p>
        <div className={styles.grid}>
          {cars!.slice(0, 6).map((car, i) => (
            <a
              key={i}
              className={styles.card}
              href={car.sourceUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              onClick={() => track("listing_click", { provider: sourceLabel(car), tier: "card" })}
            >
              <div className={styles.cardImg}>
                {car.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={car.imageUrl} alt={car.title ?? label ?? "auto"} loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <span className={styles.noImg}>{label}</span>
                )}
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardPrice}>{eur(car.priceEur) || (nl ? "Prijs op aanvraag" : "Price on request")}</div>
                <div className={styles.cardMeta}>
                  {[car.year, car.mileageKm != null ? `${car.mileageKm.toLocaleString("nl-NL")} km` : null, car.fuelType]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className={styles.cardTitle}>{car.title}</div>
                <div className={styles.cardSource}>
                  {nl ? "Bekijk op" : "View on"} {sourceLabel(car)} <ExternalLink size={13} />
                </div>
              </div>
            </a>
          ))}
        </div>
        {moreLinks}
        <p className={styles.disclosure}>
          {nl
            ? "Aanbod via Gaspedaal en de bronsites. Klik door naar de verkoper voor de actuele prijs en details."
            : "Listings via Gaspedaal and source sites. Click through to the seller for the current price and details."}
        </p>
      </div>
    );
  } else {
    // Fallback: pre-filtered marketplace search links (no live listings available).
    inner = (
      <div className={styles.wrap}>
        <p className={styles.intro}>
          {nl
            ? `Bekijk dezelfde ${label} rond onze geschatte marktwaarde op de grootste verkoopsites.`
            : `Browse the same ${label} around our estimated market value on the biggest marketplaces.`}
        </p>
        <div className={styles.links}>
          {exact.map((link) => (
            <a
              key={link.provider}
              className={styles.linkBtn}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              onClick={() => track("listing_click", { provider: link.provider, tier: "exact" })}
            >
              <span className={styles.provider}>{link.provider}</span>
              <ExternalLink size={15} className={styles.extIcon} />
            </a>
          ))}
        </div>

        {alternatives.length > 0 ? (
          <div className={styles.altRow}>
            <span className={styles.altLabel}>
              {nl
                ? `Geen passende ${model.model}? Andere ${model.brand} in deze prijsklasse:`
                : `No matching ${model.model}? Other ${model.brand} in this price range:`}
            </span>
            <span className={styles.altLinks}>
              {alternatives.map((link, i) => (
                <span key={link.provider}>
                  {i > 0 ? <span className={styles.altDot}> · </span> : null}
                  <a
                    className={styles.altLink}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow sponsored"
                    onClick={() => track("listing_click", { provider: link.provider, tier: "alt" })}
                  >
                    {link.provider}
                  </a>
                </span>
              ))}
            </span>
          </div>
        ) : null}

        <p className={styles.disclosure}>
          {nl
            ? "Externe links naar verkoopsites. Aanbod en prijzen kunnen afwijken."
            : "External links to marketplaces. Offers and prices may differ."}
        </p>
      </div>
    );
  }

  return (
    <PremiumLock
      featureName={nl ? "Vergelijkbare auto's te koop" : "Comparable cars for sale"}
      isLocked={true}
      plate={normalized}
      sectionKey="marketAnalysis"
    >
      {inner}
    </PremiumLock>
  );
}
