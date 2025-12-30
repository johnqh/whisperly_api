CREATE SCHEMA "whisperly";
--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('starter', 'pro', 'enterprise');--> statement-breakpoint
CREATE TABLE "whisperly"."glossaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"term" varchar(500) NOT NULL,
	"translations" jsonb NOT NULL,
	"context" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whisperly"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_name" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"instructions" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whisperly"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" "subscription_tier" NOT NULL,
	"revenuecat_entitlement" varchar(255) NOT NULL,
	"monthly_request_limit" integer NOT NULL,
	"hourly_request_limit" integer NOT NULL,
	"requests_this_month" integer DEFAULT 0 NOT NULL,
	"requests_this_hour" integer DEFAULT 0 NOT NULL,
	"month_reset_at" timestamp,
	"hour_reset_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "whisperly"."usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"string_count" integer NOT NULL,
	"character_count" integer NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "whisperly"."user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_name" varchar(255),
	"organization_path" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_settings_organization_path_unique" UNIQUE("organization_path")
);
--> statement-breakpoint
CREATE TABLE "whisperly"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" varchar(128) NOT NULL,
	"email" varchar(255),
	"display_name" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid")
);
--> statement-breakpoint
ALTER TABLE "whisperly"."glossaries" ADD CONSTRAINT "glossaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "whisperly"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whisperly"."projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "whisperly"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whisperly"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "whisperly"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whisperly"."usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "whisperly"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whisperly"."usage_records" ADD CONSTRAINT "usage_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "whisperly"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whisperly"."user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "whisperly"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_term_per_project" ON "whisperly"."glossaries" USING btree ("project_id","term");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_project_per_user" ON "whisperly"."projects" USING btree ("user_id","project_name");--> statement-breakpoint
CREATE INDEX "idx_usage_user_timestamp" ON "whisperly"."usage_records" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_usage_project_timestamp" ON "whisperly"."usage_records" USING btree ("project_id","timestamp");