import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { VehicleProfile } from "@/lib/rdw/types";
import type { VehicleSignalReport } from "@/lib/vehicle/signals";
import type { Locale } from "@/lib/i18n/messages";

type VehicleLookupQuery = {
  plate: string;
  lang: Locale;
  mileage?: number | null;
};

// The single-plate route returns the localized VehicleProfile plus a free,
// server-computed signals report. The AI branch additionally returns
// aiInsights/aiValuation (consumed via useAiReport, typed loosely here).
export type VehicleLookupResponse = VehicleProfile & {
  signals?: VehicleSignalReport;
  aiInsights?: unknown;
  aiValuation?: unknown;
};

export const vehicleApi = createApi({
  reducerPath: "vehicleApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  endpoints: (builder) => ({
    getVehicleByPlate: builder.query<VehicleLookupResponse, VehicleLookupQuery>({
      query: ({ plate, lang, mileage }) =>
        `/vehicle/${encodeURIComponent(plate)}?lang=${encodeURIComponent(lang)}${
          typeof mileage === "number" && Number.isFinite(mileage) ? `&mileage=${encodeURIComponent(String(Math.round(mileage)))}` : ""
        }`
    })
  })
});

export const { useGetVehicleByPlateQuery } = vehicleApi;

