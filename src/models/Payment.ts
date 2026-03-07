import mongoose, { Document, Schema, Types } from "mongoose";

export type VerificationType = "cbe" | "telebirr";

export type PaymentStatus = "pending" | "verified" | "failed";

export interface IPayment extends Document {
  userId: Types.ObjectId;
  imageUrl: string;
  verified: boolean;
  verificationType: VerificationType;
  reference: string;
  amount: string;
  payer: string;
  date: Date;
  rawDetails: Record<string, unknown>;
  status: PaymentStatus;
  ticketId?: string;
  ticketIds?: string[];
  ticketCount?: number;
  createdAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    imageUrl: { type: String, required: true },
    verified: { type: Boolean, default: false },
    verificationType: {
      type: String,
      enum: ["cbe", "telebirr"],
      required: true
    },
    reference: { type: String, required: true, index: true },
    amount: {
      type: String,
      required: function requiredAmount(this: IPayment) {
        return Boolean(this.verified);
      }
    },
    payer: {
      type: String,
      required: function requiredPayer(this: IPayment) {
        return Boolean(this.verified);
      }
    },
    date: { type: Date, required: true },
    rawDetails: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "verified", "failed"],
      default: "pending",
      index: true
    },
    ticketId: { type: String },
    ticketIds: { type: [String], default: undefined },
    ticketCount: { type: Number, min: 1, default: undefined }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

paymentSchema.index({ createdAt: -1 });

export const Payment = mongoose.model<IPayment>("Payment", paymentSchema);

