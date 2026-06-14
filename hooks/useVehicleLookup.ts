"use client";

import { useEffect, useMemo } from "react";
import { normalizePlate, validateDutchPlate } from "@/lib/rdw/normalize";
import { useGetVehicleByPlateQuery } from "@/lib/store/services/vehicleApi";
import { useI18n } from "@/lib/i18n/context";
import { onPlateAccessChanged } from "@/lib/payments/access";

export function useVehicleLookup(rawPlate: string, mileage?: number | null) {
  const { locale } = useI18n();
  const normalized = useMemo(() => normalizePlate(rawPlate), [rawPlate]);
  const isValid = useMemo(() => validateDutchPlate(normalized), [normalized]);

  const query = useGetVehicleByPlateQuery({ plate: normalized, lang: locale, mileage }, {
    skip: !isValid
  });

  // The market value is stripped from the response until the plate is paid for.
  // After an unlock the cached pre-payment response is stale, so refetch once
  // access is granted (mirrors useAiReport).
  const { refetch } = query;
  useEffect(() => {
    if (!isValid || !normalized) return;
    const unsubscribe = onPlateAccessChanged(normalized, (paid) => {
      if (paid) void refetch();
    });
    return unsubscribe;
  }, [normalized, isValid, refetch]);

  return {
    normalized,
    isValid,
    ...query
  };
}

