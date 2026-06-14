import type { PublicSiteSettings } from "../site-settings/defaults";

export type GroupId =
  | "g1-overzicht"
  | "g2-oordeel"
  | "g3-markt"
  | "g4-tekoop"
  | "g5-schatting"
  | "g6-risico"
  | "g7-km"
  | "g8-apk"
  | "g9-eigendom";

export type ReportSectionId =
  | "overzicht"
  | "ai-analyse"
  | "markt"
  | "te-koop"
  | "schatting"
  | "kilometerstand"
  | "apk"
  | "risico"
  | "schade"
  | "eigendom"
  | "apk-intelligence"
  | "specs"
  | "acties";

export type GroupDef = {
  id: GroupId;
  labelNl: string;
  labelEn: string;
  lockKey: keyof PublicSiteSettings["lockSections"] | null;
  defaultOpen: boolean;
  sectionIds: ReportSectionId[];
};

export const GROUPS: GroupDef[] = [
  {
    id: "g1-overzicht",
    labelNl: "Voertuig & kerngegevens",
    labelEn: "Vehicle & key data",
    lockKey: null,
    defaultOpen: true,
    sectionIds: ["overzicht"]
  },
  {
    id: "g2-oordeel",
    labelNl: "Oordeel & inzicht",
    labelEn: "Verdict & insight",
    lockKey: "riskOverview",
    defaultOpen: true,
    sectionIds: ["ai-analyse"]
  },
  {
    id: "g3-markt",
    labelNl: "Marktwaarde",
    labelEn: "Market value",
    lockKey: "marketAnalysis",
    defaultOpen: true,
    sectionIds: ["markt"]
  },
  {
    id: "g4-tekoop",
    labelNl: "Vergelijkbaar aanbod",
    labelEn: "Comparable listings",
    lockKey: "marketAnalysis",
    defaultOpen: true,
    sectionIds: ["te-koop"]
  },
  {
    id: "g5-schatting",
    labelNl: "Schatting & risico",
    labelEn: "Estimate & risk",
    lockKey: "marketAnalysis",
    defaultOpen: false,
    sectionIds: ["schatting"]
  },
  {
    id: "g6-risico",
    labelNl: "Risico's & schade",
    labelEn: "Risks & damage",
    lockKey: "damageHistory",
    defaultOpen: false,
    sectionIds: ["schade"]
  },
  {
    id: "g7-km",
    labelNl: "Kilometerstand & NAP",
    labelEn: "Mileage & NAP",
    lockKey: "mileageHistory",
    defaultOpen: false,
    sectionIds: ["kilometerstand"]
  },
  {
    id: "g8-apk",
    labelNl: "APK-historie + statistiek",
    labelEn: "MOT history + statistics",
    lockKey: "inspectionTimeline",
    defaultOpen: false,
    sectionIds: ["apk", "apk-intelligence"]
  },
  {
    id: "g9-eigendom",
    labelNl: "Eigendom & voertuiggegevens",
    labelEn: "Ownership & vehicle data",
    lockKey: "ownershipHistory",
    defaultOpen: false,
    sectionIds: ["eigendom", "specs"]
  }
];
