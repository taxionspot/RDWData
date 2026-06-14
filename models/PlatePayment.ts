import { model, models, Schema, type Model } from "mongoose";

export type PlatePaymentDoc = {
  plate: string;
  orderId: string;
  captureId: string;
  email?: string;
  amount: string;
  currency: string;
  status: "COMPLETED" | "PENDING" | "FAILED";
  provider: "paypal";
  createdAt: Date;
  /** Whether the thank-you email was delivered successfully. Absent = not attempted. */
  emailDelivered?: boolean;
  /** Failure reason from the email transport, e.g. "EMAIL_SEND_FAILED:..." */
  emailReason?: string;
};

const platePaymentSchema = new Schema<PlatePaymentDoc>(
  {
    plate: { type: String, required: true, index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    captureId: { type: String, required: true },
    email: { type: String, required: false, lowercase: true, trim: true },
    amount: { type: String, required: true },
    currency: { type: String, required: true, default: "EUR" },
    status: { type: String, enum: ["COMPLETED", "PENDING", "FAILED"], required: true },
    provider: { type: String, enum: ["paypal"], required: true, default: "paypal" },
    createdAt: { type: Date, default: Date.now, required: true },
    emailDelivered: { type: Boolean, required: false },
    emailReason: { type: String, required: false }
  },
  {
    versionKey: false
  }
);

export const PlatePaymentModel: Model<PlatePaymentDoc> =
  (models.PlatePayment as Model<PlatePaymentDoc> | undefined) ||
  model<PlatePaymentDoc>("PlatePayment", platePaymentSchema);
