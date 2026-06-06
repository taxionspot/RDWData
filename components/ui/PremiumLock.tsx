import { useEffect, useState, type ReactNode } from "react";
import styles from "./PremiumLock.module.css";
import { Button } from "./Button";
import { Lock } from "lucide-react";
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
  const [showModal, setShowModal] = useState(false);
  const [isUnlockedForPlate, setIsUnlockedForPlate] = useState(false);

  useEffect(() => {
    if (!plate) return;
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
  }, [plate]);

  const lockByAdmin = sectionKey ? settings.lockSections[sectionKey] : isLocked;
  const shouldLock = settings.paymentEnabled && lockByAdmin && isLocked;

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
                ? `Ontgrendel uitgebreide data, geverifieerd door officiele databronnen, voor ${featureName}.`
                : `Unlock comprehensive data verified by official industry partners for this ${featureName}.`}
            </p>
          </div>



          <Button variant="primary" className={styles.unlockButton} onClick={openModal}>
            {locale === "nl" ? "Upgrade naar Premium" : "Upgrade to Premium Now"}
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


