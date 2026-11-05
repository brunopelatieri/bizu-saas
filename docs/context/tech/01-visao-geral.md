# Visão geral

- **Escopo:** Proposta do template, arquitetura e decisão de SSR com dashboard client-only.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L15-71 -->
## 1. Visao Geral

### Proposta do Template

O projeto e um starter full-stack opinativo para projetos pequenos e medios que
nao sao SaaS, mas precisam de site publico, area de login e dashboard, com:

- Landing page pronta e responsiva.
- Blog com SSR e meta tags/Open Graph.
- Area de login com Supabase Auth.
- Dashboard/admin inicial com layout, sidebar e rotas placeholder.
- API Hono no mesmo processo Node do servidor SSR.
- Drizzle ORM em qualquer Postgres: local, VPS ou o do Supabase.
- Supabase apenas como servico auxiliar para Auth, Storage, Edge Functions e
  Realtime broadcast/presence.
- Base visual shadcn/ui + Tailwind v4 com tema inspirado no `shadcn-admin`.
- Deploy planejado para VPS propria com Docker e Portainer.

### Arquitetura Atual

```text
Node process unico: react-router-hono-server
  |
  |-- /api/*                    Hono API
  |     |-- GET  /api/health
  |     |-- GET  /api/me        requireAuth -> profiles (Drizzle)
  |     `-- POST /api/contact   rate limit + Zod -> Drizzle
  |
  |-- /                         React Router Framework Mode + SSR
  |-- /sobre                    SSR
  |-- /projetos                 SSR
  |-- /contato                  SSR + form client-side chamando /api/contact
  |-- /blog                     SSR + loader
  |-- /blog/:slug               SSR + loader + meta Open Graph dinamica
  |
  |-- /login                    auth standalone, noindex
  |-- /auth/callback            callback Supabase, noindex
  |
  `-- /dashboard/**             shell SSR sem loader de servidor;
                                dados e gate de auth no cliente
```

### Decisao Importante: SSR e Dashboard

O React Router v7 nao tem flag de SSR por rota. O `ssr` em
`react-router.config.ts` e global. A estrategia adotada e:

- `ssr: true` global.
- Rotas publicas usam SSR real para SEO e Open Graph.
- Dashboard nao possui `loader` de servidor.
- `ProtectedRoute` faz o gate de autenticacao no cliente.
- Nenhum dado sensivel do usuario e serializado no HTML inicial.

Isso entrega o beneficio pratico desejado: paginas publicas indexaveis e area
logada simples, client-side e sem exposicao de dados no SSR.

---

