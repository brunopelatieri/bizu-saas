---
paths:
  - "src/api/**"
  - "src/server.ts"
  - "src/lib/schemas/**"
---

# API Hono em processo único, com contratos Zod

- API em `src/api/app.ts`, montada por `src/server.ts`. Não recriar a pasta `server/`.
- Sem proxy `/api` no Vite: API e frontend compartilham origem.
- Entrada validada com `zValidator` e schema Zod compartilhado em `src/lib/schemas/`.
- O formulário reutiliza o mesmo schema da API.
- Toda rota privada usa `requireAuth` (`src/api/auth.ts`) e lê o usuário em `c.get("user")`.
- Rota pública que grava dados usa `rateLimit` e `bodyLimit`.
- Erro interno vai para `logError`, nunca para `console.error` direto: mensagens do Drizzle trazem dados pessoais.
- O cliente recebe mensagem genérica.
- Nodemailer fica no servidor, nunca em componentes React.
- Teste rotas com `api.request()` em `src/api/*.test.ts`.
- CORS só volta em escopo controlado, se a API for exposta a outra origem.

Para entender este domínio, leia: docs/context/tech/06-hono-api.md
