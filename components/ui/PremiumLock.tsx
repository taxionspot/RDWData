import { useEffect, useState, type ReactNode } from "react";
import styles from "./PremiumLock.module.css";
import { Button } from "./Button";
import { Lock } from "lucide-react";
import { SubscriptionModal } from "./SubscriptionModal";
import { useI18n } from "@/lib/i18n/context";
import { hasPaidAccessForPlate, ensurePaidAccessChecked, onPlateAccessChanged } from "@/lib/payments/access";
import { isSamplePlate } from "@/lib/sample";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { track } from "@/lib/analytics";
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
    // Restore paid access after refresh (server is source of truth) and stay
    // in sync when another section on the page unlocks this plate.
    void ensurePaidAccessChecked(plate).then((paid) => {
      if (paid) setIsUnlockedForPlate(true);
    });
    const unsubscribe = onPlateAccessChanged(plate, (paid) => setIsUnlockedForPlate(paid));
    return unsubscribe;
  }, [plate]);

  const lockByAdmin = sectionKey ? settings.lockSections[sectionKey] : isLocked;
  const shouldLock = settings.paymentEnabled && lockByAdmin && isLocked;

  // The public sample plate is always fully open so visitors can see the product.
  if (!shouldLock || isUnlockedForPlate || isSamplePlate(plate)) return <>{children}</>;



  const openModal = () => {
    track("lock_clicked", { feature: featureName, section: sectionKey ?? "generic" });
    setShowModal(true);
  };

  return (
    <div className={styles.lockContainer}>
      <div className={styles.contentBlur}>
        {children}
      </div>
      <div className={styles.overlay}>
        <div className={styles.lockCard}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper}>
              <div className={styles.pulse} />
              <Lock className={styles.lockIcon} size={22} />
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


