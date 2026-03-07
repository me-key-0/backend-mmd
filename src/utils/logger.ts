import winston from "winston";

const { combine, timestamp, json, colorize, printf } = winston.format;

const consoleFormat = combine(
  colorize(),
  timestamp(),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `[${ts}] ${level}: ${message}${rest}`;
  })
);

export const logger = winston.createLogger({
  level: "info",
  format: combine(timestamp(), json()),
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

