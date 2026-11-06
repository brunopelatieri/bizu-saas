# Autenticação

- **Escopo:** Better Auth da equipe e da plataforma, verificação de e-mail, sessão e papéis. A instância do portal está em `tech/25-portal-clientes.md`.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-auth.md`, `spec-seguranca.md`
- **Paths do código:** `src/lib/auth/`, `src/api/auth.ts`, `src/api/auth-ext.ts`, `src/api/guards.ts`, `src/api/verification-guard.ts`, `src/db/schema/auth.ts`, `src/lib/schemas/auth.ts`, `src/lib/email/templates/auth/`, `src/providers/auth-provider.tsx`, `src/components/auth/`, `src/pages/*-page.tsx`, `src/routes/auth/`

## Estado atual

Instância `auth`, para plataforma e equipe, com sessão em cookie no Postgres e o plugin
`organization` (`tech/21-tenant-rbac.md`). Clientes e leads usam outra instância, `portalAuth`,
com cookies, tabelas e segredo próprios (`tech/25-portal-clientes.md`): um cookie nunca vale
pelo outro. Ainda não existem: 2FA e personificação (fase 9) e `consent_log` (fase 10); o
aceite de termos é exigido, mas não registrado.

| Peça | Arquivo | Papel |
|---|---|---|
| Instância | `src/lib/auth/server.ts` | `getAuth()`, criada na primeira chamada porque `src/server.ts` só carrega `.env.local` depois dos imports |
| Rotas | `src/api/auth-ext.ts` | `/api/auth/*` e `/api/auth-ext/*`, montadas em `src/api/app.ts` |
| Uso único | `src/api/verification-guard.ts`, `src/lib/auth/verification-issue.ts` | `email_verification_issue` guarda `sha256(token)` da emissão vigente |
| E-mails | `src/lib/auth/emails.ts` | monta link com `APP_URL`, grava a emissão e chama `sendEmail` |
| Servidor | `src/api/auth.ts` | `requireAuth` e `requirePlatform` |
| Cliente | `src/lib/auth/client.ts`, `src/providers/auth-provider.tsx` | `authClient`, `useAuth()` |
| Papéis | `src/lib/auth/permissions.ts` | plataforma em `user.role`; catálogo e papéis do tenant, compartilhados com o cliente |
| Portal | `src/lib/auth/portal.ts`, `src/api/portal-auth.ts` | `getPortalAuth()`, `requirePortalAuth`, `requirePortalTenant` |

## Rotas

| Rota | Quem responde | Regra |
|---|---|---|
| `POST /api/auth/sign-up/email` | `auth-ext.ts` + Better Auth | exige `signupSchema`; corpo sempre `{ ok: true }` |
| `POST /api/auth/verify-email` | `auth-ext.ts` + guard + Better Auth | só POST; devolve `{ step }` (`verified`, `change-approved`, `change-done`) |
| `GET /api/auth/verify-email` | `auth-ext.ts` | 405: o token nunca é consumido em GET |
| `POST /api/auth-ext/resend-verification` | `auth-ext.ts` | `{ ok: true }`; 3 por 15 min por IP, 3 por hora por e-mail |
| `POST /api/auth-ext/forgot-password` | `auth-ext.ts` | `{ ok: true }`; 3 por 15 min por IP |
| `/api/auth/organization/*` | `auth-ext.ts` | 404: as regras de tenant ficam nas rotas próprias; use `auth.api.*` |
| demais `/api/auth/*` | Better Auth | `sign-in/email`, `sign-out`, `reset-password`, `change-email`, `get-session`, `admin/*` |

Desligados por HTTP em `disabledPaths`, disponíveis em `auth.api.*`:
`/send-verification-email`, `/request-password-reset`, `/admin/impersonate-user` e
`/admin/stop-impersonating`.

## Verificação de e-mail

1. Cadastro, reenvio ou login sem verificação chamam `sendVerificationLink`, que ignora
   a `url` do Better Auth, grava `sha256(token)` e envia `/verificar-email?token=`.
2. A página só renderiza. O botão faz `POST /api/auth/verify-email`.
3. `verificationGuard` apaga a linha em um único `DELETE ... RETURNING`: token anterior,
   usado ou desconhecido responde 400 sem chamar o Better Auth.
4. A rota remonta um GET interno para o Better Auth, que valida o JWT (1 h), marca
   `email_verified` e abre a sessão.

Sem verificação, não há sessão: login com a senha certa responde o mesmo 401 de senha errada e
dispara um novo link (`sendOnSignIn`). `hideUnverified` (`auth-ext.ts`) faz a troca em todo o
proxy para o Better Auth, que confere a senha antes da verificação: sem ela, cadastrar um e-mail
com uma senha qualquer e tentar entrar diria se ele já existia. A tela de login não sabe por que
a entrada falhou, então o reenvio fica fixo nela, em "Não recebeu o link de confirmação?".
`requireAuth` também recusa `emailVerified = false`.

A linha é consumida antes do Better Auth rodar. Se ele falhar nesse instante, o link
se perde e a pessoa pede outro: a falha é fechada.

Reenvio dentro do mesmo segundo gera o mesmo JWT e, portanto, o mesmo hash.

Cadastro pendente expira em 24 h (`src/lib/auth/pending-signup.ts`): não recebe mais link,
e um novo cadastro apaga a conta e recomeça. Sem isso, quem cadastrasse o e-mail de outra
pessoa deixaria uma senha à espera do clique do dono (RISK-006). Conta sem verificar criada
por outro caminho, como uma CLI, cai na mesma regra.

## Troca de e-mail

`authClient.changeEmail` responde sucesso mesmo para endereço em uso. O link de aprovação
vai ao endereço atual; aprovado, o Better Auth envia a verificação ao novo; concluída, o
endereço antigo recebe `change-email-done`. As duas etapas usam a mesma tabela, com
`kind = "change"`, e a mesma página. O e-mail antigo vem das claims do token, porque
quando `afterEmailVerification` roda o usuário já tem o novo.

## Recuperação de senha

`/esqueci-senha` chama `/api/auth-ext/forgot-password`, que envia
`/redefinir-senha?token=`. A página só renderiza; o envio do formulário chama
`authClient.resetPassword`. O token é de uso único, fica em hash
(`verification.storeIdentifier: "hashed"`), encerra todas as sessões e dispara
`password-changed`.

## Sessão e `requireAuth`

- Cookies `bizu.session_token` e `bizu.session_data`: `HttpOnly`, `SameSite=Lax`, e
  `Secure` com prefixo `__Secure-` em produção.
- `requireAuth` responde 401 sem cookie, sem consultar nada; 401 com sessão inválida; 503
  se o Auth falhar; 403 sem e-mail verificado.
- `requireAuth` lê a sessão com `disableCookieCache`: sessão revogada cai na hora. O cache
  de 5 min do cookie vale só para `/get-session`, que alimenta a interface.
- `apiFetch`, ao receber 401 em `/app`, encerra a sessão antes de ir ao login. Sem isso o
  cache do cookie devolveria para `/app`, em ciclo.
- `requireAuth` expõe `activeOrganizationId`; `requireTenant` e `requirePermission` ficam em
  `src/api/permissions.ts`.
- O cache do cookie guarda o tenant ativo antigo por até 5 minutos: nada lê esse valor, e
  chamadas a `auth.api.*` passam `organizationId`.
- Sessão nova abre no último tenant usado (`databaseHooks.session.create.before`).
- `requirePlatform()` vem depois de `requireAuth`; passe `["platform_owner"]` nas rotas que
  o suporte não pode usar. O 2FA obrigatório entra na fase 9.
- `platform_support` só lê em `/api/auth/admin/*`: o plugin não compara o papel do alvo, e
  `ban` ou `revoke` permitiriam derrubar o proprietário.

## Rate limit e IP

- Better Auth, no banco (`rate_limit`): `/sign-in/email` e `/sign-up/email` 3 por 10 s,
  `/reset-password` 5 por min, `/change-email` 3 por min. `/get-session` fica de fora.
- Rotas próprias: `rateLimit` em memória até a fase 9 (`rate_limit_bucket`).
- `X-Forwarded-For` vem do cliente. `auth-ext.ts` resolve o IP com `TRUSTED_PROXY_HOPS` e
  sobrescreve `x-bizu-client-ip`, o único cabeçalho que o Better Auth lê.
- O Better Auth só confere `Origin` quando há cookie. `sameOrigin` confere em todo
  `/api/auth/*` e `/api/auth-ext/*`; sem esse middleware, cadastro e login aceitariam
  envio de outro site.

## Primeiro proprietário

`npm run db:seed` cria `owner@bizu.local` (`platform_owner`) e `suporte@bizu.local`
(`platform_support`), com a senha de `SEED_PASSWORD`. Sem o seed (ou em produção), cadastre-se em
`/cadastro`, confirme e promova pelo banco:

```sql
update "user" set role = 'platform_owner' where email = 'voce@empresa.com';
```

## Regras

- `ProtectedRoute` faz o gate no cliente e não protege dados.
- Toda rota privada usa `authRateLimit` e `requireAuth`.
- Falha fechada: Auth indisponível não abre rota.
- Respostas de cadastro, login sem verificação, reenvio, reset e troca de e-mail não revelam se o e-mail existe.
- Trabalho que depende de o e-mail existir roda em `runInBackground`: a resposta sai antes.
- Handler novo em `/api/auth/*` passa por `forwardedHeaders` e remonta o `Request`, para
  mandar o IP resolvido. Teste em `tests/db/auth-http.test.ts`: `api.request()` entrega um
  `Request` nativo, e o servidor Node, um objeto próprio.
- Verificação e reset gravam `auth.email_verified` e `auth.password_reset` em `audit_log`.
- O log de requisições passa por `redactTokens` (`src/api/request-logger.ts`).
- Schema do Better Auth é escrito à mão a partir de `getAuthTables`. `@better-auth/cli`
  1.4 não acompanha a 1.7 e traz Prisma e `better-sqlite3` como dependências.
