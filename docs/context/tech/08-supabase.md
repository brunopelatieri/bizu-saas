# Supabase

- **Escopo:** Usos permitidos e proibidos do Supabase, e fluxo de autenticação.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/lib/schemas/auth.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/config.ts`, `src/lib/supabase/functions.ts`, `src/lib/supabase/realtime.ts`, `src/lib/supabase/storage.ts`, `src/providers/auth-provider.tsx`, `src/providers/query-provider.tsx`

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L319-358 -->
## 8. Supabase

Arquivos:

- `src/lib/supabase/client.ts`
- `src/lib/supabase/config.ts`
- `src/lib/supabase/storage.ts`
- `src/lib/supabase/functions.ts`
- `src/lib/supabase/realtime.ts`
- `src/providers/auth-provider.tsx`
- `src/providers/query-provider.tsx`

Uso permitido:

- Auth.
- Storage.
- Edge Functions.
- Realtime broadcast/presence.

Uso proibido pelo projeto:

- Banco principal.
- CRUD via `supabase.from()`.
- Migrations/schema de dados da aplicacao.
- Realtime `postgres_changes` para tabelas da app.

Autenticacao atual:

- `AuthProvider` roda no cliente.
- Usa `supabase.auth.getUser()`.
- Escuta `onAuthStateChange`.
- `ProtectedRoute` protege `/dashboard/**` no cliente.
- `/login`: UI premium dark (Engineering AI Design), Tabs Login/Cadastro.
- Cadastro exige Nome, E-mail e Telefone Celular (`react-hook-form` + Zod em
  `src/lib/schemas/auth.ts`); metadados enviados ao Supabase Auth (`full_name`,
  `phone`).
- Feedback de sucesso/erro via Sonner.

---

