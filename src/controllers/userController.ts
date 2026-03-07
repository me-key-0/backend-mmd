import { Request, Response, NextFunction } from "express";
import { registerUser as registerUserService } from "../services/user.service";

export async function registerUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await registerUserService(req.body);

    res.status(200).json({ userId: user._id });
  } catch (err) {
    next(err);
  }
}

