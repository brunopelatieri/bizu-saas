-- O que o Drizzle Kit não gera. Sem FORCE, o dono da tabela (bizu_owner) ignoraria o RLS.
ALTER TABLE "impersonation_grant" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_payment_credential" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- `ALTER DEFAULT PRIVILEGES` do init.sql já cobre o bizu_app. Explícito aqui para o
-- Postgres em que o papel foi criado à mão, sem esse trecho.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "two_factor", "portal_two_factor", "impersonation_grant",
  "tenant_payment_credential", "rate_limit_bucket"
TO bizu_app;
