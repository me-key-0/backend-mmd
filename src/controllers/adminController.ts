import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { User } from "../models/User";
import { Payment } from "../models/Payment";

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function adminLogin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = adminLoginSchema.parse(req.body);

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      res.status(500).json({ error: "Admin credentials not configured" });
      return;
    }

    if (email !== adminEmail || password !== adminPassword) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { sub: email, role: "admin" as const },
      env.jwtSecret,
      { expiresIn: "12h" }
    );

    res.json({ token });
  } catch (err) {
    next(err);
  }
}

export async function getAdminStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [totalUsers, totalPayments, verifiedPayments, failedPayments, pendingPayments, revenueAgg] =
      await Promise.all([
        User.countDocuments(),
        Payment.countDocuments(),
        Payment.countDocuments({ status: "verified" }),
        Payment.countDocuments({ status: "failed" }),
        Payment.countDocuments({ status: "pending" }),
        Payment.aggregate([
          {
            $match: { status: "verified" }
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble: {
                    $replaceAll: {
                      input: "$amount",
                      find: ",",
                      replacement: ""
                    }
                  }
                }
              }
            }
          }
        ])
      ]);

    const totalRevenue =
      revenueAgg.length > 0 && typeof revenueAgg[0].total === "number"
        ? revenueAgg[0].total
        : 0;

    res.json({
      totalUsers,
      totalPayments,
      verifiedPayments,
      failedPayments,
      pendingPayments,
      totalRevenue
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdminPayments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Payment.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "fullName telegramId username"),
      Payment.countDocuments()
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
}

