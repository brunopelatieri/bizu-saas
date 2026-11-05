# Migração para React Router v7 — Framework Mode (SSR)

Este documento descreve a migração do projeto de **React Router v7 em modo SPA
(Library Mode)** para o **Framework Mode** (que incorpora as capacidades do antigo
Remix), com **SSR nas rotas públicas** e **área autenticada client-side**,
servidos por um **único processo Node** (Hono + handler SSR do React Router).

---

## 1. Resumo do que mudou

| Antes | Depois |
|-------|--------|
| Vite SPA + `index.html` + `main.tsx` + `<BrowserRouter>` em `App.tsx` | Framework Mode com `react-router.config.ts`, `src/root.tsx` e `src/routes.ts` |
| 2 processos em dev (Vite :5173 + Hono :3001) com proxy `/api` | 1 processo só (`react-router dev`), Hono montado dentro do servidor SSR |
| Sem SSR (crawlers não viam conteúdo) | SSR em runtime nas rotas públicas (`/`, `/blog`, `/blog/:slug`, etc.) |
| SEO/Open Graph inexistentes | `meta` nativa por rota, incluindo OG dinâmico por post |
| API Hono em `server/` iniciada por `@hono/node-server` | API Hono em `src/api/app.ts`, montada via `react-router-hono-server` |

> **Importante sobre "SSR por rota":** o React Router v7 **não** possui flag de
> SSR por rota. O flag `ssr` em `react-router.config.ts` é **global**. Para
> manter a área autenticada como SPA, as rotas `/dashboard/**` simplesmente
> **não têm `loader` de servidor** — o `ProtectedRoute` faz o gate no cliente e
> os dados são buscados no browser (Supabase). O shell do dashboard até passa
> pelo SSR (apenas o markup do layout), mas **nenhum dado sensível é
> serializado no HTML inicial**, que é exatamente o objetivo.

---

## 2. Decisões tomadas

1. **`ssr: true` global + dashboard client-only.** Atende SEO nas públicas e
   mantém a área logada sem SSR de dados (sem hidratação de dados sensíveis).
2. **Integração via `react-router-hono-server`.** Helper maduro e mantido que
   roda em dev e produção, serve os assets e delega o SSR ao React Router —
   tudo em um processo só (ideal para VPS + Docker).
3. **Blog estático por enquanto.** O conteúdo vive em `src/lib/content/posts.ts`.
   Os `loader`s já leem dele; quando o blog for para o banco, basta trocar o
   corpo de `getAllPosts`/`getPostBySlug` por queries Drizzle — a assinatura
   pública não muda e os loaders continuam acessando o banco **direto** (sem
   volta de rede HTTP), pois rodam no mesmo processo Node.

---

## 3. Arquivos criados

- `react-router.config.ts` — `appDirectory: "src"`, `ssr: true`.
- `src/root.tsx` — documento raiz (`<html>`, `<head>` com `<Meta/>`/`<Links/>`),
  fontes (Inter + Manrope), import do CSS, `AuthProvider`, `ErrorBoundary` (404).
- `src/routes.ts` — configuração de rotas (substitui o JSX `<Routes>`).
- `src/server.ts` — entry do servidor (`createHonoServer`), monta o `/api/*`.
- `src/api/app.ts` — app Hono com `/api/health` e `/api/contact` (Drizzle).
- `src/routes/*.tsx` — route modules com `export default` + `meta`:
  `home`, `about`, `projects`, `contact`, `login`, `auth-callback`,
  `dashboard`, `dashboard.coming-soon`, `blog`, `blog-post`.
- `src/lib/content/posts.ts` — fonte de dados do blog (estático por ora).
- `src/lib/constants/dashboard-nav.ts` — mapa de títulos do dashboard.
- `Dockerfile` + `.dockerignore` — build multi-stage para VPS.

## 4. Arquivos modificados

- `vite.config.ts` — plugins `reactRouterHonoServer()` + `reactRouter()` +
  `tailwindcss()`; **proxy `/api` removido** (mesma origem agora).
- `package.json` — scripts (`dev`/`build`/`start`/`typecheck`) e dependências.
- `tsconfig.app.json` — `rootDirs` + include de `.react-router/types`.
- `tsconfig.node.json` — include passa a apontar para os configs node-side.
- `src/components/layout/root-layout.tsx` e `.../dashboard-layout.tsx` e
  `src/components/auth/protected-route.tsx` — agora exportam `default`
  (usados como `layout()`/rota) e importam de `react-router`.
- `src/lib/constants/navigation.ts` — item "Blog" adicionado ao menu.
- Todos os imports `react-router-dom` → `react-router` (~14 arquivos).
- `src/components/landing/faq-section.tsx` — removida diretiva `"use client"`.

## 5. Arquivos removidos

- `index.html`, `src/main.tsx`, `src/App.tsx` (substituídos pelo Framework Mode).
- `server/main.ts`, `server/index.ts`, `server/routes/contact.ts`
  (lógica movida para `src/api/app.ts` + `src/server.ts`).

## 6. Dependências

**Adicionadas:** `@react-router/dev` (dev), `@react-router/node`,
`react-router` (principal), `react-router-hono-server`, `isbot`, `dotenv`.

**Removidas:** `react-router-dom` (substituído por `react-router`),
`concurrently` e `tsx` (não há mais 2 processos em dev).

---

## 7. CORS

O middleware de CORS foi **removido**: como o front e a API passam a ser
servidos pelo mesmo processo/origem, não há requisição cross-origin. Se um dia
a API for exposta a outra origem (ex.: app mobile), reintroduza o `cors()` do
Hono apenas nas rotas necessárias dentro de `src/api/app.ts`.

---

## 8. Comandos

```bash
# Desenvolvimento (1 processo: SSR + API + HMR)
npm run dev

# Type-check (gera tipos das rotas e roda tsc)
npm run typecheck

# Build de produção (gera build/client e build/server)
npm run build

# Rodar a build de produção localmente
# (NODE_ENV=production faz o server ignorar o .env.local e usar env do ambiente)
NODE_ENV=production PORT=3000 node build/server/index.js
# Windows PowerShell:
#   $env:NODE_ENV="production"; $env:PORT="3000"; node build/server/index.js
```

---

## 9. Passos manuais necessários

1. **Reinicie o dev server.** O script `dev` mudou (não usa mais `concurrently`).
   Pare o `npm run dev` antigo e rode novamente — agora é um processo só.
2. **Variáveis de ambiente.** Continuam as mesmas:
   - `DATABASE_URL` — usado pela API (Drizzle) em runtime.
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` — Auth/Storage no client.
   - `DIRECT_URL` — usado pelo `drizzle.config.ts` (migrations).
   - Em produção (Docker), injete `DATABASE_URL` (e `PORT`, opcional) no container.
3. **Não há mais `/api` proxy.** Chamadas `fetch("/api/...")` continuam iguais no
   código, mas agora resolvem no mesmo servidor (sem o proxy do Vite).
4. **Favicon:** como o `index.html` foi removido, se quiser um favicon adicione
   um `<link rel="icon">` no `links` de `src/root.tsx` e o arquivo em `public/`.

---

## 10. Deploy (VPS + Docker + Portainer)

Demo em **https://bizu.bru.ia.br** (Vercel). Repositório Vercel: **https://github.com/brunopelatieri/bizu-saas-vercel**. Este repo principal: VPS + Docker + Node único.

```bash
docker build -t bizu-saas .
docker run -d --name bizu-saas \
  -p 3000:3000 \
  -e DATABASE_URL="postgres://user:pass@host:5432/db" \
  -e NODE_ENV=production \
  bizu-saas
```

- O container expõe a porta **3000** (override via `-e PORT=...`).
- O `HEALTHCHECK` usa `GET /api/health`.
- O `docker-compose.yml` atual provê apenas o Postgres local para dev; em
  produção aponte `DATABASE_URL` para o seu Postgres gerenciado/registry.

---

## 11. Como evoluir

- **Blog no banco:** crie a tabela `posts` no schema Drizzle, gere a migration e
  troque o corpo de `getAllPosts`/`getPostBySlug` em `src/lib/content/posts.ts`
  por `getDb().select()...` (os loaders já chamam essas funções).
- **Proteção SSR por sessão:** se uma rota pública precisar saber se o usuário
  está logado no servidor (ex.: mudar um CTA), implemente leitura de sessão do
  Supabase dentro do `loader` daquela rota específica e comente o motivo.
- **Pré-render (SSG):** se quiser servir algumas páginas como estáticas, avalie
  o `prerender` no `react-router.config.ts` (cuidado: muda o trade-off de SSR).
