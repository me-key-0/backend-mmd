import mongoose, { Document, Schema, Types } from "mongoose";

export interface ITicket extends Document {
  userId: Types.ObjectId;
  paymentId: Types.ObjectId;
  reference: string;
  ownerName: string;
  ownerPhone: string;
  tokenHash: string;
  redeemedAt?: Date;
  redeemedBy?: string;
  createdAt: Date;
}

const ticketSchema = new Schema<ITicket>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: true, index: true },
    reference: { type: String, required: true, index: true },
    ownerName: { type: String, required: true },
    ownerPhone: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    redeemedAt: { type: Date, default: undefined },
    redeemedBy: { type: String, default: undefined }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ticketSchema.index({ reference: 1, createdAt: -1 });
ticketSchema.index({ redeemedAt: 1 });

export const Ticket = mongoose.model<ITicket>("Ticket", ticketSchema);

