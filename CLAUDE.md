# Bizu SaaS — Roteador de Contexto

Boilerplate full-stack para iniciar SaaS, portais, sites, blogs, dashboards e
sistemas web com **AI Software Engineering**: PRD/spec primeiro, contexto enxuto
carregado sob demanda e decisões técnicas documentadas.

## Como carregar contexto

Antes de explorar o projeto, use o INDEX para decidir qual contexto carregar;
não leia AI_CONTEXT.md/PROJECT_TECHNICAL_SPEC.md inteiros.

@docs/context/INDEX.md

- Comece por `docs/context/core.md` quando a tarefa envolver decisão de arquitetura.
- Carregue só os arquivos do domínio tocado. Na dúvida entre dois, leia um e avalie.
- Prefira ler um trecho (`Grep` + faixa de linhas) a abrir um arquivo inteiro.

## Domínio

Template reutilizável, não um produto final. Toda decisão deve servir de ponto de
partida para projetos derivados: simples de entender, de trocar e de remover.

- Público com SSR: `/`, `/sobre`, `/projetos`, `/contato`, `/blog`, `/blog/:slug`.
- Auth standalone: `/login`, `/auth/callback`.
- Área autenticada client-only: `/dashboard/**`.

## Regras inegociáveis

**Arquitetura**
- React Router v7 Framework Mode com `ssr: true`. Não reintroduzir `src/App.tsx`,
  `src/main.tsx`, `index.html` nem a pasta `server/`.
- Hono em `src/api/app.ts`, montado por `src/server.ts`, em processo único. Sem
  proxy `/api` no Vite: API e frontend compartilham origem.

**Dados: Drizzle é a fonte da verdade**
- Dados da aplicação ficam no Postgres próprio, via Drizzle (`src/db/`).
- Mudança de schema é sempre migration Drizzle (`npm run db:generate`, `db:migrate`).
- Loaders acessam o banco direto, sem volta HTTP interna.

**Supabase: apenas auxiliar**
- Permitido: Auth, Storage, Edge Functions, Realtime broadcast/presence.
- Proibido: `supabase.from()`, schema/migrations de dados e `postgres_changes`.
- Permissões são validadas na aplicação (`getUser()` + checks), não por RLS.

**Segurança**
- Dashboard sem `loader` server-side com dados sensíveis; use TanStack Query.
- Stripe server-side e Nodemailer nunca entram em componentes React.
- Segredos nunca são commitados; só `.env.example` é versionado.

**Contratos**
- Zod para entrada de API e formulários, com schema compartilhado em `src/lib/schemas/`.
- `meta` nativo para SEO; loaders server-side para dados públicos indexáveis.

## Fluxo de trabalho

1. **PRD/spec:** feature relevante começa em `docs/specs/<feature>/`, antes do código.
2. **Plano:** defina onde entra (pública SSR, API Hono ou dashboard client-side).
3. **Implementação:** mudanças pequenas e cirúrgicas, verificáveis por etapa.
4. **Verificação:** `npm run typecheck` e `npm run build`.
5. **`/code-review`:** revisão antes de entregar.

## Regra de contexto vivo

Mudança de código em um domínio exige atualizar, no mesmo trabalho, o arquivo
correspondente em `docs/context/`. Se o escopo do domínio mudar (arquivo novo,
paths, responsabilidade), atualize também `docs/context/INDEX.md`. Se afetar
onboarding, atualize `README.md`. Se afetar decisões futuras de agentes, atualize
as rules em `.claude/rules/` e `.cursor/rules/`.
