import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  telegramId: string;
  fullName: string;
  username?: string;
  phoneNumber: string;
  bankAccountNumber?: string;
  ticketCount?: number;
  createdAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    telegramId: { type: String, required: true, index: true, unique: true },
    fullName: { type: String, required: true },
    username: { type: String },
    phoneNumber: { type: String, required: true },
    bankAccountNumber: { type: String },
    ticketCount: { type: Number, min: 1 }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

export const User = mongoose.model<IUser>("User", userSchema);

