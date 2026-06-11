import { Schema, model, models, type Model } from "mongoose";

export type AiReportCacheDoc = {
  _id: string; // `${plate}|${locale}|${mileageBucket}`
  insights: unknown;
  valuation: unknown;
  createdAt: Date;
  expiresAt: Date;
};

const AiReportCacheSchema = new Schema<AiReportCacheDoc>(
  {
    _id: { type: String, required: true },
    insights: { type: Schema.Types.Mixed, default: null },
    valuation: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true }
  },
  { collection: "ai_report_cache", versionKey: false }
);

AiReportCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiReportCacheModel: Model<AiReportCacheDoc> =
  (models.AiReportCache as Model<AiReportCacheDoc>) ?? model<AiReportCacheDoc>("AiReportCache", AiReportCacheSchema);
