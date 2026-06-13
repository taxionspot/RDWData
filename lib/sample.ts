/**
 * The public sample report plate (the "Voorbeeldrapport"). All premium sections
 * are open for this plate so visitors can see exactly what they buy.
 */
export const SAMPLE_PLATE = "H223JZ";

export function isSamplePlate(plate: string | null | undefined): boolean {
  if (!plate) return false;
  return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase() === SAMPLE_PLATE;
}
