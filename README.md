# my-web-portal

Boilerplate **Vite + React + shadcn/ui** no frontend, **Drizzle + Postgres próprio** na API, **Supabase** para Auth e Storage.

## Arquitetura

```
Browser (Vite + shadcn/ui)
    │  VITE_SUPABASE_*  →  Supabase Auth / Storage
    │  /api/*           →  Hono API (porta 3001)
    └────────────────────→  Drizzle → seu Postgres
```

## Stack

- Vite + React + TypeScript + React Router
- shadcn/ui (Tailwind v4)
- Hono API + Drizzle ORM + postgres.js
- Supabase Auth + Storage (client-side)

## Começar

```bash
npm install
cp .env.example .env.local
docker compose up -d          # Postgres local (opcional)
npm run db:migrate            # schema Drizzle
npm run dev                   # Vite :5173 + API :3001
```

## Variáveis

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Drizzle (API) |
| `VITE_SUPABASE_URL` | Auth/Storage (frontend) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Auth/Storage (frontend) |

## shadcn/ui

```bash
npx shadcn@latest add dialog dropdown-menu avatar
```

Componentes ficam em `src/components/ui/`.

## Scripts

```bash
npm run dev          # frontend + API
npm run dev:client   # só Vite
npm run dev:server   # só Hono
npm run build        # build frontend
npm run db:migrate   # migrations Drizzle
npm run db:studio    # Drizzle Studio
```

## Estrutura

```
src/
  components/ui/     # shadcn/ui
  pages/             # rotas React
  lib/supabase/      # Auth + Storage
  db/                # schema Drizzle
server/              # API Hono
drizzle/             # migrations
```
