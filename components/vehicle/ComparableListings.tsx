"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useVehicleLookup } from "@/hooks/useVehicleLookup";
import { track } from "@/lib/analytics";
import { buildAlternativeLinks, buildExactLinks, type ListingVehicle } from "@/lib/listings/deeplinks";
import styles from "./ComparableListings.module.css";

/**
 * "Comparable cars for sale, with links." Sends the buyer to pre-filtered public
 * searches on the big NL marketplaces for the same make/model around our
 * estimated value, with a same-make fallback. Free section (drives engagement +
 * future affiliate clicks); only renders when we know make + model.
 */
export function ComparableListings({ plate }: { plate: string }) {
  const { locale } = useI18n();
  const nl = locale === "nl";
  const { data } = useVehicleLookup(plate);
  const v = data?.vehicle;

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

  if (!model.brand || !model.model || exact.length === 0) return null;

  const label = `${model.brand} ${model.model}`.replace(/\s+/g, " ").trim();

  return (
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
            {nl ? `Geen passende ${model.model}? Andere ${model.brand} in deze prijsklasse:` : `No matching ${model.model}? Other ${model.brand} in this price range:`}
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
