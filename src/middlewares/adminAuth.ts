import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

interface AdminJwtPayload {
  sub: string;
  role: "admin";
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AdminJwtPayload;
    if (decoded.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    (req as any).admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

