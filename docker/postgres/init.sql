-- Papéis e banco do Bizu SaaS.
--
-- Roda uma vez, no primeiro start do volume do Postgres (docker-compose.yml) ou à mão
-- em um Postgres próprio, como superusuário:
--
--   psql -h <host> -U postgres -f docker/postgres/init.sql
--
-- Usa comandos do psql (\gexec, \connect, \if): rode com o psql, não com um cliente gráfico.
--
-- Papéis:
--   bizu_owner   dono das tabelas; usado por DIRECT_URL (migrations, seed, instalação da fila).
--   bizu_app     runtime da aplicação; usado por DATABASE_URL. Sem BYPASSRLS: o Row Level
--                Security vale para ele. Não cria tabelas.
--   bizu_backup  opcional (só se `bizu_backup_password` for definida): atravessa o RLS e lê
--                tudo, para o `pg_dump` do serviço de backup. Cria bancos para o restore-test.
--
-- Senhas: por padrão, as de desenvolvimento (iguais ao nome do papel). Em produção, passe-as
-- como variáveis do psql, sem editar este arquivo (docker/postgres/init-prod.sh faz isso no
-- compose de produção; à mão, use):
--
--   psql -h <host> -U postgres \
--     -v bizu_owner_password="$BIZU_OWNER_PASSWORD" \
--     -v bizu_app_password="$BIZU_APP_PASSWORD" \
--     -v bizu_backup_password="$BIZU_BACKUP_PASSWORD" \
--     -f docker/postgres/init.sql
--
-- Papéis que já existem não têm a senha alterada: para trocá-la depois, use
-- ALTER ROLE ... PASSWORD e reflita em DATABASE_URL e DIRECT_URL.

\if :{?bizu_owner_password}
\else
  \set bizu_owner_password bizu_owner
\endif
\if :{?bizu_app_password}
\else
  \set bizu_app_password bizu_app
\endif

SELECT format(
  'CREATE ROLE bizu_owner LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
  :'bizu_owner_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizu_owner')
\gexec

SELECT format(
  'CREATE ROLE bizu_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT',
  :'bizu_app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizu_app')
\gexec

\if :{?bizu_backup_password}
SELECT format(
  'CREATE ROLE bizu_backup LOGIN PASSWORD %L NOSUPERUSER CREATEDB NOCREATEROLE BYPASSRLS',
  :'bizu_backup_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizu_backup')
\gexec
GRANT pg_read_all_data TO bizu_backup;
\endif

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
