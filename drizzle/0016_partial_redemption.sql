ALTER TABLE "redemptions" ADD COLUMN "is_partial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "value_minor" integer;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "hold_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "allow_partial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "value_minor" integer;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "min_partial_points" integer;