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
|-- .github/                  CI (workflows/), Dependabot, modelos de issue e de PR, CODEOWNERS
|-- docker/
|   |-- compose.prod.yml      stack de produção (app, worker, migrate, postgres, caddy, backup)
|   |-- .env.prod.example     variáveis da stack de produção
|   |-- caddy/Caddyfile       reverse proxy com TLS e HSTS
|   |-- backup/               serviço de backup cifrado
|   `-- postgres/             init.sql (papéis) e init-prod.sh (senhas do ambiente)
|-- docs/
|   |-- context/              contexto para LLMs, a partir do INDEX.md
|   `-- specs/                templates de PRD/SPEC e specs de features
|-- drizzle/                  migrations Drizzle
|-- src/
|   |-- api/                  Hono API (/api/*): app, auth, auth-ext, rate limit, log
|   |-- components/
|   |   |-- app/              shell e telas da área /app
|   |   |-- auth/
|   |   |-- contact/
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
|-- CHANGELOG.md, CONTRIBUTING.md, SECURITY.md, LICENSE
|-- react-router.config.ts
|-- vite.config.ts
|-- vitest.config.ts          npm test (sem banco)
`-- vitest.db.config.ts       npm run test:db
```

Autenticação: `src/lib/auth/` (servidor, cliente, e-mails, papéis), `src/routes/auth/` e
`src/lib/email/templates/auth/`. Schema por domínio em `src/db/schema/`.

LGPD e arquivos: `src/lib/lgpd/`, `src/lib/legal/` (textos), `src/lib/files/`, `src/lib/storage/providers/<id>/` (módulos `local` e `s3`); logs em `src/lib/logger.ts` e `src/lib/observability.ts`, Sentry em `src/lib/monitoring/sentry/`; backup em `docker/backup/` (`tech/27-lgpd-arquivos.md`).

Cobrança: `src/lib/billing/` (núcleo) e `src/lib/payments/providers/<id>/` (módulos).
Deploy: `docker/compose.prod.yml` com `docker/caddy/`, `docker/postgres/` e `docker/.env.prod.example` (`tech/14-deploy.md`).
