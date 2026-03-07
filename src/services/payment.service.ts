import path from "path";
import { User } from "../models/User";
import { Payment } from "../models/Payment";
import { verifyPaymentWithLeul } from "./verification.service";
import { issueQrTicketsForPayment } from "./ticket.service";
import { env } from "../config/env";

export type PaymentOwner = { name: string; phone: string };

export type SubmitPaymentResult = {
  verified: boolean;
  ticketCount?: number;
  tickets?: { ownerName: string; ownerPhone: string; qrPayload: string }[];
  message: string;
  reasons?: string[];
  reference?: string;
  amount?: string;
};

export async function submitPaymentWithImage(args: {
  telegramId: string;
  owners: PaymentOwner[];
  imagePath: string;
}): Promise<SubmitPaymentResult> {
  const { telegramId, owners, imagePath } = args;

  const user = await User.findOne({ telegramId });
  if (!user) {
    return {
      verified: false,
      message: "User not found, please register first",
      reasons: ["User not found"]
    };
  }

  const verification = await verifyPaymentWithLeul(imagePath);

  const failureReasons: string[] = [];

  const existingVerified = await Payment.findOne({
    reference: verification.reference,
    status: "verified"
  })
    .select({ _id: 1 })
    .lean();
  if (existingVerified) {
    failureReasons.push("This reference number has already been used.");
  }

  const now = Date.now();
  const paymentTime = verification.date?.getTime?.() ? verification.date.getTime() : now;
  const maxAgeMs = Math.max(0, env.paymentMaxAgeMinutes) * 60_000;
  const futureSkewMs = 10 * 60_000_000;
  if (maxAgeMs > 0 && now - paymentTime > maxAgeMs) {
    failureReasons.push("Payment date is too old.");
  }
  if (paymentTime - now > futureSkewMs) {
    failureReasons.push("Payment date appears to be in the future.");
  }

  const normalizeName = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (env.recipientName) {
    const expected = normalizeName(env.recipientName);
    const received = normalizeName(verification.receiver || "");
    const matches =
      Boolean(received) &&
      (received === expected ||
        received.includes(expected) ||
        expected.includes(received) ||
        received === env.recipientNumber);
    if (!matches) {
      failureReasons.push("Payment was not sent to the correct recipient.");
    }
  }

  const requestedTickets = Math.max(1, Number(user.ticketCount || 1));
  if (owners.length !== requestedTickets) {
    failureReasons.push("Ticket owners information is missing or incomplete.");
  }

  const ticketPrice = Number(env.ticketPrice || 0);
  const amountNum = Number(String(verification.amount || "").replace(/,/g, "").trim());
  if (!ticketPrice || ticketPrice <= 0) {
    failureReasons.push("Ticket price is not configured.");
  } else if (!Number.isFinite(amountNum) || amountNum <= 0) {
    failureReasons.push("Could not read paid amount from receipt.");
  } else {
    const expectedAmount = requestedTickets * ticketPrice;
    const isExact = Math.abs(amountNum - expectedAmount) < 0.0001;
    if (!isExact) {
      const paidTickets = amountNum / ticketPrice;
      const wholePaidTickets =
        Number.isFinite(paidTickets) && Math.abs(paidTickets - Math.round(paidTickets)) < 0.0001
          ? Math.round(paidTickets)
          : null;
      if (wholePaidTickets && wholePaidTickets > 0) {
        failureReasons.push(
          `Paid amount does not match ${requestedTickets} ticket(s). You paid for ${wholePaidTickets} ticket(s).`
        );
      } else {
        failureReasons.push(
          `Paid amount does not match ${requestedTickets} ticket(s) at the configured price.`
        );
      }
    }
  }

  const isTelebirr = verification.verificationType === "telebirr";
  const isFullyValid =
    (isTelebirr && failureReasons.length === 0) ||
    (!isTelebirr && verification.verified && failureReasons.length === 0);

  const payment = new Payment({
    userId: user._id,
    imageUrl: path.relative(process.cwd(), imagePath),
    verified: isFullyValid,
    verificationType: verification.verificationType,
    reference: verification.reference,
    amount: verification.amount,
    payer: verification.payer,
    date: verification.date,
    rawDetails: {
      ...verification.rawDetails,
      owners
    },
    status: isFullyValid ? "verified" : "failed"
  });

  await payment.save();

  if (!isFullyValid) {
    return {
      verified: false,
      message:
        failureReasons.length > 0
          ? `Validation failed: ${failureReasons.join(" ")}`
          : "Payment could not be verified. Please retry or contact support @me_key_0.",
      reasons: failureReasons,
      reference: verification.reference,
      amount: verification.amount
    };
  }

  try {
    const issuedTickets = await issueQrTicketsForPayment({
      user,
      payment,
      owners
    });

    payment.ticketCount = issuedTickets.length;
    payment.ticketIds = issuedTickets.map((t) => t.qrPayload);
    payment.ticketId = payment.ticketIds[0];
    await payment.save();

    return {
      verified: true,
      ticketCount: issuedTickets.length,
      tickets: issuedTickets.map((t) => ({
        ownerName: t.ownerName,
        ownerPhone: t.ownerPhone,
        qrPayload: t.qrPayload
      })),
      message: "Payment verified successfully. Your QR ticket(s) are issued.",
      reference: verification.reference,
      amount: verification.amount
    };
  } catch {
    payment.verified = false;
    payment.status = "failed";
    await payment.save();

    return {
      verified: false,
      message: "Ticket issuance failed. Please contact support.",
      reasons: ["Ticket issuance failed."],
      reference: verification.reference,
      amount: verification.amount
    };
  }
}

