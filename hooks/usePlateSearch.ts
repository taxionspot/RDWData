"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDisplayPlate, normalizePlate, validateDutchPlate } from "@/lib/rdw/normalize";
import { useI18n } from "@/lib/i18n/context";
import { trackPlateSearch } from "@/lib/analytics/gtm";

export function usePlateSearch() {
  const router = useRouter();
  const { locale } = useI18n();
  const [plateInput, setPlateInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const normalized = useMemo(() => normalizePlate(plateInput).slice(0, 7), [plateInput]);
  const preview = useMemo(() => formatDisplayPlate(normalized), [normalized]);
  const isValid = useMemo(() => validateDutchPlate(normalized), [normalized]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const plate = normalizePlate(plateInput);

    if (!plate) {
      setError(locale === "nl" ? "Voer een Nederlands kenteken in." : "Enter a Dutch plate.");
      return;
    }

    if (!validateDutchPlate(plate)) {
      setError(
        locale === "nl"
          ? "Ongeldig Nederlands kentekenformaat. Voorbeeld: 16-RSL-9"
          : "Invalid Dutch plate format. Example: 16-RSL-9"
      );
      return;
    }

    setError(null);
    trackPlateSearch(plate);
    router.push(`/search/${encodeURIComponent(plate)}`);
  };

  return {
    plateInput,
    setPlateInput,
    error,
    setError,
    normalized,
    preview,
    isValid,
    onSubmit
  };
}

