ALTER TABLE "promo_qr_scans" ADD COLUMN "visit_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_qr_scans" ADD COLUMN "required_visits" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_qr_scans" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "promo_qr_scans" ADD COLUMN "approved_by_name" varchar(255);--> statement-breakpoint
ALTER TABLE "promo_qr_scans" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promo_qr_scans" ADD CONSTRAINT "promo_qr_scans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;