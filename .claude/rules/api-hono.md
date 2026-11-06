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
- Toda rota privada usa `authRateLimit` + `requireAuth` e lê o usuário em `c.get("user")`.
- Rota de tenant soma `requireTenant` + `requirePermission(recurso, ação)` (`src/api/permissions.ts`), `validId` nos ids e `handleTenantError`; recurso de outro tenant responde 404.
- Rota com DELETE ou POST sem corpo é testada em `tests/db/tenant-http.test.ts`: `api.request()` não passa pelo `bodyLimit` do servidor Node.
- Rota pública que grava dados usa `rateLimit` e `bodyLimit`.
- Erro interno vai para `logError`, nunca para `console.error` direto: mensagens do Drizzle trazem dados pessoais.
- O cliente recebe mensagem genérica.
- SDKs com segredo, como e-mail, ficam no servidor, nunca em componentes React.
- E-mail sai sempre por `sendEmail` (`src/lib/email/send.ts`), que enfileira; nunca chame o provedor direto numa rota. Passe `tags: { template }`.
- Webhook de provedor lê o corpo bruto e confere a assinatura antes do JSON (`src/api/webhooks-email.ts`); `/api/ready` testa banco e fila.
- `/api/admin/*` usa `requireAuth` + `requirePlatform()` e, nas escritas, `requirePlatform(["platform_owner"])` antes da validação; tabela de tenant só dentro de `withPlatformScope` (`tech/22-admin.md`).
- Limite do plano: `assertWithinLimit(tenantId, metric)` antes de criar (`tech/23-billing-planos.md`).
- Teste rotas com `api.request()` em `src/api/*.test.ts`; com banco real, em `tests/db/`.
- Leia variáveis por `getEnv()` (`src/lib/env.ts`), não por `process.env` espalhado.
- CORS só volta em escopo controlado, se a API for exposta a outra origem.

Para entender este domínio, leia: docs/context/tech/06-hono-api.md
