import { model, models, Schema, type Model } from "mongoose";
import type { ClaudeVehicleReportResult } from "@/lib/api/claude";

export type AiReportCacheDoc = {
  _id: string; // `${plate}:${locale}:${mileage ?? "na"}:${version}`
  plate: string;
  locale: "nl" | "en";
  report: ClaudeVehicleReportResult;
  cachedAt: Date;
  expiresAt: Date;
};

const aiReportCacheSchema = new Schema<AiReportCacheDoc>(
  {
    _id: { type: String, required: true },
    plate: { type: String, required: true, index: true },
    locale: { type: String, enum: ["nl", "en"], required: true },
    report: { type: Schema.Types.Mixed, required: true },
    cachedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true }
  },
  {
    versionKey: false
  }
);

// Let MongoDB auto-purge entries once they expire.
aiReportCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiReportCacheModel: Model<AiReportCacheDoc> =
  (models.AiReportCache as Model<AiReportCacheDoc> | undefined) ||
  model<AiReportCacheDoc>("AiReportCache", aiReportCacheSchema);
