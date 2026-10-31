ALTER TABLE "sessions" ADD COLUMN "reauthed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_email_enabled" boolean DEFAULT false NOT NULL;