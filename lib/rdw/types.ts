export type RdwRecord = Record<string, string | number | null>;
import type { EnrichedData } from "./heuristics";

export type VehicleProfile = {
  plate: string;
  displayPlate: string;
  fromCache: boolean;
  enriched?: EnrichedData;
  vehicle: {
    // Identity
    brand: string | null;
    tradeName: string | null;
    typeCode: string | null;
    variant: string | null;
    uitvoering: string | null;
    year: number | null;
    color: { primary: string | null; secondary: string | null };

    // Body
    bodyType: string | null;
    doors: number | null;
    seats: number | null;
    axles: number | null;

    // Fuel & Emissions
    fuelType: string | null;
    co2: number | null;
    energyLabel: string | null;           // A / B / C …
    consumptionCombined: number | null;
    emissionStandard: string | null;           // e.g. "EURO 5 F"

    // Engine
    engine: {
      displacement: number | null;
      cylinders: number | null;
      powerKw: number | null;
    };

    // Dimensions
    dimensions: {
      wheels: number | null;
      wheelbase: number | null;
      length: number | null;
      width: number | null;
      height: number | null;
    };

    // Weight
    weight: {
      empty: number | null;
      max: number | null;
      payload: number | null;
      readyToDrive: number | null;
      powerToMassRatio: number | null;
    };

    // APK
    apkExpiryDate: string | null;

    // Ownership
    owners: { count: number | null };

    // Import / export
    firstRegistrationNL: string | null;
    firstRegistrationWorld: string | null;
    exportIndicator: boolean;

    // Flags
    wok: boolean;
    transferPossible: boolean;
    insured: boolean;                   // wam_verzekerd
    isTaxi: boolean;                   // taxi_indicator
    hasOpenRecall: boolean;                   // openstaande_terugroepactie_indicator

    // NAP mileage verdict (free RDW signal)
    napVerdict: string | null;                  // "Logisch" | "Onlogisch" | "Geen oordeel"
    napLastYear: number | null;                  // year of last odometer registration

    // Financial
    cataloguePrice: number | null;               // catalogusprijs in EUR

    recallsCount: number;
  };
  inspections: RdwRecord[];
  defects: RdwRecord[];
  defectDescriptions: Record<string, string>;
  recalls: RdwRecord[];
  typeApprovals: RdwRecord[];
  raw: {
    main: RdwRecord[];
    fuel: RdwRecord[];
    apk: RdwRecord[];
    defects: RdwRecord[];
    recalls: RdwRecord[];
    body: RdwRecord[];
    typeApprovals: RdwRecord[];
  };
};
