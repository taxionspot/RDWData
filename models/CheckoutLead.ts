import { model, models, Schema, type Model } from "mongoose";

export type CheckoutLeadDoc = {
  email: string;
  plate: string;
  locale: "nl" | "en";
  // pending = still in the follow-up sequence; converted = paid; completed = all
  // follow-up stages sent without a payment.
  status: "pending" | "converted" | "completed";
  // How many follow-up emails were sent (0..3). Drives the 1h/24h/72h cadence.
  followUpCount: number;
  lastFollowUpAt?: Date | null;
  // Legacy single-follow-up field, kept for backward compatibility.
  followUpSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const checkoutLeadSchema = new Schema<CheckoutLeadDoc>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    plate: { type: String, required: true, index: true },
    locale: { type: String, enum: ["nl", "en"], required: true, default: "nl" },
    status: { type: String, enum: ["pending", "converted", "completed"], required: true, default: "pending" },
    followUpCount: { type: Number, required: true, default: 0 },
    lastFollowUpAt: { type: Date, default: null },
    followUpSentAt: { type: Date, default: null }
  },
  {
    versionKey: false,
    timestamps: true
  }
);

checkoutLeadSchema.index({ email: 1, plate: 1 }, { unique: true });
checkoutLeadSchema.index({ status: 1, followUpSentAt: 1, updatedAt: 1 });

export const CheckoutLeadModel: Model<CheckoutLeadDoc> =
  (models.CheckoutLead as Model<CheckoutLeadDoc> | undefined) ||
  model<CheckoutLeadDoc>("CheckoutLead", checkoutLeadSchema);
