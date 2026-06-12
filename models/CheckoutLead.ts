import { model, models, Schema, type Model } from "mongoose";

export type CheckoutLeadDoc = {
  email: string;
  plate: string;
  locale: "nl" | "en";
  status: "pending" | "converted";
  followUpSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const checkoutLeadSchema = new Schema<CheckoutLeadDoc>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    plate: { type: String, required: true, index: true },
    locale: { type: String, enum: ["nl", "en"], required: true, default: "nl" },
    status: { type: String, enum: ["pending", "converted"], required: true, default: "pending" },
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
