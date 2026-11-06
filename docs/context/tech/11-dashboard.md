# Áreas autenticadas (/app e /admin)

- **Escopo:** Layout, rotas e estado atual da área autenticada do owner e da equipe (`/app`). A área da plataforma (`/admin`) está em `tech/22-admin.md`.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-rotas-api.md`, `spec-tenant-rbac.md`
- **Paths do código:** `src/components/app/`, `src/components/admin/`, `src/components/auth/can.tsx`, `src/lib/constants/app-nav.ts`, `src/lib/constants/admin-nav.ts`, `src/lib/constants/permission-labels.ts`, `src/providers/auth-provider.tsx`, `src/pages/dashboard-page.tsx`, `src/pages/onboarding-page.tsx`, `src/pages/team-page.tsx`, `src/routes/app.tsx`, `src/routes/app.onboarding.tsx`, `src/routes/app.team.tsx`, `src/routes/app.settings.tsx`, `src/routes/app.coming-soon.tsx`

## Rotas

| Rota | Estado |
|---|---|
| `/app` | visão geral com `AccountCard` e cards de clientes, equipe e assinatura |
| `/app/clientes` | em breve (fase 8) |
| `/app/onboarding` | criação do tenant e convites abertos; fora do layout com sidebar |
| `/app/equipe` | membros, convites, reenvio, revogação, troca de papel e remoção |
| `/app/assinatura` | plano e estado, escolha de plano e método por capacidades, perfil de faturamento, cancelar, pausar, portal e faturas recentes |
| `/app/assinatura/faturas` | histórico, com link para a fatura no provedor |
| `/app/assinatura/retorno` | volta do checkout: consulta o estado local, nunca a query string |
| `/app/configuracoes` | organização, papéis personalizados (só owner) e troca de e-mail |

`/admin/**` (proprietário e suporte da plataforma, `tech/22-admin.md`) reaproveita o mesmo
shell com outro menu; `/portal/**` (fase 8) seguirá o mesmo modelo.

## Estado atual

- Layout responsivo inspirado no `shadcn-admin`: sidebar fixa e colapsável no desktop;
  topbar com hambúrguer e `Sheet` no mobile.
- Shell e telas em `src/components/app/`. O seletor de tenant (`TenantSwitcher`) fica na
  sidebar e no menu mobile.
- `AppLayout` espera `/api/me`: sem tenant, manda a `/app/onboarding`. É só o caminho da
  interface; quem barra os dados é `requireTenant`.
- `useAuth()` expõe `tenant`, `tenants`, `permissions`, `billing`, `features`, `limits`,
  `reloadAccount` e `switchTenant`.
- `BillingBanner` (topo de `/app`) avisa do fim do trial, do pagamento pendente e do modo somente
  leitura, com link para `/app/assinatura`; só informa, a API é quem bloqueia. O cartão "Assinatura" da visão geral mostra o plano e os dias restantes.
- `AppSidebar`, `AppNav` e `AppTopbar` recebem o menu por props (`nav`, `header`, `subtitle`); o
  `AdminLayout` passa o de `admin-nav.ts`.
- `<Can resource action>` e `useCan()` escondem ações; item de menu usa `permission` em
  `app-nav.ts`. A regra vale na API.
- Sem `loader` de servidor; dados buscados no cliente via TanStack Query. Cobrança em
  `src/components/app/billing/`, com `useBillingMutation`, que também relê `/api/me`.
- `AccountCard` (`src/components/app/account-card.tsx`) é o exemplo de dados
  privados: `useQuery` + `apiFetch` -> `GET /api/me` -> `requireAuth` -> Drizzle.
- Navegação em `src/lib/constants/app-nav.ts`; tela nova entra lá e em
  `src/routes.ts`.
