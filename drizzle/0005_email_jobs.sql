CREATE TABLE "email_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_hash" text NOT NULL,
	"template" text NOT NULL,
	"provider" text,
	"provider_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppression" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_message_provider_message_id_idx" ON "email_message" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "email_message_created_at_idx" ON "email_message" USING btree ("created_at");
--> statement-breakpoint
-- Schema do pg-boss (fila de jobs). As tabelas são criadas por `npm run jobs:install`
-- (primeiro `start()` do pg-boss com DIRECT_URL / bizu_owner). Aqui só o schema e os
-- acessos do runtime: tudo que bizu_owner criar em `pgboss` fica acessível ao bizu_app.
CREATE SCHEMA IF NOT EXISTS "pgboss";
--> statement-breakpoint
GRANT USAGE ON SCHEMA "pgboss" TO "bizu_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "pgboss" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "bizu_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "pgboss" GRANT USAGE, SELECT ON SEQUENCES TO "bizu_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "pgboss" GRANT EXECUTE ON FUNCTIONS TO "bizu_app";
