import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { User } from "../models/User";
import { Payment } from "../models/Payment";
import { verifyPaymentWithLeul } from "../services/verification.service";
import { issueQrTicketsForPayment } from "../services/ticket.service";
import { env } from "../config/env";

const submitPaymentSchema = z.object({
  telegramId: z.string().min(1),
  owners: z.string().optional()
});

export async function submitPayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const file = req.file;

  try {
    const parsed = submitPaymentSchema.parse(req.body);

    let owners: { name: string; phone: string }[] = [];
    if (parsed.owners) {
      try {
        const raw = JSON.parse(parsed.owners) as any;
        if (Array.isArray(raw)) {
          owners = raw
            .filter(
              (o) =>
                o &&
                typeof o.name === "string" &&
                o.name.trim().length > 0 &&
                typeof o.phone === "string" &&
                o.phone.trim().length > 0
            )
            .map((o) => ({ name: String(o.name).trim(), phone: String(o.phone).trim() }));
        }
      } catch {
        owners = [];
      }
    }

    if (!file) {
      res.status(400).json({ error: "Image file is required" });
      return;
    }
    console.log("file", "submitted");

    const user = await User.findOne({ telegramId: parsed.telegramId });
    console.log("user b4", user);
    if (!user) {
      res.status(404).json({ error: "User not found, please register first" });
      return;
    }
    console.log("user", user);
    const imagePath = file.path;
    console.log("image path", imagePath);
    const verification = await verifyPaymentWithLeul(imagePath);
    console.log("verification", verification);

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
      console.log("recipent.env" + env.recipientName)
      const received = normalizeName(verification.receiver || "");
      console.log("recipent.received" + received)
      const matches =
        Boolean(received) &&
        (received === expected || received.includes(expected) || expected.includes(received) || received === env.recipientNumber);
      console.log("matches" + matches)
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
      res.status(200).json({
        verified: false,
        message:
          failureReasons.length > 0
            ? `Validation failed: ${failureReasons.join(" ")}`
            : "Payment could not be verified. Please retry or contact support @me_key_0.",
        reasons: failureReasons
      });
      return;
    }

    let issuedTickets: Awaited<ReturnType<typeof issueQrTicketsForPayment>> = [];
    try {
      issuedTickets = await issueQrTicketsForPayment({
        user,
        payment,
        owners
      });

      payment.ticketCount = issuedTickets.length;
      payment.ticketIds = issuedTickets.map((t) => t.qrPayload);
      payment.ticketId = payment.ticketIds[0];
      await payment.save();
    } catch (e) {
      payment.verified = false;
      payment.status = "failed";
      await payment.save();

      res.status(200).json({
        verified: false,
        message: "Ticket issuance failed. Please contact support.",
        reasons: ["Ticket issuance failed."]
      });
      return;
    }

    res.status(200).json({
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
    });
  } catch (err) {
    console.log("error from backend", err);
    if (file && fs.existsSync(file.path)) {
      fs.unlink(file.path, () => undefined);
    }
    next(err);
  }
}

