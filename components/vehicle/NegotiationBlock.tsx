"use client";

import { HandCoins } from "lucide-react";
import styles from "./NegotiationBlock.module.css";

/**
 * Compact negotiation helper, embedded inside the (premium) market-value
 * section: a one-line target-offer/walk-away band plus a few short, human
 * talking points to lower the price. Replaces the old standalone, text-heavy
 * "Onderhandelcoach" section. Renders nothing without a market value (so unpaid
 * visitors, whose value is stripped server-side, see nothing here).
 */

type Props = {
  locale: "nl" | "en";
  marketNow: number | null;
  marketMin: number | null;
  marketMax: number | null;
  defects: number;
  recalls: number;
  riskScore: number;
  mileagePlausible: boolean | null;
};

function eur(value: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
function roundTo50(value: number): number {
  return Math.round(value / 50) * 50;
}

export function NegotiationBlock({ locale, marketNow, marketMin, marketMax, defects, recalls, riskScore, mileagePlausible }: Props) {
  if (!marketNow || marketNow <= 0) return null;
  const nl = locale === "nl";
  const min = marketMin ?? marketNow;
  const max = marketMax ?? marketNow;

  const riskPenalty =
    defects * 0.015 + recalls * 0.02 + Math.max(0, riskScore - 5) * 0.02 + (mileagePlausible === false ? 0.03 : 0);
  const offerMin = roundTo50(Math.max(500, min * (1 - riskPenalty)));
  const offerMax = roundTo50(Math.max(offerMin + 150, marketNow * (1 - riskPenalty * 0.35)));
  const walkAway = roundTo50(Math.max(offerMax + 200, max * (1 + riskPenalty * 0.15)));

  const points: string[] = [];
  if (defects > 0)
    points.push(
      nl
        ? `Er staan ${defects} gebreken in de keuringshistorie. Vraag de facturen en bied daarmee lager.`
        : `${defects} defects in the inspection history. Ask for the invoices and use them to offer lower.`
    );
  if (riskScore >= 7)
    points.push(
      nl
        ? `Hoog onderhoudsrisico (${riskScore.toFixed(1)}/10). Reken op extra kosten en praat die van de prijs af.`
        : `High maintenance risk (${riskScore.toFixed(1)}/10). Expect extra costs and negotiate them off the price.`
    );
  if (mileagePlausible === false)
    points.push(
      nl
        ? "De kilometerstand wijkt af van het verwachte beeld. Gebruik dat om in prijs te zakken."
        : "The mileage deviates from the expected trend. Use it to push the price down."
    );
  if (recalls > 0)
    points.push(
      nl
        ? `Er loopt nog ${recalls} terugroepactie. Laat die eerst uitvoeren of vraag korting.`
        : `${recalls} open recall(s). Have them done first or ask for a discount.`
    );
  if (points.length === 0)
    points.push(
      nl
        ? "Weinig negatieve signalen. Gebruik de geschatte marktwaarde als jouw bovengrens en bied daar net onder."
        : "Few negative signals. Use the estimated market value as your ceiling and offer just below it."
    );

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <HandCoins size={16} />
        <span>{nl ? "Onderhandelen" : "Negotiation"}</span>
      </div>
      <div className={styles.range}>
        {nl ? "Richtbod" : "Target offer"} <strong>{eur(offerMin)} - {eur(offerMax)}</strong>
        <span className={styles.sep}> · </span>
        {nl ? "loop weg boven" : "walk away above"} <strong>{eur(walkAway)}</strong>
      </div>
      <ul className={styles.points}>
        {points.slice(0, 3).map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}
