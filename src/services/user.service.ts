import { z } from "zod";
import { User, IUser } from "../models/User";

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

export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export async function registerUser(input: RegisterUserInput): Promise<IUser> {
  const parsed = registerUserSchema.parse(input);

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

  return user;
}

