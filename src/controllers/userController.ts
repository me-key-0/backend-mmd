import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { User } from "../models/User";

const registerUserSchema = z.object({
  telegramId: z.string().min(1),
  fullName: z.string().min(1),
  username: z.string().optional(),
  phoneNumber: z
    .string()
    .transform((val) => val.replace(/\D/g, ""))
    .refine((val) => /^09\d{8}$/.test(val), {
      message: "Phone number must be 10 digits and start with 09"
    }),
  ticketCount: z.coerce.number().int().min(1).max(50).optional()
});

export async function registerUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = registerUserSchema.parse(req.body);

    const update: Record<string, unknown> = {
      telegramId: parsed.telegramId,
      fullName: parsed.fullName,
      username: parsed.username,
      phoneNumber: parsed.phoneNumber
    };
    if (parsed.ticketCount) update.ticketCount = parsed.ticketCount;

    const user = await User.findOneAndUpdate(
      { telegramId: parsed.telegramId },
      {
        ...update
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ userId: user._id });
  } catch (err) {
    next(err);
  }
}

