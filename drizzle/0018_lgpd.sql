CREATE TABLE "consent_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"accepted" boolean NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"tenant_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"file_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "data_export" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deletion_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"tenant_id" uuid,
	"requested_by" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deletion_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_export" ADD CONSTRAINT "data_export_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_request" ADD CONSTRAINT "deletion_request_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_log_subject_idx" ON "consent_log" USING btree ("subject_type","subject_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_export_pending_idx" ON "data_export" USING btree ("subject_type","subject_id") WHERE "data_export"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "data_export_subject_idx" ON "data_export" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_request_pending_idx" ON "deletion_request" USING btree ("subject_type","subject_id") WHERE "deletion_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "deletion_request_due_idx" ON "deletion_request" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "data_export" AS PERMISSIVE FOR ALL TO "bizu_app", "bizu_owner" USING (current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "deletion_request" AS PERMISSIVE FOR ALL TO "bizu_app", "bizu_owner" USING (current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
-- Sem FORCE, o dono da tabela (bizu_owner) ignoraria o RLS.
ALTER TABLE "deletion_request" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_export" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "consent_log", "deletion_request", "data_export" TO bizu_app;
