"use client";

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import { MapPin, Navigation, Loader2, AlertCircle, Wrench, RefreshCw } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type Garage = {
    erkenning_nummer?: string;
    erkenninghouder_naam?: string;
    erkenning_plaatsnaam?: string;
    erkenning_straat?: string;
    erkenning_huisnummer?: string;
    erkenning_postcode?: string;
    soort_erkenning_omschrijving?: string;
};

type GeoGarage = Garage & { lat: number; lng: number };

// ── Nominatim geocoding ────────────────────────────────────────────────────
async function geocode(garage: Garage): Promise<GeoGarage | null> {
    const q = [
        garage.erkenning_straat,
        garage.erkenning_huisnummer,
        garage.erkenning_postcode,
        garage.erkenning_plaatsnaam,
        "Netherlands"
    ].filter(Boolean).join(", ");

    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
            { headers: { "User-Agent": "Kentekenrapport/1.0" } }
        );
        const data = await res.json();
        if (data?.[0]) return { ...garage, lat: Number(data[0].lat), lng: Number(data[0].lon) };
    } catch { /* skip */ }
    return null;
}

type MapInnerProps = {
    garages: GeoGarage[];
    userPos: { lat: number; lng: number } | null;
    selected: GeoGarage | null;
    onSelect: (g: GeoGarage) => void;
};

// Lazy Leaflet Map — SSR disabled (Leaflet requires window)
const LeafletMap = dynamic<MapInnerProps>(
    () => import("./LeafletMapInner").then((m) => m.default),
    { ssr: false }
);


// ── Main MapPanel ──────────────────────────────────────────────────────────
export function MapPanel(): React.ReactElement {
    const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
    const [city, setCity] = useState<string>("");
    const [garages, setGarages] = useState<GeoGarage[]>([]);
    const [loading, setLoading] = useState(false);
    const [locating, setLocating] = useState(false);
    const [geoError, setGeoError] = useState<string | null>(null);
    const [selected, setSelected] = useState<GeoGarage | null>(null);

    // Fetch garages for a given city, then geocode them
    const fetchGarages = useCallback(async (cityName: string) => {
        if (!cityName.trim()) return;
        setLoading(true);
        setGarages([]);
        setSelected(null);
        try {
            const res = await fetch(
                `/api/garages?city=${encodeURIComponent(cityName)}&type=APK`
            );
            const json = await res.json() as { garages: Garage[] };
            // Geocode in batches of 5 with delay to respect Nominatim rate limits
            const results: GeoGarage[] = [];
            const batch = json.garages.slice(0, 20);
            for (let i = 0; i < batch.length; i++) {
                const g = await geocode(batch[i]);
                if (g) results.push(g);
                if (i < batch.length - 1) await new Promise((r) => setTimeout(r, 250));
            }
            setGarages(results);
        } finally {
            setLoading(false);
        }
    }, []);

    // Geolocate user then reverse-geocode to get city
    const locateMe = useCallback(() => {
        if (!navigator.geolocation) {
            setGeoError("Geolocation not supported by your browser.");
            return;
        }
        setLocating(true);
        setGeoError(null);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                setUserPos({ lat, lng });
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                        { headers: { "User-Agent": "Kentekenrapport/1.0" } }
                    );
                    const data = await res.json();
                    const c = data?.address?.city ?? data?.address?.town ?? data?.address?.village ?? "";
                    setCity(c);
                    if (c) fetchGarages(c);
                } catch { /* skip */ } finally {
                    setLocating(false);
                }
            },
            () => {
                setGeoError("Location access denied. Enter a city manually.");
                setLocating(false);
            },
            { timeout: 8000 }
        );
    }, [fetchGarages]);

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100">
                    <MapPin className="h-4 w-4 text-brand-600" />
                </span>
                <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-900">Nearby APK Garages</h3>
                    <p className="text-xs text-slate-400">RDW-certified workshops near you</p>
                </div>
                {garages.length > 0 && (
                    <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                        {garages.length} found
                    </span>
                )}
            </div>

            {/* Search row */}
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && fetchGarages(city)}
                        placeholder="Enter city (e.g. Amsterdam)"
                        className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none"
                    />
                </div>
                <button
                    onClick={() => fetchGarages(city)}
                    disabled={loading || !city.trim()}
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-40"
                >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Search
                </button>
                <button
                    onClick={locateMe}
                    disabled={locating}
                    title="Use my location"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                >
                    {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" /> : <Navigation className="h-3.5 w-3.5 text-brand-600" />}
                </button>
            </div>

            {geoError && (
                <div className="flex items-center gap-2 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {geoError}
                </div>
            )}

            {/* Map */}
            <div className="relative h-72 w-full bg-slate-100">
                {!loading && garages.length === 0 && !locating && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200">
                            <MapPin className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">Enter a city or use your location</p>
                        <button
                            onClick={locateMe}
                            className="mt-1 flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
                        >
                            <Navigation className="h-3 w-3" /> Use my location
                        </button>
                    </div>
                )}
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50">
                        <Loader2 className="h-7 w-7 animate-spin text-brand-500" />
                        <p className="text-sm text-slate-500">Locating nearby garages…</p>
                    </div>
                )}
                {garages.length > 0 && (
                    <LeafletMap
                        garages={garages}
                        userPos={userPos}
                        selected={selected}
                        onSelect={setSelected}
                    />
                )}
            </div>

            {/* Selected garage card */}
            {selected && (
                <div className="border-t border-slate-100 px-4 py-3">
                    <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 ring-1 ring-brand-100">
                            <Wrench className="h-3.5 w-3.5 text-brand-600" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-900">
                                {selected.erkenninghouder_naam ?? "Garage"}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                                {[selected.erkenning_straat, selected.erkenning_huisnummer].filter(Boolean).join(" ")}{" "}
                                · {selected.erkenning_postcode} {selected.erkenning_plaatsnaam}
                            </p>
                            {selected.soort_erkenning_omschrijving && (
                                <span className="mt-1.5 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    {selected.soort_erkenning_omschrijving}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* List preview */}
            {garages.length > 0 && !selected && (
                <div className="max-h-44 divide-y divide-slate-50 overflow-y-auto border-t border-slate-100">
                    {garages.slice(0, 8).map((g, i) => (
                        <button
                            key={i}
                            onClick={() => setSelected(g)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50"
                        >
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-400" />
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                                {g.erkenninghouder_naam ?? "—"}
                            </span>
                            <span className="shrink-0 text-xs text-slate-400">
                                {g.erkenning_plaatsnaam}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
