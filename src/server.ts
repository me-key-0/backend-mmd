import { app } from "./app";
import { env } from "./config/env";
import { connectDatabase } from "./config/database";
import { logger } from "./utils/logger";

async function start() {
  try {
    await connectDatabase();

    app.listen(env.port, () => {
      logger.info(`Server listening on port ${env.port}`);
    });
  } catch (err) {
    logger.error("Failed to start server", { err });
    process.exit(1);
  }
}

start();

