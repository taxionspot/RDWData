"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toVehicleProfile = toVehicleProfile;
const normalize_1 = require("./normalize");
const heuristics_1 = require("./heuristics");
function str(v) {
    if (v == null || v === "")
        return null;
    return String(v);
}
function num(v) {
    const n = Number(v);
    return v != null && v !== "" && Number.isFinite(n) ? n : null;
}
function bool(v) {
    const s = String(v ?? "").toLowerCase();
    return s === "ja" || s === "j" || v === true || s === "yes";
}
function dateStr(v) {
    const s = str(v);
    if (!s)
        return null;
    const d = s.replace(/\D/g, "");
    if (d.length === 8)
        return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    if (s.includes("T"))
        return s.split("T")[0];
    return s;
}
function toVehicleProfile(input) {
    const m = input.main[0] ?? {};
    // fuel[0] = primary fuel (petrol/diesel); fuel[1+] = secondary (e.g. electric
    // for a plug-in hybrid). Numeric specs are read from the primary row, but the
    // fuel TYPE combines all rows so PHEV/dual-fuel vehicles are shown correctly.
    const f = input.fuel[0] ?? {};
    const fuelDescriptions = Array.from(new Set(input.fuel.map((r) => str(r.brandstof_omschrijving)).filter((x) => Boolean(x))));
    const fuelType = fuelDescriptions.length ? fuelDescriptions.join(" / ") : null;
    // Prefer fuel's emission standard, fall back to main
    const allFuelStandards = input.fuel
        .map((r) => str(r.uitlaatemissieniveau))
        .filter(Boolean)
        .join(" / ");
    const yearRaw = str(m.datum_eerste_toelating ?? m.datum_eerste_toelating_dt);
    const year = yearRaw ? Number(String(yearRaw).replace(/\D/g, "").slice(0, 4)) : null;
    const profile = {
        plate: input.plate,
        displayPlate: (0, normalize_1.formatDisplayPlate)(input.plate),
        fromCache: input.fromCache,
        vehicle: {
            // Identity
            brand: str(m.merk),
            tradeName: str(m.handelsbenaming),
            year: Number.isFinite(year) ? year : null,
            color: {
                primary: str(m.eerste_kleur),
                secondary: str(m.tweede_kleur) === "Niet geregistreerd" ? null : str(m.tweede_kleur)
            },
            // Body
            bodyType: str(m.inrichting),
            doors: num(m.aantal_deuren),
            seats: num(m.aantal_zitplaatsen),
            axles: num(m.aantal_assen),
            // Fuel & Emissions
            fuelType,
            co2: num(f.co2_uitstoot_gecombineerd),
            energyLabel: str(m.zuinigheidsclassificatie ?? f.zuinigheidsclassificatie),
            consumptionCombined: num(f.brandstofverbruik_gecombineerd),
            emissionStandard: allFuelStandards || null,
            // Engine
            engine: {
                displacement: num(m.cilinderinhoud ?? f.cilinderinhoud),
                cylinders: num(m.aantal_cilinders),
                powerKw: num(f.nettomaximumvermogen ?? f.nominaal_continu_maximumvermogen)
            },
            // Weight
            weight: {
                empty: num(m.massa_ledig_voertuig),
                max: num(m.toegestane_maximum_massa_voertuig),
                payload: num(m.laadvermogen)
            },
            // APK
            apkExpiryDate: dateStr(m.vervaldatum_apk_dt ?? m.vervaldatum_apk),
            // Ownership
            owners: { count: num(m.aantal_houders) },
            currentOwnerSince: dateStr(m.datum_tenaamstelling ?? m.datum_tenaamstelling_dt),
            // Import / export
            firstRegistrationNL: dateStr(m.datum_eerste_tenaamstelling_in_nederland_dt ?? m.datum_eerste_tenaamstelling_in_nederland),
            firstRegistrationWorld: dateStr(m.datum_eerste_toelating_dt ?? m.datum_eerste_toelating),
            exportIndicator: bool(m.export_indicator),
            // Flags
            wok: bool(m.wacht_op_keuren),
            transferPossible: bool(m.tenaamstellen_mogelijk),
            insured: bool(m.wam_verzekerd),
            isTaxi: bool(m.taxi_indicator),
            hasOpenRecall: bool(m.openstaande_terugroepactie_indicator),
            // NAP mileage verdict
            napVerdict: str(m.tellerstandoordeel),
            napLastYear: num(m.jaar_laatste_registratie_tellerstand),
            // Financial
            cataloguePrice: num(m.catalogusprijs),
            recallsCount: input.recalls.length
        },
        inspections: input.apk,
        defects: input.defects,
        defectDescriptions: input.defectDescriptions ?? {},
        recalls: input.recalls,
        typeApprovals: input.typeApprovals,
        raw: {
            main: input.main,
            fuel: input.fuel,
            apk: input.apk,
            defects: input.defects,
            recalls: input.recalls,
            body: input.body,
            typeApprovals: input.typeApprovals
        }
    };
    profile.enriched = (0, heuristics_1.enrichVehicleData)(profile);
    return profile;
}
