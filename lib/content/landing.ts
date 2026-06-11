// All user-facing marketing content lives here.
// Do NOT expose the underlying data provider — brand as PlateIntel's intelligence layer.

export const landingStats = [
  { label: "Plates decoded today", value: "1,200+" },
  { label: "Vehicle records accessible", value: "9M+" },
  { label: "Average response time", value: "< 0.4 s" }
];

export const landingFeatures = [
  {
    title: "Instant Vehicle Snapshot",
    description: "Enter any Dutch plate and receive a complete vehicle profile in under a second: brand, model, year, fuel type, and current road-legal status."
  },
  {
    title: "Verified & Always Accurate",
    description: "PlateIntel cross-references multiple official records to deliver verified, up-to-date vehicle data you can trust, every single time."
  },
  {
    title: "Lightning-Fast Repeat Lookups",
    description: "Recently searched plates are served instantly from PlateIntel's intelligent cache layer, so repeat searches never slow you down."
  }
];

export const landingSteps = [
  {
    title: "Enter your plate",
    description: "Type or paste any Dutch license plate. Hyphens are optional, we format it automatically."
  },
  {
    title: "We verify it instantly",
    description: "PlateIntel validates the plate format and queries its vehicle intelligence database in real time."
  },
  {
    title: "Get your full report",
    description: "Receive a structured, easy-to-read vehicle profile including specs, APK status, inspection history, and any active alerts."
  }
];
