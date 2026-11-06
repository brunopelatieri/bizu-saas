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
- `DATABASE_URL` é de runtime; `DIRECT_URL` é do Drizzle Kit.
- `drizzle-kit` é devDependency: rode pelos scripts `db:*`, sem instalar globalmente.
- Permissões são validadas no servidor, com `requireAuth` + checks.
- Loaders acessam o banco direto, sem chamada HTTP interna.
- Migrations rodam fora do container da aplicação.

Para entender este domínio, leia: docs/context/tech/07-banco-drizzle.md
