# Estrutura de pastas

- **Escopo:** Árvore do repositório e papel de cada diretório.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-dados.md`
- **Paths do código:** não declarado

```text
.
|-- .claude/
|   |-- rules/                regras por domínio (carregadas por paths)
|   `-- skills/               skills de contexto e de fluxo
|-- .cursor/rules/            regras por domínio para o Cursor
|-- .github/workflows/        CI: lint, tipos, testes (com Postgres) e build
|-- docker/
|   `-- postgres/init.sql     papéis bizu_owner e bizu_app no primeiro start
|-- docs/
|   |-- context/              contexto para LLMs, a partir do INDEX.md
|   `-- specs/                templates de PRD/SPEC e specs de features
|-- drizzle/                  migrations Drizzle
|-- src/
|   |-- api/                  Hono API (/api/*): app, auth, auth-ext, rate limit, log
|   |-- components/
|   |   |-- auth/
|   |   |-- contact/
|   |   |-- dashboard/        cards da área /app (vira components/app na fase 4)
|   |   |-- landing/
|   |   |-- layout/
|   |   |-- projects/
|   |   `-- ui/               shadcn/ui
|   |-- db/                   Drizzle: schema e client
|   |-- lib/
|   |   |-- api/              cliente da API
|   |   |-- constants/
|   |   |-- content/
|   |   |-- email/            EmailProvider, provedores memory e smtp, layout de template
|   |   |-- env.ts            variáveis de ambiente validadas
|   |   |-- schemas/          Zod compartilhado
|   |   `-- theme.ts
|   |-- pages/                componentes de página reaproveitados por routes
|   |-- providers/
|   |-- routes/               route modules do React Router Framework Mode
|   |-- stores/
|   |-- styles/theme.css
|   |-- root.tsx              document/root app
|   |-- routes.ts             route config do RR
|   `-- server.ts             servidor Hono + RR SSR
|-- tests/db/                 testes que exigem o Postgres do Docker
|-- Dockerfile
|-- docker-compose.yml        Postgres e Mailpit de desenvolvimento
|-- react-router.config.ts
|-- vite.config.ts
|-- vitest.config.ts          npm test (sem banco)
`-- vitest.db.config.ts       npm run test:db
```

Autenticação: `src/lib/auth/` (servidor, cliente, e-mails, papéis), `src/routes/auth/` e
`src/lib/email/templates/auth/`. Schema por domínio em `src/db/schema/`.

Pastas previstas pelas fases seguintes: `src/lib/billing/`,
`src/lib/payments/providers/<id>/`, `src/jobs/`, `docker/compose.prod.yml`.
