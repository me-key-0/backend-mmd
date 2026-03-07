import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || "5000", 10),
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/test",
  jwtSecret: process.env.JWT_SECRET || "change-me",
  leulApiKey: process.env.LEUL_API_KEY || "",
  cbeSuffix: process.env.CBE_SUFFIX || "73819558",
  recipientName: process.env.RECIPIENT_NAME || "MIKIAS WONDAFRASH BELAY",
  recipientNumber: process.env.RECIPIENT_NUMBER || "0003",
  ticketPrice: parseFloat(process.env.TICKET_PRICE || "1"),
  paymentMaxAgeMinutes: parseInt(process.env.PAYMENT_MAX_AGE_MINUTES || "1440", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  allowedOrigins: (
    process.env.CORS_ORIGINS || "https://78d4-196-189-247-133.ngrok-free.app"
  )
    .split(",")
    .map((o) => o.trim())
};

if (!env.mongoUri) {
  // eslint-disable-next-line no-console
  console.warn("MONGO_URI is not set. Remember to configure it in production.");
}

