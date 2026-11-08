ALTER TABLE "deletion_request" ADD COLUMN "origin" text DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "deletion_request" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;