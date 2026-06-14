import { Schema, model, models, type Model } from "mongoose";

/**
 * Per-IP fixed-window rate limit bucket for POST /api/vehicle/[plate]/prewarm-ai.
 *
 * _id = "<ip>|<YYYY-MM-DD-HH>" — one document per IP per clock-hour.
 * A TTL index on createdAt (~2 h) causes Mongo to drop old buckets automatically
 * so the collection stays small.
 */
export type PrewarmRateLimitDoc = {
  _id: string;
  count: number;
  createdAt: Date;
};

const schema = new Schema<PrewarmRateLimitDoc>(
  {
    _id: { type: String, required: true },
    count: { type: Number, default: 0 },
    createdAt: { type: Date, default: () => new Date() }
  },
  { versionKey: false }
);

// Auto-expire buckets after 2 hours so storage stays bounded.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 });

export const PrewarmRateLimitModel: Model<PrewarmRateLimitDoc> =
  (models.PrewarmRateLimit as Model<PrewarmRateLimitDoc> | undefined) ??
  model<PrewarmRateLimitDoc>("PrewarmRateLimit", schema);
