import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  QR_SIGNING_SECRET: z.string().min(32, "QR_SIGNING_SECRET must be at least 32 characters"),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters"),
  GOOGLE_CLIENT_ID: z.string().optional().default("mock-google-client-id"),
  GOOGLE_CLIENT_SECRET: z.string().optional().default("mock-google-client-secret"),
  RESEND_API_KEY: z.string().optional().default("re_mock_api_key"),
  EMAIL_FROM_TRANSACTIONAL: z.string().optional().default("no-reply@app.example.com"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().default("LoyaltyPlatform"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.errors.map(e => `  - ${e.path.join(".")}: ${e.message}`).join("\n");
    console.error("❌ Invalid environment variables:\n" + errorDetails);
    throw new Error("Invalid environment variables");
  }
  return result.data;
};

export const env = parseEnv();
