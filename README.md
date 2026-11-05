# Bizu SaaS

**Bizu SaaS** é um boilerplate full-stack para começar projetos web rápido, com base robusta, documentação viva e fluxo pensado para desenvolvimento com **AI Software Engineering**.

Ele serve para criar SaaS, portais de clientes, sites institucionais, landing pages, blogs, dashboards/admin e sistemas web de aplicação sem começar do zero.

---

## 📋 Índice

- [Bizu SaaS](#bizu-saas)
  - [📋 Índice](#-índice)
  - [Demo](#demo)
  - [O Que Vem Pronto](#o-que-vem-pronto)
  - [Resumo Técnico 80/20](#resumo-técnico-8020)
  - [Metodologia Sugerida](#metodologia-sugerida)
  - [Como Clonar e Rodar](#como-clonar-e-rodar)
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
- Login com Supabase Auth e dashboard/admin client-side
- API Hono no mesmo processo Node do SSR
- Postgres próprio via Drizzle ORM
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
  |-- /login              Supabase Auth
  `-- /dashboard/**       client-side, sem loader sensível no servidor
```

**Stack principal:** React 19, TypeScript, React Router v7, Vite, Tailwind v4, shadcn/ui, Hono, Drizzle, Postgres, Supabase Auth/Storage, Zod, Zustand, TanStack Query, React Hook Form, Stripe, Nodemailer e Docker.

---

## Metodologia Sugerida

Este template foi pensado para trabalhar com humanos e agentes de IA no mesmo fluxo. A ideia é aplicar **AI Software Engineering**: PRD/spec antes do código, contexto enxuto carregado sob demanda e decisões importantes documentadas.

```text
PRD -> SPEC -> implementação -> typecheck + build -> /code-review -> atualizar contexto
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
| `/ctx-banco-drizzle`, `/ctx-supabase-auth`, `/ctx-api-hono`, `/ctx-dashboard`, `/ctx-infra-deploy` | Carregam o contexto do domínio |
| `/context-budget` | Mede o contexto sempre carregado |

> **Regra prática:** mudou código em um domínio? Atualize o arquivo correspondente em `docs/context/` no mesmo trabalho. O método completo, incluindo escolha de modelo e como adaptar o template a um novo projeto, está em `docs/context/ai-engineering.md`.

---

## Como Clonar e Rodar

```bash
git clone https://github.com/brunopelatieri/bizu-saas.git
cd bizu-saas

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
| `VITE_SUPABASE_URL` | URL pública do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública do Supabase |

Em imagem Docker, as variáveis `VITE_*` entram no build, não em runtime:

```bash
docker build -t bizu-saas \
  --build-arg VITE_SUPABASE_URL=https://your-project-ref.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key .
```

---

## Scripts Úteis

```bash
npm run dev          # dev server: React Router + Hono
npm run build        # build de produção
npm run start        # roda build/server/index.js
npm run typecheck    # typegen + TypeScript
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