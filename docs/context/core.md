# Núcleo do Bizu Starter

- **Escopo:** Objetivo, arquitetura em alto nível, regras de decisão e manutenção do contexto.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/App.tsx`, `src/api/app.ts`, `src/main.tsx`, `src/server.ts`

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

**Leitura dos blocos abaixo:** vieram do antigo `AI_CONTEXT.md`. Neles, "este arquivo"
significa `docs/context/core.md`, e `PROJECT_TECHNICAL_SPEC.md` significa os arquivos
de `docs/context/tech/`. Em caso de conflito sobre onde atualizar o contexto, vale a
seção acima. As marcas `ORIGEM` em `docs/context/` indicam de onde cada bloco veio, no
commit `7de0d3c`; o texto evolui depois disso.

<!-- ORIGEM: AI_CONTEXT.md L6-22 -->
## Objetivo

Ponto de partida full-stack para projetos pequenos e médios que não são SaaS, mas
têm site público, área de login e dashboard. Usa metodologia de
**AI Software Engineering**: contexto explícito, decisões documentadas,
desenvolvimento guiado por especificação e stack moderna para entregar rápido.

Projetos-alvo:

- portal de clientes
- área de membros
- site institucional com painel
- blog com área administrativa
- sistemas internos e dashboards

Fora do escopo: SaaS multi-tenant, planos e cobrança recorrente.

<!-- ORIGEM: AI_CONTEXT.md L30-47 -->
## Arquitetura Atual

```text
React Router v7 Framework Mode (SSR global)
  |
  |-- Rotas públicas com SSR: /, /sobre, /projetos, /contato, /blog, /blog/:slug
  |-- Rota auth standalone: /login
  `-- Dashboard client-only por convenção: /dashboard/**

Hono API no mesmo processo:
  |-- src/server.ts
  `-- src/api/app.ts (/api/*)

Dados:
  `-- Drizzle ORM + postgres.js -> qualquer Postgres
```

<!-- ORIGEM: AI_CONTEXT.md L48-59 -->
## Regras de Decisão

- Não reintroduzir `src/App.tsx`, `src/main.tsx`, `index.html` ou `server/` antigo.
- Não adicionar proxy `/api` no Vite; API e frontend compartilham origem.
- Toda rota privada da API usa `requireAuth`.
- Autenticação ainda sem provedor: veja `tech/08-auth.md`.
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
- Regras de autenticação e de onde o Postgres pode rodar.
- Estratégia de auth ou dashboard.
- Convenções de IA.

Se a mudança afetar onboarding, atualize também `README.md`.
Se a mudança afetar agentes/LLMs, atualize também `.cursor/rules/`.

