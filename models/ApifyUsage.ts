import { model, models, Schema, type Model } from "mongoose";

/**
 * Monthly counter of paid Apify actor runs (cache misses), so we can cap spend.
 * _id = "YYYY-MM". Combined with the per-model cache, this bounds cost.
 */
export type ApifyUsageDoc = {
  _id: string;
  month: string;
  runs: number;
};

const schema = new Schema<ApifyUsageDoc>(
  {
    _id: { type: String, required: true },
    month: { type: String, required: true },
    runs: { type: Number, default: 0 }
  },
  { versionKey: false }
);

export const ApifyUsageModel: Model<ApifyUsageDoc> =
  (models.ApifyUsage as Model<ApifyUsageDoc> | undefined) ||
  model<ApifyUsageDoc>("ApifyUsage", schema);
