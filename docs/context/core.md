# Núcleo do Bizu SaaS

- **Escopo:** Objetivo, arquitetura em alto nível, regras de decisão e manutenção do contexto.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/App.tsx`, `src/api/app.ts`, `src/main.tsx`, `src/server.ts`

## Como o agente atualiza o próprio contexto

**Quando:** no mesmo trabalho da mudança de código, antes do `/code-review`.

**Como:**

1. Localize no `docs/context/INDEX.md` o arquivo do domínio tocado.
2. Edite esse arquivo. Não crie resumo paralelo nem duplique regra em outro lugar.
3. Se o escopo mudou (arquivo novo, paths, responsabilidade), ajuste a linha do INDEX.
4. Se a decisão deve valer para agentes futuros, ajuste a rule do domínio.
5. Se um arquivo passar de ~300 linhas, divida-o e registre a divisão no INDEX.

**Níveis de contexto:**

| Nível | Conteúdo | Carregamento |
|---|---|---|
| Fixo | `CLAUDE.md`, INDEX e rules sem `paths:` | Toda sessão; mantenha abaixo de 400 linhas |
| Por escopo | Rules com `paths:`/`globs` | Ao tocar os arquivos cobertos |
| Sob demanda | `docs/context/**` e skills `ctx-*` | Quando a tarefa pede |
| Arquivo morto | `docs/context/archive/` | Só por pedido explícito |

**Leitura dos blocos abaixo:** eles foram movidos do `AI_CONTEXT.md` sem alteração.
Neles, "este arquivo" significa `docs/context/core.md`, e `PROJECT_TECHNICAL_SPEC.md`
significa os arquivos de `docs/context/tech/`. Em caso de conflito sobre onde
atualizar o contexto, vale a seção acima.

<!-- ORIGEM: AI_CONTEXT.md L6-22 -->
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

<!-- ORIGEM: AI_CONTEXT.md L30-47 -->
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

<!-- ORIGEM: AI_CONTEXT.md L48-59 -->
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

<!-- ORIGEM: AI_CONTEXT.md L60-75 -->
## Quando Atualizar Contexto

Atualize este arquivo e `PROJECT_TECHNICAL_SPEC.md` quando mudar:

- Arquitetura.
- Rotas.
- Stack ou dependências relevantes.
- Deploy/Docker/Portainer.
- Banco/schema.
- Regras de uso de Supabase.
- Estratégia de auth, billing, multi-tenant ou dashboard.
- Convenções de IA.

Se a mudança afetar onboarding, atualize também `README.md`.
Se a mudança afetar agentes/LLMs, atualize também `.cursor/rules/`.

