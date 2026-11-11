CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"owner_tenant_id" uuid NOT NULL,
	"join_code" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "organisation_id" uuid;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenants_organisation_idx" ON "tenants" USING btree ("organisation_id");