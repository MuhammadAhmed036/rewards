import { logger } from "./logger";

export const sentry = {
  captureException: (error: unknown, context?: Record<string, unknown>) => {
    logger.error({ err: error, sentryContext: context }, "Sentry captureException");
  },
  captureMessage: (message: string, level: "info" | "warning" | "error" = "info", context?: Record<string, unknown>) => {
    logger[level === "warning" ? "warn" : level]({ sentryContext: context }, `[SENTRY] ${message}`);
  },
};
