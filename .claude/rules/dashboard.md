---
paths:
  - "src/routes/dashboard*.tsx"
  - "src/pages/dashboard-page.tsx"
  - "src/components/layout/dashboard-*.tsx"
  - "src/lib/constants/dashboard-nav.ts"
  - "src/components/auth/protected-route.tsx"
---

# Área autenticada client-only em /dashboard

- Sem `loader` server-side com dados sensíveis.
- Nenhum dado do usuário pode ser serializado no HTML inicial.
- `ProtectedRoute` faz o gate de autenticação no cliente.
- Busque dados no cliente com TanStack Query.
- Mantenha o layout responsivo: sidebar colapsável no desktop e `Sheet` no mobile.

Para entender este domínio, leia: docs/context/tech/11-dashboard.md
