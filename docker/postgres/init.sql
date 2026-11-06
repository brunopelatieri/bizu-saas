-- Papéis e banco do Bizu SaaS.
--
-- Roda uma vez, no primeiro start do volume do Postgres (docker-compose.yml) ou à mão
-- em um Postgres próprio, como superusuário:
--
--   psql -h <host> -U postgres -f docker/postgres/init.sql
--
-- Usa comandos do psql (\gexec, \connect): rode com o psql, não com um cliente gráfico.
--
-- Papéis:
--   bizu_owner  dono das tabelas; usado por DIRECT_URL (migrations, seed, instalação da fila).
--   bizu_app    runtime da aplicação; usado por DATABASE_URL. Sem BYPASSRLS: o Row Level
--               Security vale para ele. Não cria tabelas.
--
-- As senhas abaixo são de desenvolvimento. Em produção, troque-as aqui antes de rodar
-- ou com ALTER ROLE ... PASSWORD depois, e reflita em DATABASE_URL e DIRECT_URL.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizu_owner') THEN
    CREATE ROLE bizu_owner LOGIN PASSWORD 'bizu_owner'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizu_app') THEN
    CREATE ROLE bizu_app LOGIN PASSWORD 'bizu_app'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;

SELECT 'CREATE DATABASE bizu OWNER bizu_owner'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'bizu')
\gexec

\connect bizu

-- No Postgres 15+, o schema public pertence ao dono do banco (bizu_owner).
-- O runtime só usa o schema; não cria objetos nele.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE bizu TO bizu_app;
GRANT USAGE ON SCHEMA public TO bizu_app;

-- Toda tabela e sequência criadas por bizu_owner (migrations) ficam acessíveis ao
-- runtime sem GRANT manual. O RLS continua valendo para bizu_app.
ALTER DEFAULT PRIVILEGES FOR ROLE bizu_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bizu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bizu_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bizu_app;
