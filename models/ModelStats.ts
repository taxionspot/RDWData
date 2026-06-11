import { model, models, Schema, type Model } from "mongoose";

export type ModelStatsTopDefect = {
  code: string;
  description: string;
  count: number; // number of UNIQUE sampled plates with this defect
  pctOfVehicles: number; // count / sampleSize * 100
};

export type ModelStatsDoc = {
  _id: string; // `${merk}|${handelsbenaming}|${bouwjaar}`
  sampleSize: number;
  vehiclesWithDefects: number;
  totalDefects: number;
  topDefects: ModelStatsTopDefect[];
  computedAt: Date;
  expiresAt: Date;
};

const topDefectSchema = new Schema(
  {
    code: { type: String, required: true },
    description: { type: String, required: true },
    count: { type: Number, required: true },
    pctOfVehicles: { type: Number, required: true }
  },
  { _id: false }
);

const modelStatsSchema = new Schema(
  {
    _id: { type: String, required: true }, // `${merk}|${handelsbenaming}|${bouwjaar}`
    sampleSize: { type: Number, required: true },
    vehiclesWithDefects: { type: Number, required: true },
    totalDefects: { type: Number, required: true },
    topDefects: { type: [topDefectSchema], default: [] },
    computedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true }
  },
  {
    versionKey: false
  }
);

export const ModelStatsModel: Model<ModelStatsDoc> =
  (models.ModelStats as Model<ModelStatsDoc> | undefined) ||
  model<ModelStatsDoc>("ModelStats", modelStatsSchema);
