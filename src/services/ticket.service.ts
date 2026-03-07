import crypto from "crypto";
import { IPayment } from "../models/Payment";
import { Ticket } from "../models/Ticket";
import { IUser } from "../models/User";

export function generateTicketId(): string {
  const randomPart = crypto.randomInt(0, 100000).toString().padStart(5, "0");
  return `MMD-2019-${randomPart}`;
}

export function attachTicketToPayment(payment: IPayment): void {
  if (!payment.ticketId) {
    payment.ticketId = generateTicketId();
  }
}

export function attachTicketsToPayment(payment: IPayment, count: number): void {
  const safeCount = Math.max(1, Math.floor(count));
  if (!payment.ticketIds || payment.ticketIds.length === 0) {
    payment.ticketIds = Array.from({ length: safeCount }, () => generateTicketId());
  }
  payment.ticketCount = payment.ticketIds.length;
  if (!payment.ticketId) {
    payment.ticketId = payment.ticketIds[0];
  }
}

export type IssuedTicket = {
  ownerName: string;
  ownerPhone: string;
  qrToken: string;
  qrPayload: string;
};

function generateQrToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export async function issueQrTicketsForPayment(args: {
  user: IUser;
  payment: IPayment;
  owners: { name: string; phone: string }[];
}): Promise<IssuedTicket[]> {
  const issued: IssuedTicket[] = [];

  for (const owner of args.owners) {
    const qrToken = generateQrToken();
    const tokenHash = hashToken(qrToken);

    await Ticket.create({
      userId: args.user._id,
      paymentId: args.payment._id,
      reference: args.payment.reference,
      ownerName: owner.name,
      ownerPhone: owner.phone,
      tokenHash
    });

    issued.push({
      ownerName: owner.name,
      ownerPhone: owner.phone,
      qrToken,
      qrPayload: `mmd-ticket:${qrToken}`
    });
  }

  return issued;
}

