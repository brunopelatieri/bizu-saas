---
paths:
  - "src/db/**"
  - "drizzle/**"
  - "drizzle.config.ts"
---

# Schema, migrations e queries com Drizzle em qualquer Postgres

- Dados da aplicação passam sempre pelo Drizzle.
- O Postgres pode ser local ou em qualquer servidor: muda só a `DATABASE_URL`.
- Toda mudança de schema em `src/db/schema.ts` gera migration: `npm run db:generate` e `npm run db:migrate`.
- Tabelas novas ficam por domínio em `src/db/schema/<domínio>.ts`, reexportadas em `schema.ts`.
- O schema `pgboss` (fila de jobs) não é do Drizzle: a migration só o cria e dá acesso ao `bizu_app`; as tabelas vêm de `npm run jobs:install` (`docs/context/tech/20-jobs.md`).
- `DATABASE_URL` é de runtime (`bizu_app`, sem `BYPASSRLS`); `DIRECT_URL` é do Drizzle Kit e da instalação da fila (`bizu_owner`); o seed usa a conexão de runtime.
- `plan`, `plan_price` e `platform_setting` são da plataforma (sem RLS, editadas só por `/api/admin/*`).
- `subscription`, `subscription_event`, `invoice` e `billing_profile` são de tenant; `payment_event` tem RLS e só se lê com `withPlatformScope`.
- Transição de cobrança em `subscription.status` passa por `transition()` + `applyDecision()` (`src/lib/billing/`), com a linha travada. A exceção é `changeTenantPlan`, a troca manual do admin.
- `npm run db:seed` é idempotente, recusa produção sem `SEED_ALLOW_PRODUCTION=1` e nunca promove conta com e-mail não confirmado.
- Testes que precisam de banco ficam em `tests/db/` e rodam com `npm run test:db`.
- `drizzle-kit` é devDependency: rode pelos scripts `db:*`, sem instalar globalmente.
- Toda tabela com `tenant_id` tem `.enableRLS()`, `tenantPolicy()` e `FORCE ROW LEVEL SECURITY` em migration customizada; `tests/db/rls.test.ts` reprova quem esquecer.
- Toda query de tenant roda em `withTenant(tenantId, fn)`; jobs e `/api/admin/*` usam `withPlatformScope(reason, fn)` (`src/db/rls.ts`). Fora disso, `bizu_app` lê vazio.
- Rotas de tenant não importam `@/db`: os dados passam por `src/lib/tenant/`.
- Permissões são validadas no servidor, com `requireAuth` + `requireTenant` + `requirePermission`.
- Loaders acessam o banco direto, sem chamada HTTP interna.
- Migrations rodam fora do container da aplicação.

Para entender este domínio, leia: docs/context/tech/07-banco-drizzle.md
