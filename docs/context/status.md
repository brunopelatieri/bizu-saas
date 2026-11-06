# Status do projeto

- **Escopo:** O que está pronto hoje e pendências técnicas conhecidas.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/lib/content/posts.ts`, `src/root.tsx`

<!-- ORIGEM: AI_CONTEXT.md L94-110 -->
## Status Atual

- Demo em [https://bizu.bru.ia.br](https://bizu.bru.ia.br) — hospedada na **Vercel**.
- Repositório principal (este): **VPS + Docker + Node único** (`react-router-hono-server` + Hono + SSR).
- Repositório Vercel (arquitetura otimizada para demo/serverless): [bizu-saas-vercel](https://github.com/brunopelatieri/bizu-saas-vercel).
- React Router Framework Mode com `ssr: true`.
- Hono integrado via `react-router-hono-server`.
- Blog SSR com fonte estática em `src/lib/content/posts.ts`.
- Dashboard inicial protegido no cliente, com sidebar responsiva (desktop colapsável + Sheet mobile).
- Header público responsivo (`SiteHeader`): nav inline no desktop (≥md), hamburger + Sheet no mobile.
- Login/Cadastro premium (`/login`) com Tabs, react-hook-form + Zod e feedback via Sonner.
- TanStack Query Provider ativo em `src/root.tsx` (`QueryProvider`, instância SSR-safe via `useState`).
- shadcn/ui expandido: `dialog`, `dropdown-menu`, `sheet`, `table`, `form`, `select`, `skeleton`, `tooltip`, `avatar`.
- Tema dark/light com Zustand e script anti-flash.
- Sonner montado globalmente.
- Autenticação sem provedor: login e dashboard bloqueados, com ponto único de integração.
- `/api/contact` com rate limit, limite de corpo e headers de segurança.
- Drizzle aceita qualquer Postgres, inclusive por pooler com `?prepare=false`.
- Biome, Vitest e CI no GitHub Actions.
- Dockerfile multi-stage para VPS.

<!-- ORIGEM: AI_CONTEXT.md L111-115 -->
## Pendências Técnicas Conhecidas

- Escolher e integrar o provedor de autenticação.
- Evoluir blog estático para tabela Drizzle quando virar feature real.
- Migrar para React Router 8 e `react-router-hono-server` 4 para zerar os alertas moderados restantes (`tech/16-bugs-riscos.md`).
- Criar schemas compartilhados adicionais conforme novos forms/APIs surgirem.
- Criar stack Portainer completa para app + Postgres + reverse proxy.
