ALTER TABLE "campaigns" ADD COLUMN "subject_b" varchar(150);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "body_b" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "ab_split_percent" integer;