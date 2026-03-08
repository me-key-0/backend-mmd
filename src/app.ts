import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { publicRouter } from "./routes/publicRoutes";
import { adminRouter } from "./routes/adminRoutes";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.use(helmet());
// app.use(
//   cors({
//     origin: env.allowedOrigins,
//     credentials: true
//   })
// );
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", publicRouter);
app.use("/api/admin", adminRouter);

app.use(errorHandler);

export { app };
