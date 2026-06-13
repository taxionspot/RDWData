const RDW_BASE_URL = process.env.RDW_BASE_URL || "https://opendata.rdw.nl/resource";

export const DATASETS = {
  main: "m9d7-ebf2",
  fuel: "8ys7-d773",
  apk: "a34c-vvps",
  defects: "hx2c-gt7k",   // not plate-filterable via simple param
  recalls: "af5r-44mf",   // not plate-filterable via simple param
  body: "vezc-m2t6",
  typeApprovals: "55kv-xf7m",
  approvedGarages: "5k74-3jha",
  defectDescriptions: "tbph-ct3j", // tbph-ct3j
  // TGK (typegoedkeuring) datasets, keyed by typegoedkeuringsnummer (NOT kenteken).
  // Second-stage lookup after the main register returns the type-approval number.
  tgkGears: "7rjk-eycs",   // TGK Versnelling Uitvoering (transmission type + gear count)
  tgkNames: "x5v3-sewk"    // TGK Handelsbenaming Fabrikant (factory model/type name)
} as const;

/** These datasets don't support `?kenteken=` filtering — skip or use $where */
export const NON_PLATE_FILTERABLE_DATASETS = new Set<string>([
  DATASETS.defects,
  DATASETS.recalls
]);

/** Standard `?kenteken=PLATE` URL */
export function rdwUrl(datasetId: string, plate: string): string {
  const url = new URL(`${RDW_BASE_URL}/${datasetId}.json`);
  url.searchParams.set("kenteken", plate);
  return url.toString();
}

/** SoQL `$where=kenteken='PLATE'` URL — for datasets that need it */
export function rdwSoqlUrl(datasetId: string, plate: string, limit = 50): string {
  const url = new URL(`${RDW_BASE_URL}/${datasetId}.json`);
  url.searchParams.set("$where", `kenteken='${plate}'`);
  url.searchParams.set("$limit", String(limit));
  return url.toString();
}

/** SoQL generic URL for custom $where clauses */
export function rdwSoqlCustomUrl(datasetId: string, whereClause: string, limit = 50): string {
  const url = new URL(`${RDW_BASE_URL}/${datasetId}.json`);
  url.searchParams.set("$where", whereClause);
  url.searchParams.set("$limit", String(limit));
  return url.toString();
}

/**
 * `?typegoedkeuringsnummer=<tgk>` URL for the TGK datasets (keyed by
 * type-approval number, not kenteken). Used for the second-stage fetch.
 */
export function rdwTgkUrl(datasetId: string, typeApprovalNumber: string, limit = 200): string {
  const url = new URL(`${RDW_BASE_URL}/${datasetId}.json`);
  url.searchParams.set("typegoedkeuringsnummer", typeApprovalNumber);
  url.searchParams.set("$limit", String(limit));
  return url.toString();
}
