# Banco de dados com Drizzle

- **Escopo:** Schema, papéis do Postgres, variáveis e uso do Drizzle em qualquer Postgres.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-dados.md`, `spec-tenant-rbac.md`
- **Paths do código:** `src/db/index.ts`, `src/db/schema.ts`, `drizzle.config.ts`, `docker/postgres/init.sql`, `tests/db/`

## Arquivos

- `src/db/schema.ts`: schema Drizzle (a fase 4 divide em `src/db/schema/<domínio>.ts`).
- `src/db/index.ts`: `getDb()`, conexão de runtime com `DATABASE_URL` lida de `getEnv()`.
- `drizzle.config.ts`: usa `DIRECT_URL` (fallback `DATABASE_URL`).
- `drizzle/`: migrations geradas; `npm run db:generate` e `npm run db:migrate`.
- `docker/postgres/init.sql`: papéis e banco, rodado uma vez pelo Docker ou à mão.

Schema atual:

```text
contact_messages
  id uuid primary key defaultRandom
  name text not null
  email text not null
  message text not null
  created_at timestamp with timezone default now
```

## Papéis do Postgres

| Papel | URL | Uso | Permissão |
|---|---|---|---|
| `bizu_owner` | `DIRECT_URL` | migrations, seed, instalação da fila | dono do banco `bizu` e das tabelas |
| `bizu_app` | `DATABASE_URL` | aplicação em runtime | `NOBYPASSRLS`, sem `CREATE` em `public` |

- `init.sql` define `ALTER DEFAULT PRIVILEGES FOR ROLE bizu_owner`: toda tabela e
  sequência criadas pelas migrations ficam com `SELECT/INSERT/UPDATE/DELETE` para
  `bizu_app`, sem `GRANT` manual. O RLS continua valendo para `bizu_app`.
- Migration não cria papéis (precisa de superusuário). Em Postgres próprio, rode o
  `init.sql` com `psql` antes do `db:migrate`; ele usa `\gexec` e `\connect`.
- Senhas do `init.sql` são de desenvolvimento; em produção, troque-as e reflita nas URLs.
- Pooler em modo transaction (PgBouncer): acrescente `?prepare=false` à `DATABASE_URL`.

## Testes com banco

`npm run test:db` roda `tests/db/**/*.test.ts` (`vitest.db.config.ts`) contra o
Postgres do Docker com as migrations aplicadas, sem paralelismo entre arquivos.
`tests/db/roles.test.ts` prova que `DATABASE_URL` é `bizu_app` sem `BYPASSRLS`, que ele
não cria tabelas e que herda acesso às tabelas de `bizu_owner`. O `rls.test.ts` da
fase 4 entra na mesma pasta.

## Regras

- Dados da aplicação passam sempre pelo Drizzle, em qualquer Postgres.
- Toda tabela de tenant terá `tenant_id`, `enableRLS()` e policy; toda query de tenant
  rodará em `withTenant` (fase 4, `spec-tenant-rbac.md`).
- Mudança de schema é sempre migration; `db:push` só em dev descartável.
