import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "password",
      "token",
      "secret",
      "code",
      "codeHash",
      "email",
    ],
    remove: true,
  },
});

export function createRequestLogger(requestId: string, meta: Record<string, unknown> = {}) {
  return logger.child({ requestId, ...meta });
}

