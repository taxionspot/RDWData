import type { PublicSiteSettings } from "../site-settings/defaults";

export type GroupId =
  | "g1-verdict"
  | "g2-markt"
  | "g3-risico"
  | "g4-km"
  | "g5-apk"
  | "g6-voertuig";

export type ReportSectionId =
  | "overzicht"
  | "ai-analyse"
  | "markt"
  | "te-koop"
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
    id: "g1-verdict",
    labelNl: "Overzicht & oordeel",
    labelEn: "Overview & verdict",
    lockKey: null,
    defaultOpen: true,
    sectionIds: ["overzicht", "ai-analyse"]
  },
  {
    id: "g2-markt",
    labelNl: "Marktwaarde & eerlijke prijs",
    labelEn: "Market value & fair price",
    lockKey: "marketAnalysis",
    defaultOpen: true,
    sectionIds: ["markt", "te-koop"]
  },
  {
    id: "g3-risico",
    labelNl: "Risicos & schade",
    labelEn: "Risks & damage",
    lockKey: "damageHistory",
    defaultOpen: false,
    sectionIds: ["schade"]
  },
  {
    id: "g4-km",
    labelNl: "Kilometerstand & NAP",
    labelEn: "Mileage & NAP",
    lockKey: "mileageHistory",
    defaultOpen: false,
    sectionIds: ["kilometerstand"]
  },
  {
    id: "g5-apk",
    labelNl: "APK-historie & rijwaardigheid",
    labelEn: "MOT history & roadworthiness",
    lockKey: "inspectionTimeline",
    defaultOpen: false,
    sectionIds: ["apk", "apk-intelligence"]
  },
  {
    id: "g6-voertuig",
    labelNl: "Eigendom & voertuiggegevens",
    labelEn: "Ownership & vehicle data",
    lockKey: "ownershipHistory",
    defaultOpen: false,
    sectionIds: ["eigendom", "specs"]
  }
];
