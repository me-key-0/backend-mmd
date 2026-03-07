import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error("Unhandled error", { err });

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "ValidationError",
      details: err.flatten()
    });
    return;
  }

  const status =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as any).status === "number"
      ? (err as any).status
      : 500;

  const message =
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as any).message === "string"
      ? (err as any).message
      : "Internal Server Error";

  res.status(status).json({ error: message });
}

