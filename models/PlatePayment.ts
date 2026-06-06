import { model, models, Schema, type Model } from "mongoose";

export type PlatePaymentDoc = {
  plate: string;
  orderId: string;
  captureId: string;
  email?: string;
  userId?: string;
  amount: string;
  currency: string;
  status: "COMPLETED" | "PENDING" | "FAILED";
  provider: "paypal" | "demo";
  createdAt: Date;
};

const platePaymentSchema = new Schema<PlatePaymentDoc>(
  {
    plate: { type: String, required: true, index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    captureId: { type: String, required: true },
    email: { type: String, required: false, lowercase: true, trim: true },
    // Optional buyer binding: set when a logged-in user completes the purchase.
    userId: { type: String, required: false, index: true },
    amount: { type: String, required: true },
    currency: { type: String, required: true, default: "EUR" },
    status: { type: String, enum: ["COMPLETED", "PENDING", "FAILED"], required: true },
    // "demo" records are only ever honored while the server-side demo bypass is on.
    provider: { type: String, enum: ["paypal", "demo"], required: true, default: "paypal" },
    createdAt: { type: Date, default: Date.now, required: true }
  },
  {
    versionKey: false
  }
);

export const PlatePaymentModel: Model<PlatePaymentDoc> =
  (models.PlatePayment as Model<PlatePaymentDoc> | undefined) ||
  model<PlatePaymentDoc>("PlatePayment", platePaymentSchema);
