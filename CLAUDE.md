# Bizu SaaS — Roteador de Contexto

Ponto de partida open source para **qualquer SaaS**: multi-tenant, quatro níveis de
login com verificação de e-mail, trial configurável e pagamentos em módulos. Tudo
sobre Drizzle em qualquer Postgres, com **AI Software Engineering**: PRD/spec
primeiro, contexto enxuto carregado sob demanda e decisões técnicas documentadas.

## Como carregar contexto

Antes de explorar o projeto, use o INDEX para decidir qual contexto carregar.

@docs/context/INDEX.md

- Comece por `docs/context/core.md` quando a tarefa envolver decisão de arquitetura.
- A feature em andamento é `docs/specs/saas-foundation/`: abra `spec.md` (índice) e
  só o arquivo do domínio tocado. `spec-plano.md` diz a fase e o modelo recomendado.
- Carregue só os arquivos do domínio tocado. Prefira ler um trecho a abrir um arquivo.

## Domínio

Template reutilizável para SaaS, não um produto final. Toda decisão deve servir de
ponto de partida para projetos derivados: simples de entender, de trocar e de remover.
Módulos opcionais (provedor de pagamento, e-mail, arquivos) ficam em pasta própria e
somem ao apagar a pasta e uma linha de registro.

Níveis de acesso: **proprietário da plataforma** (`/admin`), **owner** e
**colaboradores** do tenant (`/app`), **clientes/leads** do tenant (`/portal`).

- Público com SSR: `/`, `/sobre`, `/projetos`, `/contato`, `/blog`, `/blog/:slug`.
- Auth standalone: `/login` (e, nas fases seguintes, `/cadastro`, `/verificar-email`,
  `/convite/:id`, `/esqueci-senha`, `/redefinir-senha`).
- Áreas autenticadas client-only: `/app/**`, `/admin/**`, `/portal/**`.

Fora do escopo: subdomínio por tenant, login social, API pública, nota fiscal e o
fluxo em que o owner cobra seus clientes (reservado como módulo futuro).

## Regras inegociáveis

**Arquitetura**
- React Router v7 Framework Mode com `ssr: true`. Não reintroduzir `src/App.tsx`,
  `src/main.tsx`, `index.html` nem a pasta `server/`.
- Hono em `src/api/app.ts`, montado por `src/server.ts`, em processo único. Sem
  proxy `/api` no Vite: API e frontend compartilham origem.

**Dados: Drizzle é a única camada de dados**
- Dados da aplicação passam sempre pelo Drizzle (`src/db/`). O Postgres pode ser
  local ou em qualquer servidor: muda só a `DATABASE_URL`.
- Dois papéis no Postgres: `bizu_owner` (`DIRECT_URL`, migrations e seed) e
  `bizu_app` (`DATABASE_URL`, runtime, sem `BYPASSRLS`).
- Mudança de schema é sempre migration Drizzle (`npm run db:generate`, `db:migrate`).
- Toda tabela de tenant tem `tenant_id`, `enableRLS()` e policy; toda query de tenant
  roda dentro de `withTenant` (ver `docs/specs/saas-foundation/spec-tenant-rbac.md`).
- Loaders acessam o banco direto, sem volta HTTP interna.

**Autenticação: Better Auth em duas instâncias**
- `auth` (plataforma e equipe) e `portalAuth` (clientes/leads), sobre Drizzle, com
  sessões em cookie. Estado atual e pontos de integração: `docs/context/tech/08-auth.md`.
- Nunca abra o gate para contornar a falta de provedor: a falha é fechada.
- Nenhum token (verificação, reset, convite, magic link) é consumido em GET: a página
  renderiza e um botão faz a chamada.
- Respostas de cadastro, reenvio, reset e magic link nunca revelam se um e-mail existe.
- Permissões são validadas no servidor, com `requireAuth` + `requireTenant` +
  `requirePermission`; o cliente só esconde botões.

**Segurança**
- Toda rota privada da API usa `requireAuth` (`src/api/auth.ts`). O `ProtectedRoute`
  roda no cliente e não protege dados.
- Áreas autenticadas sem `loader` server-side com dados sensíveis; use TanStack Query
  e `apiFetch`.
- `VITE_*` vai para o navegador: só valores públicos.
- Segredos nunca são commitados; só `.env.example` é versionado, com valores de exemplo.
- Erro interno vai para `logError`, nunca `console.error` com dados pessoais.

**Contratos**
- Zod para entrada de API e formulários, com schema compartilhado em `src/lib/schemas/`.
- `meta` nativo para SEO; loaders server-side para dados públicos indexáveis.

## Fluxo de trabalho

1. **PRD/spec:** feature relevante começa em `docs/specs/<feature>/`, antes do código
   (`/prd`, `/spec`). Método completo: `docs/context/ai-engineering.md`.
2. **Plano:** defina onde entra (pública SSR, API Hono, `/app`, `/admin` ou `/portal`).
3. **Implementação:** mudanças pequenas e cirúrgicas, verificáveis por etapa.
4. **Verificação:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`
   (com o Postgres do Docker) e `npm run build`.
5. **`/code-review`:** revisão antes de entregar; `/security-review` em auth, tenant,
   billing e webhooks.

## Regra de contexto vivo

Mudança de código em um domínio exige atualizar, no mesmo trabalho, o arquivo
correspondente em `docs/context/`. Se surgir um arquivo ou uma responsabilidade
nova, atualize também `docs/context/INDEX.md`. Se os paths do domínio mudarem,
atualize as rules. Se afetar onboarding, atualize `README.md`. Se afetar decisões
futuras de agentes, atualize as rules em `.claude/rules/` e `.cursor/rules/`.
