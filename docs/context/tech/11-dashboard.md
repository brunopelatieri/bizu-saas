# Área do tenant (/app)

- **Escopo:** Layout, rotas e estado atual da área autenticada do owner e da equipe.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-rotas-api.md`, `spec-tenant-rbac.md`
- **Paths do código:** `src/components/layout/dashboard-layout.tsx`, `src/components/layout/dashboard-nav.tsx`, `src/components/layout/dashboard-sidebar.tsx`, `src/components/layout/dashboard-topbar.tsx`, `src/components/layout/dashboard-user-menu.tsx`, `src/lib/constants/dashboard-nav.ts`, `src/pages/dashboard-page.tsx`, `src/routes/app.coming-soon.tsx`, `src/routes/app.tsx`, `src/routes/app.settings.tsx`

## Rotas

| Rota | Estado |
|---|---|
| `/app` | visão geral com `AccountCard` e cards de clientes, equipe e assinatura |
| `/app/clientes` | em breve (fase 8) |
| `/app/equipe` | em breve (fase 4) |
| `/app/assinatura` | em breve (fase 6) |
| `/app/configuracoes` | troca de e-mail (`ChangeEmailCard`); demais seções a partir da fase 4 |

`/admin/**` (fase 5) e `/portal/**` (fase 8) seguem o mesmo modelo, com navegação
própria.

## Estado atual

- Layout responsivo inspirado no `shadcn-admin`: sidebar fixa e colapsável no desktop;
  topbar com hambúrguer e `Sheet` no mobile.
- Componentes ainda com prefixo `dashboard-*`; a fase 4 os reorganiza em
  `src/components/app/` ao construir as telas reais.
- Sem `loader` de servidor; dados buscados no cliente via TanStack Query.
- `AccountCard` (`src/components/dashboard/account-card.tsx`) é o exemplo de dados
  privados: `useQuery` + `apiFetch` -> `GET /api/me` -> `requireAuth` -> Drizzle.
- Navegação em `src/lib/constants/dashboard-nav.ts`; tela nova entra lá e em
  `src/routes.ts`.
