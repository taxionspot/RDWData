import { model, models, Schema, type Model } from "mongoose";
import type { ComparableCar } from "@/lib/listings/apify";

/**
 * Caches the Gaspedaal listing pool per brand+model so we hit the paid Apify
 * actor at most once per model per TTL window (cost control). Ranking by
 * similarity to a specific plate happens per request, on the cached pool.
 */
export type ComparableListingsCacheDoc = {
  _id: string; // `${brand}|${model}` lowercased
  cars: ComparableCar[];
  fetchedAt: Date;
  expiresAt: Date;
};

const schema = new Schema<ComparableListingsCacheDoc>(
  {
    _id: { type: String, required: true },
    cars: { type: Schema.Types.Mixed, default: [] },
    fetchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
  },
  { versionKey: false }
);

export const ComparableListingsCacheModel: Model<ComparableListingsCacheDoc> =
  (models.ComparableListingsCache as Model<ComparableListingsCacheDoc> | undefined) ||
  model<ComparableListingsCacheDoc>("ComparableListingsCache", schema);
