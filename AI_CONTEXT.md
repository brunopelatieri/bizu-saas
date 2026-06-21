# AI Context — Bizu SaaS

Este arquivo é o ponto de entrada rápido para qualquer LLM/AI Agent entender o
projeto antes de propor ou executar mudanças.

## Objetivo

Boilerplate full-stack para iniciar projetos rapidamente com metodologia de
**AI Software Engineering**: contexto explícito, decisões documentadas,
desenvolvimento guiado por especificação e stack moderna para entregar projetos
com velocidade, precisão e escalabilidade.

Projetos-alvo:

- SaaS
- portal de clientes
- site institucional
- landing page
- blog
- dashboard/admin
- sistemas web de aplicação

## Arquivos Que Devem Ser Lidos Primeiro

1. `AI_CONTEXT.md` — visão rápida e regras de atualização de contexto.
2. `PROJECT_TECHNICAL_SPEC.md` — especificação técnica completa.
3. `MIGRATION_NOTES.md` — decisões da migração para React Router Framework Mode.
4. `.specify/memory/constitution.md` — constituição SpecifyX.
5. `.cursor/rules/*.mdc` — regras operacionais do workspace.

## Arquitetura Atual

```text
React Router v7 Framework Mode (SSR global)
  |
  |-- Rotas públicas com SSR: /, /sobre, /projetos, /contato, /blog, /blog/:slug
  |-- Rotas auth standalone: /login, /auth/callback
  `-- Dashboard client-only por convenção: /dashboard/**

Hono API no mesmo processo:
  |-- src/server.ts
  `-- src/api/app.ts (/api/*)

Dados:
  |-- Drizzle ORM + postgres.js -> Postgres próprio
  `-- Supabase apenas auxiliar (Auth, Storage, Edge Functions, Realtime)
```

## Regras de Decisão

- Não reintroduzir `src/App.tsx`, `src/main.tsx`, `index.html` ou `server/` antigo.
- Não adicionar proxy `/api` no Vite; API e frontend compartilham origem.
- Não usar `supabase.from()` para CRUD da aplicação.
- Não colocar dados sensíveis do dashboard em `loader` server-side.
- Use `meta` nativo do React Router para SEO/Open Graph.
- Use loaders server-side para dados públicos indexáveis (blog, landing dinâmica).
- Use client-side fetching/TanStack Query para área autenticada.
- Use Zod para contratos de entrada de API e formulários.
- Use Drizzle migrations para mudanças de schema.

## Quando Atualizar Contexto

Atualize este arquivo e `PROJECT_TECHNICAL_SPEC.md` quando mudar:

- Arquitetura.
- Rotas.
- Stack ou dependências relevantes.
- Deploy/Docker/Portainer.
- Banco/schema.
- Regras de uso de Supabase.
- Estratégia de auth, billing, multi-tenant ou dashboard.
- Convenções de IA/SpecifyX.

Se a mudança afetar onboarding, atualize também `README.md`.
Se a mudança afetar agentes/LLMs, atualize também `.cursor/rules/`.

## Onboarding Local (Primeira Execução)

```bash
npm install
cp .env.example .env.local
docker compose up -d          # Postgres em localhost:15432
npm run db:migrate
npm run dev
```

- `drizzle-kit` está em **devDependencies** — disponível após `npm install`; não
  instalar globalmente. Scripts `db:*` usam o binário local via npm.
- `drizzle.config.ts` carrega `.env.local` e usa `DIRECT_URL` (fallback
  `DATABASE_URL`).
- Postgres local: porta **15432** no host (5432 reservada/bloqueada em muitos
  Windows). Ver `docker-compose.yml` e `.env.example`.
- Se migrate falhar por conexão: `docker compose ps` + conferir `.env.local`.

## Status Atual

- Demo em [https://bizu.bru.ia.br](https://bizu.bru.ia.br) — hospedada na **Vercel**.
- Repositório principal (este): **VPS + Docker + Node único** (`react-router-hono-server` + Hono + SSR).
- Repositório Vercel (arquitetura otimizada para demo/serverless): [bizu-saas-vercel](https://github.com/brunopelatieri/bizu-saas-vercel).
- React Router Framework Mode com `ssr: true`.
- Hono integrado via `react-router-hono-server`.
- Blog SSR com fonte estática em `src/lib/content/posts.ts`.
- Dashboard inicial protegido no cliente.
- Tema dark/light com Zustand e script anti-flash.
- Sonner montado globalmente.
- Dockerfile multi-stage para VPS.

## Pendências Técnicas Conhecidas

- Evoluir blog estático para tabela Drizzle quando virar feature real.
- Criar schemas compartilhados adicionais conforme novos forms/APIs surgirem.
- Adicionar providers prontos para TanStack Query quando houver server state real.
- Criar stack Portainer completa para app + Postgres + reverse proxy.
