-- O que o Drizzle Kit não gera. Sem FORCE, o dono da tabela (bizu_owner) ignoraria o RLS.
ALTER TABLE "billing_profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- `ALTER DEFAULT PRIVILEGES` do init.sql já cobre o bizu_app. Explícito aqui para o
-- Postgres em que o papel foi criado à mão, sem esse trecho.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "billing_profile", "invoice", "payment_event"
TO bizu_app;
