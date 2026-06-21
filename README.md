# Bizu SaaS

**Bizu SaaS** é um boilerplate full-stack para começar projetos web rápido, com
base robusta, documentação viva e fluxo pensado para desenvolvimento com
**AI Software Engineering**.

Ele serve para criar SaaS, portais de clientes, sites institucionais, landing
pages, blogs, dashboards/admin e sistemas web de aplicação sem começar do zero.

## Demo

**URL:** [https://bizu.bru.ia.br](https://bizu.bru.ia.br)

> **Nota sobre deploy:** este repositório é focado em **VPS + Docker + Node único**
> (`react-router-hono-server` + Hono + SSR). A demo pública roda na **Vercel** e
> exigiu **adaptações de arquitetura** (modelo serverless, não o stack
> plug-and-play deste repo).
>
> O caminho natural deste template é **VPS/Docker**. Use a demo como referência
> visual; para a arquitetura otimizada para Vercel, veja o repositório dedicado:
> [github.com/brunopelatieri/bizu-saas-vercel](https://github.com/brunopelatieri/bizu-saas-vercel)

## O Que Vem Pronto

- Landing page responsiva, blog com SSR, páginas públicas e meta tags.
- Login com Supabase Auth e dashboard/admin client-side.
- API Hono no mesmo processo Node do SSR.
- Postgres próprio via Drizzle ORM.
- Base visual com shadcn/ui, Tailwind v4, tema claro/escuro e componentes prontos.
- Estrutura de contexto para agentes de IA entenderem o projeto antes de mexer.
- Docker preparado para VPS Ubuntu + Docker + Portainer.

## Resumo Técnico 80/20

```text
React Router v7 Framework Mode + SSR global
  |
  |-- /api/*              Hono API -> Drizzle -> Postgres
  |-- /, /sobre, /blog    rotas públicas com SSR e SEO
  |-- /login              Supabase Auth
  `-- /dashboard/**       client-side, sem loader sensível no servidor
```

Stack principal: **React 19**, **TypeScript**, **React Router v7**, **Vite**,
**Tailwind v4**, **shadcn/ui**, **Hono**, **Drizzle**, **Postgres**, **Supabase
Auth/Storage**, **Zod**, **Zustand**, **TanStack Query**, **React Hook Form**,
**Stripe**, **Nodemailer** e **Docker**.

## Metodologia Sugerida

Este template foi pensado para trabalhar com humanos e agentes de IA no mesmo
fluxo. A ideia é aplicar **AI Software Engineering**: especificar antes de
implementar, manter contexto técnico vivo e deixar decisões importantes
documentadas.

Antes de pedir mudanças para uma IA ou abrir uma feature relevante, leia primeiro:

- `AI_CONTEXT.md` — visão rápida e regras de atualização de contexto.
- `PROJECT_TECHNICAL_SPEC.md` — especificação técnica completa.
- `MIGRATION_NOTES.md` — decisões da migração para React Router Framework Mode.
- `.specify/memory/constitution.md` — princípios de desenvolvimento SpecifyX.

Regra prática: use o `AI_CONTEXT.md` para entender o projeto em poucos minutos e
o `PROJECT_TECHNICAL_SPEC.md` quando precisar mexer em arquitetura, rotas,
deploy, banco ou autenticação.

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

O **`drizzle-kit`** já está em `devDependencies`. Depois do `npm install`, os
scripts `npm run db:migrate`, `db:generate` e `db:studio` usam o binário local
automaticamente — **não instale globalmente** (`npm i -g drizzle-kit`).

Ordem recomendada na primeira execução:

1. `npm install` — instala dependências + `drizzle-kit`
2. `cp .env.example .env.local` — URLs em `localhost:15432` (porta do Docker no Windows)
3. `docker compose up -d` — sobe o Postgres
4. `npm run db:migrate` — aplica migrations em `drizzle/`
5. `npm run dev`

**Se `db:migrate` falhar:**

- **`drizzle-kit` não encontrado** — rode `npm install` antes do migrate.
- **Erro de conexão** — confira se o Postgres está up (`docker compose ps`) e se
  `.env.local` existe com `DATABASE_URL` / `DIRECT_URL` apontando para
  `localhost:15432` (não `5432`; no Windows a porta 5432 costuma estar reservada).

Servidor de produção local:

```bash
npm run build
npm run start
```

Por padrão, o `start` usa `PORT=3000`.

## Variáveis Principais

- `DATABASE_URL` — conexão runtime com Postgres.
- `DIRECT_URL` — conexão usada pelo Drizzle Kit/migrations.
- `PORT` — porta do servidor único em produção.
- `VITE_SUPABASE_URL` — URL pública do projeto Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — chave pública do Supabase.

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

## Documentação

- `AI_CONTEXT.md` — o que faz, para quem é e como agentes devem se orientar.
- `PROJECT_TECHNICAL_SPEC.md` — arquitetura, stack, rotas, deploy e decisões.
- `MIGRATION_NOTES.md` — histórico técnico da migração para SSR + Hono.
- `.cursor/rules/` — regras persistentes para agentes no Cursor.

## Autor

**Bruno Pelatieri Goulart**  
Enterprise Automation Architect • AI • DevOps • n8n Specialist
