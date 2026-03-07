import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

export async function connectDatabase(): Promise<void> {
  if (!env.mongoUri) {
    throw new Error("MONGO_URI is not configured");
  }

  try {
    await mongoose.connect(env.mongoUri, );
    logger.info("Connected to MongoDB");
  } catch (err) {
    logger.error("Error connecting to MongoDB", { err });
    throw err;
  }
}

