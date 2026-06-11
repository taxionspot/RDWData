/**
 * The public sample report plate. RG-513-T is a data-rich vehicle in the RDW
 * register (long APK history with recorded defects), which makes it a good
 * showcase. All premium sections are open for this plate so visitors can see
 * exactly what they buy.
 */
export const SAMPLE_PLATE = "RG513T";

export function isSamplePlate(plate: string | null | undefined): boolean {
  if (!plate) return false;
  return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase() === SAMPLE_PLATE;
}
