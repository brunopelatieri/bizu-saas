# Visão geral

- **Escopo:** Proposta do template, arquitetura e decisão de SSR com áreas autenticadas client-only.
- **Specs relacionadas:** `docs/specs/saas-foundation/`
- **Paths do código:** `src/routes.ts`, `src/server.ts`, `src/api/app.ts`

## Proposta do template

Starter full-stack opinativo para SaaS, com:

- Landing page, página de preços (fase 5) e blog com SSR e Open Graph.
- Autenticação própria sobre Postgres (Better Auth), com verificação de e-mail.
- Multi-tenant com RLS, papéis por tenant e portal do cliente.
- Planos, trial, assinaturas e pagamentos em módulos.
- API Hono no mesmo processo Node do servidor SSR.
- Drizzle ORM em qualquer Postgres.
- Base visual shadcn/ui + Tailwind v4.
- Deploy em VPS própria com Docker.

## Arquitetura atual

```text
Node process único: react-router-hono-server
  |
  |-- /api/*                    Hono API
  |     |-- GET  /api/health
  |     |-- GET  /api/me        requireAuth (sessão do Better Auth)
  |     `-- POST /api/contact   rate limit + Zod -> Drizzle
  |
  |-- /                         React Router Framework Mode + SSR
  |-- /sobre, /projetos, /contato
  |-- /blog, /blog/:slug        SSR + loader + meta Open Graph dinâmica
  |
  |-- /login                    auth standalone, noindex
  |
  `-- /app/**                   shell SSR sem loader de servidor;
                                dados e gate de auth no cliente
                                (/admin e /portal seguem o mesmo modelo)
```

## Decisão importante: SSR e áreas autenticadas

O React Router não tem flag de SSR por rota. O `ssr` em `react-router.config.ts` é
global. A estratégia adotada é:

- `ssr: true` global.
- Rotas públicas usam SSR real para SEO e Open Graph.
- `/app`, `/admin` e `/portal` não possuem `loader` de servidor.
- `ProtectedRoute` faz o gate de autenticação no cliente.
- Nenhum dado sensível do usuário é serializado no HTML inicial.

Isso entrega páginas públicas indexáveis e áreas logadas simples, client-side e sem
exposição de dados no SSR.
