import { Request, Response, NextFunction } from "express";
import fs from "fs";
import { z } from "zod";
import { submitPaymentWithImage } from "../services/payment.service";

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
    const result = await submitPaymentWithImage({
      telegramId: parsed.telegramId,
      owners,
      imagePath: file.path
    });

    res.status(200).json(result);
  } catch (err) {
    console.log("error from backend", err);
    if (file && fs.existsSync(file.path)) {
      fs.unlink(file.path, () => undefined);
    }
    next(err);
  }
}

