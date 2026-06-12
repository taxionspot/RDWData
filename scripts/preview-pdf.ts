// Generates a sample vehicle report PDF with mock data for design review.
// Usage: npx tsx scripts/preview-pdf.ts [output.pdf]
import { writeFileSync } from "node:fs";
import { generateVehicleReportPdf } from "../lib/api/pdf-report";

const mockData = {
  vehicle: {
    brand: "Volkswagen",
    tradeName: "Golf 1.4 TSI Highline",
    year: 2017,
    color: { primary: "Grijs", secondary: null },
    bodyType: "Hatchback",
    doors: 5,
    seats: 5,
    fuelType: "Benzine",
    co2: 116,
    energyLabel: "B",
    consumptionCombined: 5.0,
    emissionStandard: "EURO 6",
    engine: { displacement: 1395, cylinders: 4, powerKw: 92 },
    weight: { empty: 1265, max: 1810, payload: 545 },
    apkExpiryDate: "2026-11-14",
    owners: { count: 3 },
    firstRegistrationNL: "20170324",
    firstRegistrationWorld: "20170324",
    exportIndicator: false,
    wok: false,
    transferPossible: true,
    insured: true,
    isTaxi: false,
    hasOpenRecall: false,
    napVerdict: "Logisch",
    napLastYear: 2025,
    cataloguePrice: 28950,
    recallsCount: 1
  },
  enriched: {
    ageInMonths: 110,
    ageString: "9 jaar en 2 maanden",
    isImported: false,
    maintenanceRiskScore: 4.2,
    estimatedValueNow: 11250,
    estimatedValueMin: 9800,
    estimatedValueMax: 12900,
    estimatedValueNextYear: 10100,
    marketValueConfidence: "MEDIUM",
    estimatedMileageNow: 128500,
    estimatedMileageMin: 118000,
    estimatedMileageMax: 139000,
    mileageVerdict: "LOGISCH",
    mileageUsageProfile: "Gemiddeld gebruik",
    mileageSlopeKmPerYear: 14100,
    mileageAnomalies: [],
    apkPassChance: 87,
    repairChances: [
      { name: "Remblokken en -schijven", chance: 35, estMin: 250, estMax: 450 },
      { name: "Distributieketting / waterpomp", chance: 18, estMin: 600, estMax: 1100 },
      { name: "Ophanging (fusee/draagarm)", chance: 22, estMin: 300, estMax: 650 }
    ],
    roadTaxEstQuarter: { min: 148, max: 172 },
    insuranceEstMonth: 62,
    fuelEstMonth: 145,
    knownIssues: [
      {
        title: "Carbonopbouw inlaatkleppen (TSI)",
        severity: "MEDIUM",
        target: "1.4 TSI motoren",
        advice: "Vraag naar reinigingshistorie bij hoge kilometerstanden."
      },
      {
        title: "Waterpomp lekkage",
        severity: "LOW",
        target: "EA211 motorfamilie",
        advice: "Controleer op koelvloeistofverlies tijdens proefrit."
      }
    ]
  },
  inspections: [
    {
      meld_datum_door_keuringsinstantie_dt: "2025-11-04T00:00:00.000",
      soort_erkenning_omschrijving: "APK Lichte voertuigen",
      aantal_gebreken_geconstateerd: "0"
    },
    {
      meld_datum_door_keuringsinstantie_dt: "2024-11-12T00:00:00.000",
      soort_erkenning_omschrijving: "APK Lichte voertuigen",
      aantal_gebreken_geconstateerd: "1",
      gebrek_identificatie: "AC1"
    },
    {
      meld_datum_door_keuringsinstantie_dt: "2023-11-02T00:00:00.000",
      soort_erkenning_omschrijving: "APK Lichte voertuigen",
      aantal_gebreken_geconstateerd: "0"
    }
  ],
  defects: [],
  defectDescriptions: {
    AC1: "Band(en) beschadigd of profieldiepte onvoldoende"
  },
  recalls: [
    {
      campagnenummer: "23X4",
      omschrijving_defect: "Mogelijk defecte gordelspanner bestuurdersstoel",
      status: "Uitgevoerd"
    }
  ],
  raw: { main: [], fuel: [], apk: [], defects: [], recalls: [], body: [], typeApprovals: [] }
};

const aiInsights = {
  summary:
    "Deze Volkswagen Golf uit 2017 toont een consistent en goed gedocumenteerd onderhoudsverleden. De kilometerstand ontwikkelt zich logisch, de APK-historie bevat slechts één klein gebrek (banden) dat direct is verholpen, en er zijn geen openstaande terugroepacties. De vraagprijs ligt naar verwachting rond de marktwaarde; let bij de bezichtiging vooral op de bekende TSI-aandachtspunten.",
  positives: [
    "Logisch kilometerverloop, bevestigd door RDW-tellerstandoordeel",
    "Schone APK-historie met slechts één klein, direct verholpen gebrek",
    "Terugroepactie is aantoonbaar uitgevoerd",
    "Courant model met goede restwaarde"
  ],
  risks: [
    "1.4 TSI staat bekend om carbonopbouw op inlaatkleppen bij hogere kilometerstanden",
    "Derde eigenaar: vraag het volledige onderhoudsboekje op",
    "Remmen naderen mogelijk vervangingsinterval (kostenindicatie € 250 - € 450)"
  ],
  recommendation:
    "Een degelijke aankoop binnen dit segment. Plan een proefrit met koude start en laat de auto bij twijfel doorlichten door een onafhankelijk keurstation.",
  purchaseVerdict: "BUY" as const,
  riskLevel: "LOW" as const,
  recommendations: [
    "Vraag het onderhoudsboekje en facturen van de laatste twee beurten op",
    "Controleer de staat van remblokken en -schijven tijdens de bezichtiging",
    "Maak een proefrit met koude motor en let op trillingen of inhouden",
    "Onderhandel op basis van de marktbandbreedte (€ 9.800 - € 12.900)"
  ]
};

const aiValuation = {
  currency: "EUR" as const,
  estimatedValueNow: 11250,
  estimatedValueMin: 9800,
  estimatedValueMax: 12900,
  confidence: "MEDIUM" as const,
  factors: [
    "Kilometerstand rond het segmentgemiddelde",
    "Populaire uitvoering (Highline) met goede vraag",
    "Drie eigenaren drukt de waarde licht",
    "Benzinemotoren in dit segment zijn courant"
  ],
  explanation:
    "De waardering is gebaseerd op vergelijkbare Golf-modellen uit 2016-2018 met een kilometerstand tussen 110.000 en 145.000 km. De Highline-uitvoering en het logische tellerverloop ondersteunen de bovenkant van de bandbreedte."
};

async function main() {
  const pdf = await generateVehicleReportPdf({
    plate: "HF001B",
    locale: "nl",
    generatedAt: new Date(),
    data: mockData as unknown as Record<string, unknown>,
    aiInsights,
    aiValuation
  });
  const output = process.argv[2] ?? "preview-report.pdf";
  writeFileSync(output, pdf);
  console.log(`Wrote ${output} (${pdf.length} bytes)`);
}

void main();
