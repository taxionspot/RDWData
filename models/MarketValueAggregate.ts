import { model, models, Schema, type Model } from "mongoose";

/**
 * Derived market-value snapshot, logged once per plate+locale+day on every
 * report lookup. These are OUR OWN formula outputs (computeMarketValueV3), not
 * copied third-party listings, so the aggregate is a lawfully built,
 * proprietary NL price time-series we can later turn into a market-index data
 * product (avg/median price per make-model-year, depreciation curves). The _id
 * is a day bucket, so repeated views of the same plate on the same day collapse
 * into a single row instead of flooding the collection.
 */
export type MarketValueAggregateDoc = {
  _id: string;
  plate: string;
  make: string | null;
  model: string | null;
  year: number | null;
  fuel: string | null;
  bodyType: string | null;
  mileage: number | null;
  estimatedValueNow: number | null;
  marketValueConfidence: string | null;
  locale: "nl" | "en";
  day: string;
  createdAt: Date;
  updatedAt: Date;
};

const marketValueAggregateSchema = new Schema<MarketValueAggregateDoc>(
  {
    _id: { type: String, required: true },
    plate: { type: String, required: true, index: true },
    make: { type: String, default: null, index: true },
    model: { type: String, default: null },
    year: { type: Number, default: null },
    fuel: { type: String, default: null },
    bodyType: { type: String, default: null },
    mileage: { type: Number, default: null },
    estimatedValueNow: { type: Number, default: null },
    marketValueConfidence: { type: String, default: null },
    locale: { type: String, enum: ["nl", "en"], required: true, default: "nl" },
    day: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

export const MarketValueAggregateModel: Model<MarketValueAggregateDoc> =
  (models.MarketValueAggregate as Model<MarketValueAggregateDoc> | undefined) ||
  model<MarketValueAggregateDoc>("MarketValueAggregate", marketValueAggregateSchema);
