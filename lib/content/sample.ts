// The plate shown as the public "Voorbeeldrapport" (example report). It should
// be a vehicle with rich RDW data (defects, NAP verdict, taxi/usage flags, etc.)
// so the sample shows the product at its fullest. Override per environment with
// NEXT_PUBLIC_SAMPLE_PLATE if you want a different example car.
export const SAMPLE_PLATE = (process.env.NEXT_PUBLIC_SAMPLE_PLATE || "RG513T")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "");
