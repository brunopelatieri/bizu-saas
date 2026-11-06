# Bizu Starter

**Bizu Starter** é o ponto de partida para projetos pequenos e médios que **não são SaaS**, mas precisam de site público, área de login e dashboard. Usa Drizzle em qualquer Postgres, com documentação viva e fluxo pensado para **AI Software Engineering**.

Serve para portais de clientes, áreas de membros, sites institucionais com painel, blogs com área administrativa e sistemas internos.

> **Não é para SaaS:** não traz multi-tenant, planos nem cobrança recorrente. A proposta é continuar simples para projetos com um único cliente ou organização.

---

## 📋 Índice

- [Bizu Starter](#bizu-starter)
  - [📋 Índice](#-índice)
  - [Demo](#demo)
  - [O Que Vem Pronto](#o-que-vem-pronto)
  - [Resumo Técnico 80/20](#resumo-técnico-8020)
  - [Metodologia Sugerida](#metodologia-sugerida)
  - [Como Clonar e Rodar](#como-clonar-e-rodar)
    - [Autenticação](#autenticação)
    - [Escolha do Postgres](#escolha-do-postgres)
    - [Banco local e Drizzle](#banco-local-e-drizzle)
  - [Variáveis Principais](#variáveis-principais)
  - [Scripts Úteis](#scripts-úteis)
  - [Documentação](#documentação)
  - [Autor](#autor)

---

## Demo

**URL:** [https://bizu.bru.ia.br](https://bizu.bru.ia.br)

> **Nota sobre deploy:** este repositório é focado em **VPS + Docker + Node único** (`react-router-hono-server` + Hono + SSR). A demo pública roda na **Vercel** e exigiu **adaptações de arquitetura** (modelo serverless, não o stack plug-and-play deste repo).
>
> O caminho natural deste template é **VPS/Docker**. Use a demo como referência visual; para a arquitetura otimizada para Vercel, veja o repositório dedicado: [github.com/brunopelatieri/bizu-saas-vercel](https://github.com/brunopelatieri/bizu-saas-vercel)

---

## O Que Vem Pronto

- Landing page responsiva, blog com SSR, páginas públicas e meta tags
- Telas de login e dashboard client-side, ainda sem provedor de autenticação
- API Hono no mesmo processo Node do SSR, com rotas privadas validadas no servidor
- Drizzle ORM em qualquer Postgres
- Rate limit, headers de segurança, lint, testes e CI
- Base visual com shadcn/ui, Tailwind v4, tema claro/escuro e componentes prontos
- Estrutura de contexto para agentes de IA entenderem o projeto antes de mexer
- Docker preparado para VPS Ubuntu + Docker + Portainer

---

## Resumo Técnico 80/20

```text
React Router v7 Framework Mode + SSR global
  |
  |-- /api/*              Hono API -> Drizzle -> Postgres
  |-- /, /sobre, /blog    rotas públicas com SSR e SEO
  |-- /login              autenticação (provedor a definir)
  `-- /dashboard/**       client-side, sem loader sensível no servidor
```

**Stack principal:** React 19, TypeScript, React Router v7, Vite, Tailwind v4, shadcn/ui, Hono, Drizzle, Postgres, Zod, Zustand, TanStack Query, React Hook Form, Biome, Vitest e Docker.

---

## Metodologia Sugerida

Este template foi pensado para trabalhar com humanos e agentes de IA no mesmo fluxo. A ideia é aplicar **AI Software Engineering**: PRD/spec antes do código, contexto enxuto carregado sob demanda e decisões importantes documentadas.

```text
PRD -> SPEC -> implementação -> lint + tipos + testes + build -> /code-review -> atualizar contexto
```

Em vez de carregar toda a documentação em cada sessão, o agente começa por um índice e abre só o que a tarefa pede. Isso reduz o consumo de tokens sem perder precisão:

| Nível | O que é | Quando carrega |
|---|---|---|
| Fixo | `CLAUDE.md` + `docs/context/INDEX.md` | Toda sessão |
| Por escopo | Rules em `.claude/rules/` e `.cursor/rules/` | Ao tocar os arquivos cobertos |
| Sob demanda | `docs/context/**` e skills `ctx-*` | Quando a tarefa pede |
| Arquivo morto | `docs/context/archive/` | Só por pedido explícito |

Comandos disponíveis no Claude Code:

| Comando | Função |
|---|---|
| `/prd <feature>` | Cria o PRD em `docs/specs/<feature>/` |
| `/spec <feature>` | Escreve a SPEC técnica a partir do PRD |
| `/ctx-banco-drizzle`, `/ctx-auth`, `/ctx-api-hono`, `/ctx-dashboard`, `/ctx-infra-deploy` | Carregam o contexto do domínio |
| `/context-budget` | Mede o contexto sempre carregado |

> **Regra prática:** mudou código em um domínio? Atualize o arquivo correspondente em `docs/context/` no mesmo trabalho. O método completo, incluindo escolha de modelo e como adaptar o template a um novo projeto, está em `docs/context/ai-engineering.md`.

---

## Como Clonar e Rodar

**Pré-requisitos:** Node.js 22 e Docker.

```bash
git clone https://github.com/brunopelatieri/bizu-starter.git
cd bizu-starter

npm install
cp .env.example .env.local

docker compose up -d          # Postgres na porta 15432
npm run db:migrate
npm run dev
```

App em desenvolvimento:

```text
http://localhost:5173
```

### Autenticação

O projeto ainda não tem provedor de autenticação, então login e dashboard ficam bloqueados. O site público funciona normalmente. Para conectar um provedor, veja `docs/context/tech/08-auth.md`.

### Escolha do Postgres

O Drizzle é a única camada de dados. Para trocar de banco, basta mudar `DATABASE_URL` e `DIRECT_URL`:

| Opção | Quando usar |
|---|---|
| Docker local | Desenvolvimento, já configurado no `.env.example` |
| VPS ou gerenciado | Projeto com infraestrutura própria |

Em pooler no modo transaction, como PgBouncer, adicione `?prepare=false` à `DATABASE_URL`.

### Banco local e Drizzle

O **`drizzle-kit`** já está em `devDependencies`. Depois do `npm install`, os scripts `npm run db:migrate`, `db:generate` e `db:studio` usam o binário local automaticamente — **não instale globalmente** (`npm i -g drizzle-kit`).

**Ordem recomendada na primeira execução:**

1. `npm install` — instala dependências + `drizzle-kit`
2. `cp .env.example .env.local` — URLs em `localhost:15432` (porta do Docker no Windows)
3. `docker compose up -d` — sobe o Postgres
4. `npm run db:migrate` — aplica migrations em `drizzle/`
5. `npm run dev`

**Se `db:migrate` falhar:**

| Problema | Solução |
|---|---|
| `drizzle-kit` não encontrado | Rode `npm install` antes do migrate |
| Erro de conexão | Confira se o Postgres está up (`docker compose ps`) e se `.env.local` existe com `DATABASE_URL` / `DIRECT_URL` apontando para `localhost:15432` (não `5432`; no Windows a porta 5432 costuma estar reservada) |

**Servidor de produção local:**

```bash
npm run build
npm run start
```

Por padrão, o `start` usa `PORT=3000`.

---

## Variáveis Principais

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Conexão runtime com Postgres |
| `DIRECT_URL` | Conexão usada pelo Drizzle Kit/migrations |
| `PORT` | Porta do servidor único em produção |
| `TRUSTED_PROXY_HOPS` | Quantidade de reverse proxies na frente do app; use `1` atrás de um proxy |

---

## Scripts Úteis

```bash
npm run dev          # dev server: React Router + Hono
npm run build        # build de produção
npm run start        # roda build/server/index.js
npm run lint         # lint com Biome
npm run typecheck    # typegen + TypeScript
npm test             # testes com Vitest
npm run db:generate  # gera migrations Drizzle
npm run db:migrate   # aplica migrations
npm run db:studio    # abre Drizzle Studio
```

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| `docs/context/INDEX.md` | Mapa de todo o contexto: ponto de partida para pessoas e agentes |
| `docs/context/core.md` | Objetivo, arquitetura e regras de decisão |
| `docs/context/receitas.md` | Passo a passo: marca, tabela, rota privada, tela e página nova |
| `docs/context/ai-engineering.md` | Método de trabalho, economia de tokens e adaptação do template |
| `docs/context/tech/` | Especificação técnica, um arquivo por seção |
| `docs/context/infra-deploy.md` | Topologia, credenciais e riscos de deploy |
| `docs/specs/` | Templates de PRD/SPEC e specs de features |
| `docs/context/archive/` | Histórico, incluindo as notas de migração para SSR + Hono |
| `.claude/rules/`, `.cursor/rules/` | Regras por domínio para agentes |
| `.claude/skills/` | Skills de contexto e de fluxo |

`AI_CONTEXT.md` e `PROJECT_TECHNICAL_SPEC.md` agora são stubs que apontam para `docs/context/`.

---

## Autor

**Bruno Pelatieri Goulart**
Enterprise Automation Architect • AI • DevOps • n8n Specialist