# Núcleo do Bizu SaaS

- **Escopo:** Objetivo, arquitetura em alto nível, regras de decisão e manutenção do contexto.
- **Specs relacionadas:** `docs/specs/saas-foundation/`
- **Paths do código:** `src/api/app.ts`, `src/server.ts`, `src/routes.ts`, `src/lib/env.ts`

## Como o agente atualiza o próprio contexto

**Quando:** no mesmo trabalho da mudança de código, antes do `/code-review`.

**Como:**

1. Localize no `docs/context/INDEX.md` o arquivo do domínio tocado.
2. Edite esse arquivo. Não crie resumo paralelo nem duplique regra em outro lugar.
3. Se surgiu um arquivo ou uma responsabilidade nova, ajuste o INDEX. Se os paths
   mudaram, ajuste as rules e o cabeçalho do arquivo.
4. Se a decisão deve valer para agentes futuros, ajuste a rule do domínio.
5. Se um arquivo passar de ~300 linhas, divida-o e registre a divisão no INDEX.

**Níveis de contexto:**

| Nível | Conteúdo | Carregamento |
|---|---|---|
| Fixo | `CLAUDE.md`, INDEX, rules sem `paths:` e descrições de skills | Toda sessão; mantenha abaixo de ~3 mil tokens |
| Por escopo | Rules com `paths:`/`globs` | Ao tocar os arquivos cobertos |
| Sob demanda | `docs/context/**` e skills `ctx-*` | Quando a tarefa pede |
| Arquivo morto | `docs/context/archive/` | Só por pedido explícito |

## Objetivo

Ponto de partida open source para qualquer SaaS. Quem clona, configura e roda tem um
sistema funcional com as áreas de login prontas e foca no domínio do produto.

Entrega planejada (ver `docs/specs/saas-foundation/prd.md`):

- Quatro níveis de login: proprietário da plataforma, owner do tenant, colaboradores
  com papéis configuráveis e clientes/leads com portal próprio.
- Multi-tenant com `tenant_id` na aplicação e Row Level Security no Postgres.
- Trial configurável pelo proprietário, planos, assinaturas e pagamentos em módulos
  (Stripe e Asaas primeiro; Mercado Pago, Pagar.me e PagBank sobre a mesma interface).
- Cobrança manual como padrão: sem módulo ativo, o proprietário marca em `/admin` quem pagou
  (`docs/specs/cobranca-manual/spec.md`).
- Verificação de e-mail por link, opcional (`EMAIL_VERIFICATION_REQUIRED`), e-mail transacional com provedor
  substituível e jobs no próprio Postgres.
- Portável: qualquer VPS com Docker e um Postgres, sem fornecedor obrigatório.

Fora do escopo: subdomínio por tenant, login social, API pública, nota fiscal e o
fluxo em que o owner cobra seus clientes (reservado como módulo futuro).

## Arquitetura

```text
React Router v8 Framework Mode (SSR global)
  |
  |-- Rotas públicas com SSR: /, /sobre, /projetos, /contato, /blog, /blog/:slug
  |-- Rotas de auth standalone: /login, /cadastro, /verificar-email, /esqueci-senha, /redefinir-senha
  |-- /app/**     owner e equipe do tenant, client-only
  |-- /admin/**   proprietário da plataforma, client-only (fase 5)
  `-- /portal/**  clientes e leads do tenant, client-only

Hono API no mesmo processo:
  |-- src/server.ts        valida env, monta a API e o SSR
  |-- src/api/app.ts       /api/* (health, me, contact; auth e webhooks nas fases seguintes)
  `-- src/lib/env.ts       variáveis validadas com Zod

Dados:
  |-- Drizzle ORM + postgres.js -> qualquer Postgres
  |-- bizu_owner (DIRECT_URL): migrations, seed, fila
  `-- bizu_app (DATABASE_URL): runtime, sem BYPASSRLS

Serviços locais (docker-compose.yml): Postgres 16 e Mailpit.
```

## Regras de Decisão

- Não reintroduzir `src/App.tsx`, `src/main.tsx`, `index.html` ou `server/` antigo.
- Não adicionar proxy `/api` no Vite; API e frontend compartilham origem.
- Toda rota privada da API usa `requireAuth`; rotas de tenant usam também
  `requireTenant` e `requirePermission`; rotas de plataforma, `requirePlatform`.
- Toda tabela de tenant tem `tenant_id`, `enableRLS()` e policy; toda query de tenant
  roda em `withTenant`.
- Autenticação com Better Auth em duas instâncias (equipe e portal): `tech/08-auth.md`.
- Nenhum token é consumido em GET; respostas nunca revelam se um e-mail existe.
- Não colocar dados sensíveis das áreas autenticadas em `loader` server-side.
- Use `meta` nativo do React Router para SEO/Open Graph.
- Use loaders server-side para dados públicos indexáveis (blog, preços).
- Use client-side fetching/TanStack Query nas áreas autenticadas.
- Use Zod para contratos de entrada de API e formulários.
- Use Drizzle migrations para mudanças de schema.
- Módulo opcional fica em pasta própria, registrado por variável de ambiente, e some
  ao apagar a pasta.
- Variáveis de ambiente passam por `src/lib/env.ts`; nova variável entra lá e no
  `.env.example`.

## Quando Atualizar Contexto

Atualize este arquivo e o arquivo do domínio em `docs/context/tech/` quando mudar:

- Arquitetura, rotas, stack ou dependências relevantes.
- Deploy, Docker, Portainer ou variáveis de ambiente.
- Banco, schema, papéis do Postgres ou RLS.
- Estratégia de auth, tenant, billing ou das áreas autenticadas.
- Convenções de IA.

Se a mudança afetar onboarding, atualize também `README.md`.
Se a mudança afetar agentes/LLMs, atualize `.claude/rules/` e `.cursor/rules/`.
