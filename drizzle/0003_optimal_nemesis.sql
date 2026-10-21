CREATE TABLE "promo_qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid,
	"code" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"offer_type" varchar(32) DEFAULT 'points_bonus' NOT NULL,
	"points_to_award" integer DEFAULT 0 NOT NULL,
	"required_visits" integer DEFAULT 1 NOT NULL,
	"product_id" uuid,
	"product_reward_name" varchar(255),
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"validity_days" integer DEFAULT 30 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"total_scans" integer DEFAULT 0 NOT NULL,
	"total_claims" integer DEFAULT 0 NOT NULL,
	"qr_data_url" text NOT NULL,
	"scan_url" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_qr_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "promo_qr_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_qr_id" uuid NOT NULL,
	"membership_id" uuid,
	"member_number" varchar(64),
	"member_name" varchar(255),
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'recorded' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promo_qr_codes" ADD CONSTRAINT "promo_qr_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_qr_codes" ADD CONSTRAINT "promo_qr_codes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_qr_codes" ADD CONSTRAINT "promo_qr_codes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_qr_codes" ADD CONSTRAINT "promo_qr_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_qr_scans" ADD CONSTRAINT "promo_qr_scans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_qr_scans" ADD CONSTRAINT "promo_qr_scans_campaign_qr_id_promo_qr_codes_id_fk" FOREIGN KEY ("campaign_qr_id") REFERENCES "public"."promo_qr_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_qr_scans" ADD CONSTRAINT "promo_qr_scans_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promo_qr_tenant_status_idx" ON "promo_qr_codes" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "promo_qr_code_idx" ON "promo_qr_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "promo_qr_expires_idx" ON "promo_qr_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "promo_qr_scans_tenant_idx" ON "promo_qr_scans" USING btree ("tenant_id","scanned_at");--> statement-breakpoint
CREATE INDEX "promo_qr_scans_campaign_idx" ON "promo_qr_scans" USING btree ("campaign_qr_id");