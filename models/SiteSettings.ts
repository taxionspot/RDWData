import { model, models, Schema, type Model } from "mongoose";

export type SiteSettingsDoc = {
  key: "global";
  paymentEnabled: boolean;
  payment: {
    amount: string;
    currency: string;
  };
  lockSections: {
    riskOverview: boolean;
    mileageHistory: boolean;
    marketAnalysis: boolean;
    vehicleComparison: boolean;
    damageHistory: boolean;
    technicalSpecs: boolean;
    inspectionTimeline: boolean;
    ownershipHistory: boolean;
    reportDownload: boolean;
  };
  ui: {
    showFeaturesLink: boolean;
    showSampleLink: boolean;
    showPricingLink: boolean;
    showLoginButton: boolean;
  };
  content: {
    platformName: string;
    landingHeroTitleA: string;
    landingHeroTitleB: string;
    landingHeroSubtitle: string;
    landingCtaTitle: string;
    landingCtaSubtitle: string;
    landingCtaButton: string;
    landingHeroImageUrl: string;
    footerDescription: string;
  };
  landing: unknown;
  updatedAt: Date;
  createdAt: Date;
};

const siteSettingsSchema = new Schema<SiteSettingsDoc>(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    paymentEnabled: { type: Boolean, required: true, default: true },
    payment: {
      amount: { type: String, required: true, default: "6.95" },
      currency: { type: String, required: true, default: "EUR" }
    },
    lockSections: {
      riskOverview: { type: Boolean, required: true, default: true },
      mileageHistory: { type: Boolean, required: true, default: true },
      marketAnalysis: { type: Boolean, required: true, default: true },
      vehicleComparison: { type: Boolean, required: true, default: true },
      damageHistory: { type: Boolean, required: true, default: true },
      technicalSpecs: { type: Boolean, required: true, default: false },
      inspectionTimeline: { type: Boolean, required: true, default: false },
      ownershipHistory: { type: Boolean, required: true, default: false },
      reportDownload: { type: Boolean, required: true, default: true }
    },
    ui: {
      showFeaturesLink: { type: Boolean, required: true, default: true },
      showSampleLink: { type: Boolean, required: true, default: true },
      showPricingLink: { type: Boolean, required: true, default: true },
      showLoginButton: { type: Boolean, required: true, default: true }
    },
    content: {
      platformName: { type: String, required: true, default: "Kentekenrapport" },
      landingHeroTitleA: { type: String, required: true, default: "Koop je volgende auto niet blind." },
      landingHeroTitleB: { type: String, required: true, default: "Ken de echte geschiedenis." },
      landingHeroSubtitle: {
        type: String,
        required: true,
        default:
          "Ontdek direct verborgen schade, kilometerfraude, marktwaarde en eigendomsgeschiedenis met alleen een kenteken."
      },
      landingCtaTitle: {
        type: String,
        required: true,
        default: "Klaar om met vertrouwen te kopen?"
      },
      landingCtaSubtitle: {
        type: String,
        required: true,
        default: "Sluit je aan bij meer dan 1.000.000 slimme kopers die hun auto checkten voor de deal."
      },
      landingCtaButton: {
        type: String,
        required: true,
        default: "Start je check nu"
      },
      landingHeroImageUrl: {
        type: String,
        required: true,
        default:
          "https://storage.googleapis.com/banani-generated-images/generated-images/ad953e96-ea70-4d4d-ab60-fc21c7b01fb4.jpg"
      },
      footerDescription: {
        type: String,
        required: true,
        default:
          "Het meest complete en transparante voertuiggeschiedenisplatform voor kopers en dealers."
      }
    },
    landing: {
      type: Schema.Types.Mixed,
      required: true,
      default: {}
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export const SiteSettingsModel: Model<SiteSettingsDoc> =
  (models.SiteSettings as Model<SiteSettingsDoc> | undefined) ||
  model<SiteSettingsDoc>("SiteSettings", siteSettingsSchema);
