import { model, models, Schema, type Model } from "mongoose";
import type { VehicleReport } from "@/lib/agents/types";

export type VehicleReportCacheDoc = {
  _id: string; // `${plate}:${locale}:${mileage ?? "na"}:${version}`
  plate: string;
  locale: "nl" | "en";
  report: VehicleReport;
  cachedAt: Date;
  expiresAt: Date;
};

const vehicleReportCacheSchema = new Schema<VehicleReportCacheDoc>(
  {
    _id: { type: String, required: true },
    plate: { type: String, required: true, index: true },
    locale: { type: String, enum: ["nl", "en"], required: true },
    report: { type: Schema.Types.Mixed, required: true },
    cachedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true }
  },
  { versionKey: false }
);

// Let MongoDB auto-purge entries once they expire.
vehicleReportCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VehicleReportCacheModel: Model<VehicleReportCacheDoc> =
  (models.VehicleReportCache as Model<VehicleReportCacheDoc> | undefined) ||
  model<VehicleReportCacheDoc>("VehicleReportCache", vehicleReportCacheSchema);
