---
paths:
  - "src/routes/app*.tsx"
  - "src/routes/admin*.tsx"
  - "src/routes/portal*.tsx"
  - "src/components/app/**"
  - "src/lib/api/**"
  - "src/pages/dashboard-page.tsx"
  - "src/pages/onboarding-page.tsx"
  - "src/pages/team-page.tsx"
  - "src/lib/constants/app-nav.ts"
  - "src/lib/constants/permission-labels.ts"
  - "src/components/auth/can.tsx"
  - "src/components/auth/protected-route.tsx"
---

# Áreas autenticadas client-only: /app, /admin e /portal

- Sem `loader` server-side com dados sensíveis.
- Nenhum dado do usuário pode ser serializado no HTML inicial.
- `ProtectedRoute` faz o gate de autenticação no cliente.
- Busque dados no cliente com TanStack Query e `apiFetch`; siga `AccountCard` como exemplo.
- O gate do cliente não protege dados: o endpoint usa `requireAuth` (+ `requireTenant`,
  `requirePermission` ou `requirePlatform`).
- Esconder um botão por permissão é conveniência (`<Can>`, `useCan()`); a regra vale no servidor.
- Tenant ativo, tenants e permissões vêm de `useAuth()`, que lê `GET /api/me`. Nada na URL identifica o tenant.
- Mantenha o layout responsivo: sidebar colapsável no desktop e `Sheet` no mobile.

Para entender este domínio, leia: docs/context/tech/11-dashboard.md
