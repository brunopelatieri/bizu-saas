---
paths:
  - "src/lib/supabase/**"
  - "src/lib/auth/**"
  - "src/lib/schemas/auth.ts"
  - "src/providers/auth-provider.tsx"
  - "src/components/auth/**"
  - "src/routes/login.tsx"
  - "src/routes/auth-callback.tsx"
  - "src/pages/login-page.tsx"
  - "src/pages/auth-callback-page.tsx"
  - "supabase/**"
---

# Supabase para Auth, Storage, Edge Functions e Realtime

Supabase cuida de Auth e serviços. Dados da aplicação passam sempre pelo Drizzle.

**Usar para:**
- Auth no cliente: `AuthProvider` em `src/providers/auth-provider.tsx`.
- Auth no servidor: `requireAuth` em `src/api/auth.ts`, que valida o token.
- Storage: `src/lib/supabase/storage.ts`.
- Edge Functions: `invokeFunction()` em `src/lib/supabase/functions.ts`.
- Realtime broadcast/presence: `src/lib/supabase/realtime.ts`.

**Não usar para:**
- Tabelas ou CRUD da aplicação (`supabase.from()`).
- Schema ou migrations de dados fora do Drizzle.
- Realtime `postgres_changes` em tabelas da aplicação.

**Configuração:**
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, vistas pelo cliente.
- Use `isSupabaseConfigured()` antes de features opcionais.
- `user_metadata` é editável pelo usuário: nunca use para permissões.
- Permissões são validadas no servidor (`requireAuth` + checks), não por RLS.

Para entender este domínio, leia: docs/context/tech/08-supabase.md
