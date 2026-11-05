# Dashboard/Admin

- **Escopo:** Layout, rotas e estado atual da área autenticada.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/components/layout/dashboard-layout.tsx`, `src/components/layout/dashboard-nav.tsx`, `src/components/layout/dashboard-sidebar.tsx`, `src/components/layout/dashboard-topbar.tsx`, `src/components/layout/dashboard-user-menu.tsx`, `src/lib/constants/dashboard-nav.ts`, `src/pages/dashboard-page.tsx`, `src/routes/dashboard.coming-soon.tsx`, `src/routes/dashboard.tsx`

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L459-492 -->
## 11. Dashboard/Admin

Arquivos:

- `src/components/layout/dashboard-layout.tsx`
- `src/components/layout/dashboard-sidebar.tsx`
- `src/components/layout/dashboard-topbar.tsx`
- `src/components/layout/dashboard-nav.tsx`
- `src/components/layout/dashboard-user-menu.tsx`
- `src/pages/dashboard-page.tsx`
- `src/routes/dashboard.tsx`
- `src/routes/dashboard.coming-soon.tsx`
- `src/lib/constants/dashboard-nav.ts`

Rotas:

- `/dashboard`
- `/dashboard/projetos`
- `/dashboard/clientes`
- `/dashboard/arquivos`
- `/dashboard/relatorios`
- `/dashboard/configuracoes`

Estado atual:

- Layout responsivo inspirado no `shadcn-admin`.
- Desktop: sidebar lateral fixa e colapsável, avatar/menu do usuário na base.
- Mobile: topbar fixa + hambúrguer abre `Sheet` com navegação.
- Dashboard inicial com cards zerados e quick actions.
- Subrotas estão como "Em breve".
- Sem `loader` de servidor; dados devem ser buscados no cliente via TanStack Query.
- `AccountCard` (`src/components/dashboard/account-card.tsx`) e o exemplo de dados
  privados: `useQuery` + `apiFetch` -> `GET /api/me` -> `requireAuth` -> Drizzle.

---

