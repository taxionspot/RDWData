import { useEffect, useState, type ReactNode } from "react";
import styles from "./PremiumLock.module.css";
import { Button } from "./Button";
import { Lock, FileText } from "lucide-react";
import { SubscriptionModal } from "./SubscriptionModal";
import { useI18n } from "@/lib/i18n/context";
import { hasPaidAccessForPlate, ensurePaidAccessChecked, onPlateAccessChanged } from "@/lib/payments/access";
import { isSamplePlate } from "@/lib/sample";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { track } from "@/lib/analytics";
import { usePageUnlock } from "@/components/vehicle/page-unlock-context";
import type { PublicSiteSettings } from "@/lib/site-settings/defaults";

interface PremiumLockProps {
  children: ReactNode;
  isLocked?: boolean;
  featureName: string;
  plate?: string;
  sectionKey?: keyof PublicSiteSettings["lockSections"];
  /** Honest one-line description of what is behind the lock (NL). */
  previewNl?: string;
  /** Honest one-line description of what is behind the lock (EN). */
  previewEn?: string;
  /**
   * When provided, the unlock CTA opens the single page-level modal instead of
   * mounting a per-instance SubscriptionModal. This stops ~13 modal instances
   * on a full report. Standalone screens that have no page-level modal omit it
   * and get a local fallback modal.
   */
  onUnlockClick?: () => void;
}

export function PremiumLock({
  children,
  isLocked = true,
  featureName,
  plate,
  sectionKey,
  previewNl,
  previewEn,
  onUnlockClick
}: PremiumLockProps) {
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

  const pageUnlock = usePageUnlock();

  const lockByAdmin = sectionKey ? settings.lockSections[sectionKey] : isLocked;
  const shouldLock = settings.paymentEnabled && lockByAdmin && isLocked;

  // The public sample plate is always fully open so visitors can see the product.
  if (!shouldLock || isUnlockedForPlate || isSamplePlate(plate)) return <>{children}</>;

  const openUnlock = () => {
    track("lock_clicked", { feature: featureName, section: sectionKey ?? "generic" });
    const opener = onUnlockClick ?? pageUnlock;
    if (opener) {
      opener();
      return;
    }
    setShowModal(true);
  };

  const nl = locale === "nl";
  const preview = nl
    ? previewNl ?? `Dit onderdeel toont de volledige ${featureName} uit de officiele RDW-data.`
    : previewEn ?? `This section shows the full ${featureName} from the official RDW data.`;

  return (
    <div className={styles.lockContainer}>
      {/* Honest factual preview line, no blurred data. */}
      <p className={styles.previewLine}>
        <FileText className={styles.previewIcon} size={16} />
        <span>{preview}</span>
      </p>

      <div className={styles.lockBody}>
        <div className={styles.lockCard}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper}>
              <div className={styles.pulse} />
              <Lock className={styles.lockIcon} size={22} />
            </div>
            <h3 className={styles.title}>{nl ? `Ontgrendel ${featureName}` : `Unlock ${featureName}`}</h3>
            <p className={styles.description}>
              {nl
                ? "Eenmalig ontgrendelen voor dit kenteken. Je krijgt direct toegang tot het hele rapport."
                : "Unlock once for this plate. You get instant access to the whole report."}
            </p>
          </div>

          <Button variant="primary" className={styles.unlockButton} onClick={openUnlock}>
            {nl ? "Ontgrendel het volledige rapport" : "Unlock the full report"}
          </Button>
        </div>
      </div>

      {/* Local fallback modal only when no page-level modal is wired in. */}
      {onUnlockClick || pageUnlock ? null : (
        <SubscriptionModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          featureName={featureName}
          plate={plate ?? ""}
          onUnlocked={() => setIsUnlockedForPlate(true)}
        />
      )}
    </div>
  );
}
