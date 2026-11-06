CREATE TABLE "billing_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"document" text NOT NULL,
	"document_type" text NOT NULL,
	"email" text NOT NULL,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"amount_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"payment_method" text,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"hosted_url" text,
	"pix_payload" text,
	"boleto_line" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text,
	"raw" jsonb,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"tenant_id" uuid
);
--> statement-breakpoint
ALTER TABLE "payment_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_event" ADD COLUMN "occurred_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_profile" ADD CONSTRAINT "billing_profile_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_profile_tenant_id_idx" ON "billing_profile" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_provider_ref_idx" ON "invoice" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "invoice_tenant_created_idx" ON "invoice" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_subscription_idx" ON "invoice" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_event_provider_event_idx" ON "payment_event" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_event_status_received_idx" ON "payment_event" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "payment_event_tenant_idx" ON "payment_event" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "subscription_event" ADD CONSTRAINT "subscription_event_payment_event_id_payment_event_id_fk" FOREIGN KEY ("payment_event_id") REFERENCES "public"."payment_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_provider_ref_idx" ON "subscription" USING btree ("provider","provider_subscription_ref") WHERE "subscription"."provider_subscription_ref" is not null;--> statement-breakpoint
CREATE INDEX "subscription_provider_customer_idx" ON "subscription" USING btree ("provider","provider_customer_ref");--> statement-breakpoint
CREATE INDEX "subscription_status_period_idx" ON "subscription" USING btree ("status","current_period_end");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "billing_profile" AS PERMISSIVE FOR ALL TO "bizu_app", "bizu_owner" USING (current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice" AS PERMISSIVE FOR ALL TO "bizu_app", "bizu_owner" USING (current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payment_event" AS PERMISSIVE FOR ALL TO "bizu_app", "bizu_owner" USING (current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);