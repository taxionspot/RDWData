import type { ReportInputs } from "./types";

// Defensive readers — the localized vehicle profile is an untyped record.
function rec(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
}
function str(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x.trim() : null;
}
function num(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function arr(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function describeRecall(raw: unknown): string {
  const r = rec(raw);
  const candidates = [r.beschrijving_van_de_afwijking, r.omschrijving, r.description, r.onderwerp, r.code_indicatie_constructiewijziging_o_a];
  for (const c of candidates) {
    const s = str(c);
    if (s) return s;
  }
  const firstString = Object.values(r).map(str).find(Boolean);
  return firstString ?? "Terugroepactie geregistreerd";
}

/** Extract a compact, deterministic fact-set from the localized vehicle profile. */
export function extractInputs(plate: string, locale: "nl" | "en", vehicleData: unknown): ReportInputs {
  const root = rec(vehicleData);
  const v = rec(root.vehicle);
  const e = rec(root.enriched);
  const defects = arr(root.defects);
  const defectDesc = rec(root.defectDescriptions);
  const inspections = arr(root.inspections);
  const recalls = arr(root.recalls);

  const ageYears = num(e.ageInMonths) != null ? Number((Number(e.ageInMonths) / 12).toFixed(1)) : num(v.year) != null ? new Date().getFullYear() - Number(v.year) : null;

  // Odometer readings from APK inspections (latest 8).
  const readings = inspections
    .map((i) => {
      const row = rec(i);
      return { km: num(row.tellerstand), date: str(row.datum_keuring_dt) ?? str(row.datum_keuring) ?? str(row.meld_datum_door_keuringsinstantie) };
    })
    .filter((r): r is { km: number; date: string | null } => r.km != null && r.km > 0)
    .slice(-8);

  // Defect frequency.
  const freq = new Map<string, { desc: string; count: number }>();
  for (const d of defects) {
    const code = str(rec(d).gebrek_identificatie);
    if (!code) continue;
    const desc = str(defectDesc[code]) ?? code;
    const cur = freq.get(code);
    if (cur) cur.count += 1;
    else freq.set(code, { desc, count: 1 });
  }
  const top = Array.from(freq.values()).sort((a, b) => b.count - a.count).slice(0, 5);

  const apkExpiry = str(v.apkExpiryDate);
  const apkExpired = apkExpiry ? new Date(apkExpiry).getTime() < Date.now() : false;

  const roadTaxRaw = rec(e.roadTaxEstQuarter);
  const roadTaxQuarter = num(roadTaxRaw.min) != null && num(roadTaxRaw.max) != null ? { min: Number(roadTaxRaw.min), max: Number(roadTaxRaw.max) } : null;

  return {
    plate,
    locale,
    identity: {
      brand: str(v.brand),
      model: str(v.tradeName),
      year: num(v.year),
      fuel: str(v.fuelType),
      body: str(v.bodyType),
      emissionStandard: str(v.emissionStandard)
    },
    odometer: {
      napVerdict: str(v.napVerdict),
      mileageVerdict: str(e.mileageVerdict),
      estimatedMileageNow: num(e.estimatedMileageNow),
      anomalies: arr(e.mileageAnomalies).map((a) => str(rec(a).message)).filter((s): s is string => Boolean(s)),
      readings
    },
    defects: {
      total: defects.length,
      unique: freq.size,
      top,
      apkExpiry,
      apkExpired,
      apkPassChance: num(e.apkPassChance)
    },
    compliance: {
      fuel: str(v.fuelType),
      emissionStandard: str(v.emissionStandard),
      year: num(v.year),
      ageYears,
      isImported: Boolean(e.isImported),
      hasOpenRecall: Boolean(v.hasOpenRecall),
      recalls: recalls.map(describeRecall).slice(0, 5)
    },
    value: {
      now: num(e.estimatedValueNow),
      min: num(e.estimatedValueMin),
      max: num(e.estimatedValueMax),
      confidence: str(e.marketValueConfidence),
      cataloguePrice: num(v.cataloguePrice),
      roadTaxQuarter,
      fuelEstMonth: num(e.fuelEstMonth),
      ageYears,
      mileage: num(e.estimatedMileageNow),
      owners: num(rec(v.owners).count)
    }
  };
}

const eur = (n: number | null) => (n == null ? "onbekend" : `EUR ${Math.round(n).toLocaleString("nl-NL")}`);
const km = (n: number | null) => (n == null ? "onbekend" : `${Math.round(n).toLocaleString("nl-NL")} km`);

/** Build the shared, cacheable facts block handed to every agent. */
export function buildSharedContext(inputs: ReportInputs): string {
  const i = inputs;
  const lines: string[] = [];
  lines.push(`RDW-VOERTUIGFEITEN (kenteken ${i.plate}):`);
  lines.push(
    `Identiteit: ${[i.identity.brand, i.identity.model].filter(Boolean).join(" ") || "onbekend"}${i.identity.year ? ` (${i.identity.year})` : ""}; brandstof ${i.identity.fuel ?? "onbekend"}; carrosserie ${i.identity.body ?? "onbekend"}; emissienorm ${i.identity.emissionStandard ?? "onbekend"}.`
  );
  lines.push(
    `Tellerstand: NAP-oordeel ${i.odometer.napVerdict ?? "geen"}; ons km-oordeel ${i.odometer.mileageVerdict ?? "onbekend"}; geschatte stand ${km(i.odometer.estimatedMileageNow)}.${i.odometer.anomalies.length ? ` Anomalieen: ${i.odometer.anomalies.join("; ")}.` : ""}`
  );
  if (i.odometer.readings.length) {
    lines.push(`APK-tellerstanden: ${i.odometer.readings.map((r) => `${r.date ?? "?"}: ${r.km.toLocaleString("nl-NL")}`).join(" | ")}.`);
  }
  lines.push(
    `Defecten/APK: ${i.defects.total} defectrecords (${i.defects.unique} uniek). Top: ${i.defects.top.map((t) => `${t.desc} (${t.count}x)`).join("; ") || "geen"}. APK ${i.defects.apkExpiry ? `geldig tot ${i.defects.apkExpiry}${i.defects.apkExpired ? " (VERLOPEN)" : ""}` : "onbekend"}; deterministische slaagkans ${i.defects.apkPassChance ?? "?"}%.`
  );
  lines.push(
    `Naleving: leeftijd ${i.compliance.ageYears ?? "?"} jaar; geimporteerd ${i.compliance.isImported ? "ja" : "nee"}; openstaande recall ${i.compliance.hasOpenRecall ? "JA" : "nee"}.${i.compliance.recalls.length ? ` Recalls: ${i.compliance.recalls.join("; ")}.` : ""}`
  );
  lines.push(
    `Waarde/kosten: geschatte marktwaarde ${eur(i.value.now)} (range ${eur(i.value.min)} - ${eur(i.value.max)}, betrouwbaarheid ${i.value.confidence ?? "onbekend"}); catalogusprijs ${eur(i.value.cataloguePrice)}; wegenbelasting ${i.value.roadTaxQuarter ? `EUR ${i.value.roadTaxQuarter.min}-${i.value.roadTaxQuarter.max}/kwartaal` : "onbekend"}; brandstof ~${eur(i.value.fuelEstMonth)}/maand; ${i.value.owners ?? "onbekend"} eigenaren.`
  );
  lines.push("");
  lines.push("REGELS: Gebruik UITSLUITEND deze feiten. Verzin niets. Geen lange streepjes (em/en-dash). Schrijf menselijk en concreet.");
  return lines.join("\n");
}
