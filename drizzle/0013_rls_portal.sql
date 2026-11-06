-- O que o Drizzle Kit não gera. Sem FORCE, o dono da tabela (bizu_owner) ignoraria o RLS.
ALTER TABLE "customer" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- `ALTER DEFAULT PRIVILEGES` do init.sql já cobre o bizu_app. Explícito aqui para o
-- Postgres em que o papel foi criado à mão, sem esse trecho. As tabelas `portal_*` não têm
-- RLS: são da identidade do cliente, que atravessa tenants.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "customer", "portal_user", "portal_session", "portal_account",
  "portal_verification", "portal_rate_limit"
TO bizu_app;
