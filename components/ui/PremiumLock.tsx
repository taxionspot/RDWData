import { useEffect, useState, type ReactNode } from "react";
import styles from "./PremiumLock.module.css";
import { Button } from "./Button";
import { Lock, Check } from "lucide-react";
import { SubscriptionModal } from "./SubscriptionModal";
import { useI18n } from "@/lib/i18n/context";
import { hasPaidAccessForPlate, grantPaidAccessForPlate } from "@/lib/payments/access";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import type { PublicSiteSettings } from "@/lib/site-settings/defaults";



interface PremiumLockProps {
  children: ReactNode;
  isLocked?: boolean;
  featureName: string;
  plate?: string;
  sectionKey?: keyof PublicSiteSettings["lockSections"];
}

export function PremiumLock({ children, isLocked = true, featureName, plate, sectionKey }: PremiumLockProps) {
  const { locale } = useI18n();
  const { settings } = useSiteSettings();
  const priceLabel =
    settings.payment.currency === "EUR"
      ? `€${String(settings.payment.amount).replace(".", ",")}`
      : `${settings.payment.currency} ${settings.payment.amount}`;
  const [showModal, setShowModal] = useState(false);
  const [isUnlockedForPlate, setIsUnlockedForPlate] = useState(false);

  const lockByAdmin = sectionKey ? settings.lockSections[sectionKey] : isLocked;
  const shouldLock = settings.paymentEnabled && lockByAdmin && isLocked;

  useEffect(() => {
    // Only reconcile access for sections that are actually gated, so a page with
    // several PremiumLocks doesn't fire N identical access checks for nothing.
    if (!plate || !shouldLock) return;
    setIsUnlockedForPlate(hasPaidAccessForPlate(plate));
    // Reconcile with the server so a paid plate stays unlocked across reloads.
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/payments/access/${encodeURIComponent(plate)}`, { cache: "no-store" });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as { paid?: boolean };
        if (active && payload.paid) {
          grantPaidAccessForPlate(plate);
          setIsUnlockedForPlate(true);
        }
      } catch {
        // Best-effort; server still enforces access on the actual report fetch.
      }
    })();
    return () => {
      active = false;
    };
  }, [plate, shouldLock]);

  if (!shouldLock || isUnlockedForPlate) return <>{children}</>;



  const openModal = () => setShowModal(true);

  return (
    <div className={styles.lockContainer}>
      <div className={styles.contentBlur}>
        {children}
      </div>
      <div className={styles.overlay}>
        <button className={styles.lockBadge} onClick={openModal} aria-label={locale === "nl" ? "Functie ontgrendelen" : "Unlock feature"}>
          <Lock size={20} />
          <span>{locale === "nl" ? "Vergrendeld" : "Locked"}</span>
        </button>

        <div className={styles.lockCard}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper}>
              <div className={styles.pulse} />
              <Lock className={styles.lockIcon} size={32} />
            </div>
            <h3 className={styles.title}>{locale === "nl" ? `Ontgrendel ${featureName}` : `Unlock ${featureName}`}</h3>
            <p className={styles.description}>
              {locale === "nl"
                ? `Eén betaling ontgrendelt het volledige rapport en alle premium-tabbladen voor dit kenteken.`
                : `One payment unlocks the full report and all premium tabs for this plate.`}
            </p>
          </div>

          <div className={styles.featureList}>
            {(locale === "nl"
              ? ["Schadehistorie & reparaties", "Risico-overzicht", "Marktanalyse & waardebepaling", "Onderhandelhulp", "Volledig PDF-rapport"]
              : ["Damage history & repairs", "Risk overview", "Market analysis & valuation", "Negotiation copilot", "Full PDF report"]
            ).map((item) => (
              <div key={item} className={styles.featureItem}>
                <Check size={16} className={styles.checkIcon} /> {item}
              </div>
            ))}
          </div>

          <Button variant="primary" className={styles.unlockButton} onClick={openModal}>
            {locale === "nl" ? `Ontgrendelen — ${priceLabel}` : `Unlock — ${priceLabel}`}
          </Button>

        </div>
      </div>

      <SubscriptionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        featureName={featureName}
        plate={plate ?? ""}
        onUnlocked={() => setIsUnlockedForPlate(true)}
      />
    </div>
  );
}


