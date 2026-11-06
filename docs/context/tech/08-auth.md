# Autenticação

- **Escopo:** Estado da autenticação e como conectar um provedor.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/providers/auth-provider.tsx`, `src/api/auth.ts`, `src/lib/auth/types.ts`, `src/lib/schemas/auth.ts`, `src/components/auth/`

## Estado atual

O projeto **não tem provedor de autenticação**. Ninguém consegue entrar:

- `/login` mostra um aviso, e o formulário só aparece quando há provedor.
- `/app/**` redireciona para `/login`.
- Rotas privadas da API respondem 401 sem token e 503 com qualquer token.

## Pontos de integração

Um provedor novo entra em dois lugares:

| Lado | Arquivo | O que trocar |
|---|---|---|
| Cliente | `src/providers/auth-provider.tsx` | `noProvider`: `user`, `loading`, `available`, `signIn`, `signUp`, `signOut` |
| Servidor | `src/api/auth.ts` | `verifyToken`, que hoje sempre falha |

- `AuthUser` (`src/lib/auth/types.ts`) é o formato de usuário usado pela interface e pela API.
- Se o provedor usar cookies em vez de `Authorization: Bearer`, adapte `createRequireAuth`.
- A sessão e os usuários devem ficar no Postgres, via Drizzle.

## Regras

- `ProtectedRoute` faz o gate no cliente e não protege dados.
- Toda rota privada usa `authRateLimit` e `requireAuth`.
- Falha fechada: sem provedor ou com provedor indisponível, a rota não abre.
- `/login` usa Tabs Login/Cadastro, com `react-hook-form` e Zod em `src/lib/schemas/auth.ts`.
