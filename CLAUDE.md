# Bizu Starter — Roteador de Contexto

Ponto de partida full-stack para projetos pequenos e médios que **não são SaaS**,
mas têm site público, área de login e dashboard. Usa Drizzle em qualquer Postgres,
com **AI Software Engineering**: PRD/spec primeiro, contexto
enxuto carregado sob demanda e decisões técnicas documentadas.

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

Fora do escopo: multi-tenant, planos e cobrança recorrente. Não adicione essas
camadas sem spec aprovada: elas mudam o propósito do template.

- Público com SSR: `/`, `/sobre`, `/projetos`, `/contato`, `/blog`, `/blog/:slug`.
- Auth standalone: `/login`.
- Área autenticada client-only: `/dashboard/**`.

## Regras inegociáveis

**Arquitetura**
- React Router v7 Framework Mode com `ssr: true`. Não reintroduzir `src/App.tsx`,
  `src/main.tsx`, `index.html` nem a pasta `server/`.
- Hono em `src/api/app.ts`, montado por `src/server.ts`, em processo único. Sem
  proxy `/api` no Vite: API e frontend compartilham origem.

**Dados: Drizzle é a única camada de dados**
- Dados da aplicação passam sempre pelo Drizzle (`src/db/`). O Postgres pode ser
  local ou em qualquer servidor: muda só a `DATABASE_URL`.
- Mudança de schema é sempre migration Drizzle (`npm run db:generate`, `db:migrate`).
- Loaders acessam o banco direto, sem volta HTTP interna.

**Autenticação: ainda sem provedor**
- Login e dashboard estão bloqueados. Veja `docs/context/tech/08-auth.md`.
- Nunca abra o gate para contornar isso: a falha é fechada.
- Permissões são validadas no servidor, com `requireAuth` + checks.

**Segurança**
- Toda rota privada da API usa `requireAuth` (`src/api/auth.ts`). O `ProtectedRoute`
  roda no cliente e não protege dados.
- Dashboard sem `loader` server-side com dados sensíveis; use TanStack Query e `apiFetch`.
- `VITE_*` vai para o navegador: só valores públicos.
- Segredos nunca são commitados; só `.env.example` é versionado.

**Contratos**
- Zod para entrada de API e formulários, com schema compartilhado em `src/lib/schemas/`.
- `meta` nativo para SEO; loaders server-side para dados públicos indexáveis.

## Fluxo de trabalho

1. **PRD/spec:** feature relevante começa em `docs/specs/<feature>/`, antes do código
   (`/prd`, `/spec`). Método completo: `docs/context/ai-engineering.md`.
2. **Plano:** defina onde entra (pública SSR, API Hono ou dashboard client-side).
3. **Implementação:** mudanças pequenas e cirúrgicas, verificáveis por etapa.
4. **Verificação:** `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.
5. **`/code-review`:** revisão antes de entregar.

## Regra de contexto vivo

Mudança de código em um domínio exige atualizar, no mesmo trabalho, o arquivo
correspondente em `docs/context/`. Se surgir um arquivo ou uma responsabilidade
nova, atualize também `docs/context/INDEX.md`. Se os paths do domínio mudarem,
atualize as rules. Se afetar
onboarding, atualize `README.md`. Se afetar decisões futuras de agentes, atualize
as rules em `.claude/rules/` e `.cursor/rules/`.
