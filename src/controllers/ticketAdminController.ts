import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { z } from "zod";
import { Ticket } from "../models/Ticket";

const tokenSchema = z.object({
  qrPayload: z.string().min(1)
});

function extractToken(qrPayload: string): string {
  const trimmed = qrPayload.trim();
  const prefix = "mmd-ticket:";
  if (trimmed.toLowerCase().startsWith(prefix)) {
    return trimmed.slice(prefix.length);
  }
  return trimmed;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export async function verifyTicket(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = tokenSchema.parse(req.body);
    const token = extractToken(parsed.qrPayload);
    const tokenHash = hashToken(token);

    const ticket = await Ticket.findOne({ tokenHash }).lean();
    if (!ticket) {
      res.status(404).json({ valid: false, reason: "Ticket not found" });
      return;
    }

    res.json({
      valid: true,
      redeemed: Boolean(ticket.redeemedAt),
      redeemedAt: ticket.redeemedAt ?? null,
      ownerName: ticket.ownerName,
      ownerPhone: ticket.ownerPhone,
      reference: ticket.reference
    });
  } catch (err) {
    next(err);
  }
}

export async function redeemTicket(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = tokenSchema.parse(req.body);
    const token = extractToken(parsed.qrPayload);
    const tokenHash = hashToken(token);
    const adminSub = (req as any).admin?.sub as string | undefined;

    const updated = await Ticket.findOneAndUpdate(
      { tokenHash, redeemedAt: { $exists: false } },
      { $set: { redeemedAt: new Date(), redeemedBy: adminSub ?? "admin" } },
      { new: true }
    ).lean();

    if (!updated) {
      const ticket = await Ticket.findOne({ tokenHash }).lean();
      if (!ticket) {
        res.status(404).json({ ok: false, reason: "Ticket not found" });
        return;
      }
      res.status(409).json({
        ok: false,
        reason: "Ticket already redeemed",
        redeemedAt: ticket.redeemedAt ?? null
      });
      return;
    }

    res.json({
      ok: true,
      ownerName: updated.ownerName,
      ownerPhone: updated.ownerPhone,
      reference: updated.reference,
      redeemedAt: updated.redeemedAt ?? null
    });
  } catch (err) {
    next(err);
  }
}

