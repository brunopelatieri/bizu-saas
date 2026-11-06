# Área do tenant (/app)

- **Escopo:** Layout, rotas e estado atual da área autenticada do owner e da equipe.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-rotas-api.md`, `spec-tenant-rbac.md`
- **Paths do código:** `src/components/app/`, `src/components/auth/can.tsx`, `src/lib/constants/app-nav.ts`, `src/lib/constants/permission-labels.ts`, `src/providers/auth-provider.tsx`, `src/pages/dashboard-page.tsx`, `src/pages/onboarding-page.tsx`, `src/pages/team-page.tsx`, `src/routes/app.tsx`, `src/routes/app.onboarding.tsx`, `src/routes/app.team.tsx`, `src/routes/app.settings.tsx`, `src/routes/app.coming-soon.tsx`

## Rotas

| Rota | Estado |
|---|---|
| `/app` | visão geral com `AccountCard` e cards de clientes, equipe e assinatura |
| `/app/clientes` | em breve (fase 8) |
| `/app/onboarding` | criação do tenant e convites abertos; fora do layout com sidebar |
| `/app/equipe` | membros, convites, reenvio, revogação, troca de papel e remoção |
| `/app/assinatura` | em breve (fase 6) |
| `/app/configuracoes` | organização, papéis personalizados (só owner) e troca de e-mail |

`/admin/**` (fase 5) e `/portal/**` (fase 8) seguem o mesmo modelo, com navegação
própria.

## Estado atual

- Layout responsivo inspirado no `shadcn-admin`: sidebar fixa e colapsável no desktop;
  topbar com hambúrguer e `Sheet` no mobile.
- Shell e telas em `src/components/app/`. O seletor de tenant (`TenantSwitcher`) fica na
  sidebar e no menu mobile.
- `AppLayout` espera `/api/me`: sem tenant, manda a `/app/onboarding`. É só o caminho da
  interface; quem barra os dados é `requireTenant`.
- `useAuth()` expõe `tenant`, `tenants`, `permissions`, `reloadAccount` e `switchTenant`.
- `<Can resource action>` e `useCan()` escondem ações; item de menu usa `permission` em
  `app-nav.ts`. A regra vale na API.
- Sem `loader` de servidor; dados buscados no cliente via TanStack Query.
- `AccountCard` (`src/components/app/account-card.tsx`) é o exemplo de dados
  privados: `useQuery` + `apiFetch` -> `GET /api/me` -> `requireAuth` -> Drizzle.
- Navegação em `src/lib/constants/app-nav.ts`; tela nova entra lá e em
  `src/routes.ts`.
