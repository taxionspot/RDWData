export type PublicSiteSettings = {
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
  landing: {
    badgeTop: string;
    trustedSourcesLabel: string;
    featureSectionLabel: string;
    featureSectionTitle: string;
    howSectionLabel: string;
    howSectionTitle: string;
    sectionVisibility: {
      features: boolean;
      workflow: boolean;
      cta: boolean;
    };
    features: Array<{ id: string; icon: string; title: string; desc: string }>;
    workflow: Array<{ id: string; title: string; desc: string }>;
    footer: {
      productTitle: string;
      companyTitle: string;
      legalTitle: string;
      productLinks: string[];
      companyLinks: string[];
      legalLinks: string[];
    };
  };
  seo: {
    metaTitle: string;
    metaDescription: string;
    ogImage: string;
    googleAnalyticsId: string;
    faviconUrl: string;
    microsoftClarityId: string;
  };
  appearance: {
    primaryColor: string;
    accentColor: string;
    fontFamily: string;
    logoUrl: string;
    logoText: string;
  };
  email: {
    fromName: string;
    fromAddress: string;
    reportSubjectNl: string;
    reportSubjectEn: string;
    welcomeBodyNl: string;
    welcomeBodyEn: string;
  };
};

export const defaultSiteSettings: PublicSiteSettings = {
  paymentEnabled: true,
  payment: {
    amount: "9.95",
    currency: "EUR"
  },
  lockSections: {
    riskOverview: true,
    mileageHistory: true,
    marketAnalysis: true,
    vehicleComparison: true,
    damageHistory: true,
    technicalSpecs: false,
    inspectionTimeline: false,
    ownershipHistory: false,
    reportDownload: true
  },
  ui: {
    showFeaturesLink: true,
    showSampleLink: true,
    showPricingLink: true,
    showLoginButton: true
  },
  content: {
    platformName: "Kentekenrapport",
    landingHeroTitleA: "Koop je volgende auto niet blind.",
    landingHeroTitleB: "Ken de echte geschiedenis.",
    landingHeroSubtitle:
      "Ontdek direct verborgen schade, kilometerfraude, marktwaarde en eigendomsgeschiedenis met alleen een kenteken.",
    landingCtaTitle: "Klaar om met vertrouwen te kopen?",
    landingCtaSubtitle:
      "Check je auto vóór de koop en onderhandel met vertrouwen, direct op basis van officiële RDW-data.",
    landingCtaButton: "Start je check nu",
    landingHeroImageUrl: "/hero-car.png",
    footerDescription:
      "Complete en transparante voertuighistorie voor autokopers, op basis van officiële RDW-data."
  },
  landing: {
    badgeTop: "Direct inzicht via officiële RDW-data",
    trustedSourcesLabel: "Vertrouwde databronnen",
    featureSectionLabel: "Volledige data",
    featureSectionTitle: "Alles wat je nodig hebt voor een veilige aankoop",
    howSectionLabel: "Hoe het werkt",
    howSectionTitle: "Drie simpele stappen naar volledige zekerheid",
    sectionVisibility: {
      features: true,
      workflow: true,
      cta: true
    },
    features: [
      {
        id: "damage",
        icon: "CarFront",
        title: "Schadegeschiedenis",
        desc: "Bekijk visuele schadesignalen en reparatie-inschattingen om structurele risico's vooraf te herkennen."
      },
      {
        id: "mileage",
        icon: "Gauge",
        title: "Kilometercontrole",
        desc: "Volg de echte kilometrage-trend en detecteer verdachte terugdraaiingen met gewogen regressie."
      },
      {
        id: "market",
        icon: "TrendingUp",
        title: "Marktwaardering",
        desc: "Vergelijk vraagprijzen met actuele Nederlandse marktdata zodat je nooit te veel betaalt."
      },
      {
        id: "owners",
        icon: "Users",
        title: "Eigendomstijdlijn",
        desc: "Zie elke overdrachtsdatum, eigendomstype en of het voertuig in NL of in het buitenland reed."
      },
      {
        id: "apk",
        icon: "FileCheck",
        title: "Inspectieregistraties",
        desc: "Bekijk APK-historie, defectsignalen en aankomende keuringsmomenten in een overzicht."
      },
      {
        id: "specs",
        icon: "FileSpreadsheet",
        title: "Technische specificaties",
        desc: "Volledige uitsplitsing van motorvermogen, emissies, gewichten en uitrusting direct uit RDW."
      }
    ],
    workflow: [
      {
        id: "1",
        title: "Voer het kenteken in",
        desc: "Typ een Nederlands kenteken in de zoekbalk."
      },
      {
        id: "2",
        title: "Wij verzamelen de data",
        desc: "Onze pipeline combineert RDW, inspectiehistorie en defecten in een helder beeld."
      },
      {
        id: "3",
        title: "Neem een slimme beslissing",
        desc: "Bekijk het rapport, markeer risico's en gebruik marktinzichten voor betere onderhandeling."
      }
    ],
    footer: {
      productTitle: "Product",
      companyTitle: "Bedrijf",
      legalTitle: "Juridisch",
      productLinks: ["Kentekencheck", "Functies", "Voorbeeldrapport", "Prijzen"],
      companyLinks: ["Contact", "Account"],
      legalLinks: ["Algemene voorwaarden", "Privacybeleid", "Cookieverklaring"]
    }
  },
  seo: {
    metaTitle: "Kentekenrapport - Nederlandse Kentekeninzichten",
    metaDescription: "Directe Nederlandse kentekencheck. Voertuigprofiel, APK-status, inspectiehistorie en marktwaarde.",
    ogImage: "",
    googleAnalyticsId: "",
    faviconUrl: "",
    microsoftClarityId: ""
  },
  appearance: {
    primaryColor: "#2563eb",
    accentColor: "#dbeafe",
    fontFamily: "Inter",
    logoUrl: "",
    logoText: "Kentekenrapport"
  },
  email: {
    fromName: "Anouk van Kentekenrapport",
    fromAddress: "info@kentekenrapport.com",
    reportSubjectNl: "Jouw kentekenrapport",
    reportSubjectEn: "Your vehicle report",
    welcomeBodyNl: "Bedankt voor het gebruiken van Kentekenrapport. Uw rapport is bijgevoegd.",
    welcomeBodyEn: "Thank you for using Kentekenrapport. Your report is attached."
  }
};
