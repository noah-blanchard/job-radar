import { pino, type Logger } from "pino";

export type { Logger };

/** Structured JSON logger. One `service` field per process (web, worker, migrate). */
export function createLogger(service: string, level: string = process.env.LOG_LEVEL ?? "info"): Logger {
  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: ["*.password", "*.token", "*.apiKey", "*.authorization", "headers.authorization"],
      censor: "[redacted]",
    },
  });
}
