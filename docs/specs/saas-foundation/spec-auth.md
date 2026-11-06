# SPEC: Autenticação, verificação de e-mail e identidade

- **Parte de:** `docs/specs/saas-foundation/spec.md`
- **Paths previstos:** `src/lib/auth/server.ts`, `src/lib/auth/portal-server.ts`,
  `src/lib/auth/client.ts`, `src/lib/auth/permissions.ts`, `src/api/auth.ts`,
  `src/api/auth-ext.ts`, `src/providers/auth-provider.tsx`, `src/routes/auth/*`

## Visão geral

Duas instâncias do Better Auth, mesma biblioteca, tabelas e cookies separados:

| Instância | Quem | `basePath` | Tabelas | Prefixo do cookie | Plugins |
|---|---|---|---|---|---|
| `auth` | Proprietário, owner, colaborador | `/api/auth` | `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `organization_role`, `two_factor`, `rate_limit` | `bizu` | `organization` (dynamic access control), `admin`, `twoFactor` |
| `portalAuth` | Cliente/lead | `/api/portal/auth` | `portal_user`, `portal_session`, `portal_account`, `portal_verification`, `portal_rate_limit` | `bizu_portal` | `magicLink` (`storeToken: "hashed"`), `twoFactor` (opcional, desligado por padrão) |

Configuração comum às duas: `drizzleAdapter(db, { provider: "pg", schema })`,
`advanced.database.generateId: "uuid"`, `session.expiresIn: 7d`, `session.updateAge: 1d`,
`session.cookieCache: { enabled: true, maxAge: 300 }`, `advanced.useSecureCookies` em
produção, `trustedOrigins: [APP_URL]`, `rateLimit: { enabled: true, storage: "database" }`,
`emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 10,
revokeSessionsOnPasswordReset: true }`, `secret: BETTER_AUTH_SECRET`, `baseURL: APP_URL`.

Montagem em `src/api/app.ts`, antes do SSR:

```ts
api.use("/api/auth/verify-email", verificationGuard);      // uso único + invalidação
api.on(["GET","POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
api.on(["GET","POST"], "/api/portal/auth/*", (c) => portalAuth.handler(c.req.raw));
```

`requireAuth` (`src/api/auth.ts`) deixa de ler `Authorization: Bearer` e passa a
chamar `auth.api.getSession({ headers })`. Mantém a falha fechada: erro na consulta
responde 503; sem sessão, 401. Coloca em `c.var`: `user`, `session`,
`activeOrganizationId`. `requirePortalAuth` faz o mesmo com `portalAuth` e exige
`customer` ativo no tenant pedido.

`AuthUser` (`src/lib/auth/types.ts`) passa a:

```ts
type AuthUser = {
  id: string; email: string; name: string; emailVerified: boolean;
  platformRole: "user" | "platform_owner" | "platform_support";
  twoFactorEnabled: boolean;
  activeTenant: { id: string; slug: string; role: string; permissions: string[] } | null;
  impersonatedBy: string | null;
};
```

## Cadastro e verificação por nível

### Regras comuns (equipe e plataforma)

1. `POST /api/auth/sign-up/email` com `signupSchema` (nome, e-mail, senha ≥ 10,
   aceite de termos e versão). `requireEmailVerification: true` faz o Better Auth
   responder 200 sem sessão, inclusive para e-mail já existente (anti-enumeração
   documentada). `onExistingUserSignUp` envia ao dono do e-mail "alguém tentou
   cadastrar com seu e-mail; se foi você, entre ou recupere a senha".
2. `emailVerification.sendOnSignUp: true`, `expiresIn: 3600`,
   `autoSignInAfterVerification: true`. `sendVerificationEmail({ user, token })`
   **ignora a `url` do Better Auth** e monta `${APP_URL}/verificar-email?token=...`,
   grava `sha256(token)` em `email_verification_issue` (uma linha por usuário,
   substituída a cada envio) e enfileira `email.send` com o template
   `verify-email`.
3. Página `/verificar-email` (SSR, `noindex`): GET só renderiza. Não chama a API.
   Mostra "Confirmar meu e-mail". O botão chama
   `authClient.verifyEmail({ query: { token, callbackURL: "/app" } })`.
   Scanner que faz GET ou HEAD não consome nada.
4. `verificationGuard` (middleware Hono em `/api/auth/verify-email`): lê `token`,
   calcula `sha256`, busca em `email_verification_issue`. Se não bate (token
   anterior, já usado ou inexistente), responde 400 `{ error: "Link inválido ou
   expirado." }` e não chama o Better Auth. Se bate, deixa passar e apaga a linha
   dentro da mesma transação → **uso único** e **invalidação do anterior** sem
   depender do formato interno do token. A expiração continua sendo do JWT (1 h).
5. `afterEmailVerification(user)`: grava `audit_log` (`auth.email_verified`), aceita
   convite pendente se `invitationId` estava no `callbackURL`, e cria sessão (auto
   sign-in).
6. Conta não verificada: **bloqueio total**. Login responde 403 do Better Auth;
   `auth-form.tsx` mostra "Confirme seu e-mail para entrar" com botão de reenvio.
   Nenhuma rota de tenant aceita usuário com `emailVerified = false`, inclusive por
   convite.
7. Reenvio: `POST /api/auth-ext/resend-verification` (rota própria, Zod `{ email }`),
   rate limit 3 por 15 min por IP e 3 por hora por e-mail (store Postgres), sempre
   responde 200 `{ ok: true }`. Internamente chama
   `auth.api.sendVerificationEmail` só se o usuário existir e não estiver verificado.
8. Dispositivos diferentes: o celular que clicou fica logado; a tela "Confirme seu
   e-mail" no desktop tem "Já confirmei, entrar" que leva ao login. Sem polling.

### Proprietário da plataforma

- Criado por `npm run db:seed` ou `npx auth create-admin --email ... --role platform_owner`.
  O seed cria com `emailVerified: true` (documentado como exceção de ambiente local).
- Se criado por CLI em produção com `emailVerified: false`, o primeiro login dispara
  o fluxo comum (`sendOnSignIn: true`).
- 2FA obrigatório em produção: middleware `requirePlatform` responde 403
  `PLATFORM_2FA_REQUIRED` enquanto `twoFactorEnabled = false`, exceto em
  `/api/auth/two-factor/*` e `/admin/configuracoes/seguranca`.

### Owner da conta

- Cadastro público em `/cadastro`. Após verificar, `/app/onboarding` cria a
  organização (`auth.api.createOrganization`) com `slug` gerado, perfil de cobrança
  (razão social, CPF/CNPJ) e inicia o trial (`spec-billing.md`). O criador recebe
  `owner` (`creatorRole`). `allowUserToCreateOrganization: (user) => user.emailVerified`.
- `organizationLimit`: `platform_setting.max_tenants_per_user` (padrão 3).

### Colaborador

- Convite: `auth.api.createInvitation({ email, role, organizationId })`,
  `invitationExpiresIn: 172800` (48 h), `requireEmailVerificationOnInvitation: true`,
  `cancelPendingInvitationsOnReInvite: true`. `sendInvitationEmail` enfileira
  template `invite-member` com link `/convite/:invitationId`.
- Página `/convite/:id` (SSR, `noindex`): GET só mostra "Você foi convidado para X
  como Y" e os botões. Sem sessão: formulário de cadastro com e-mail travado no do
  convite → verificação de e-mail → `callbackURL=/convite/:id/aceitar` →
  `acceptInvitation`. Com sessão de outro e-mail: "Saia e entre com o e-mail do
  convite". Com sessão do mesmo e-mail verificado: botão "Aceitar" → POST.
- O clique no convite **não** verifica o e-mail. A verificação é o único caminho.
- `beforeAcceptInvitation` verifica `member` limit do plano (`checkLimit("members")`).

### Cliente/lead (portal)

- Criação pelo owner em `/app/clientes` → `customer` com `status: "lead"` e
  `portal_user` criado se não existir (`emailVerified: false`, sem senha).
- "Enviar acesso": `portalAuth.api.signInMagicLink({ email, callbackURL:
  "/portal?org=<slug>" })`, `expiresIn: 172800` (48 h para convite), uso único
  atômico, `storeToken: "hashed"`. Template `portal-invite`.
- Página `/portal/entrar` recebe `?token=` e, como no fluxo de equipe, **só verifica
  ao clicar** "Entrar no portal" (chama `GET /api/portal/auth/magic-link/verify`).
  O magic link marca `emailVerified = true`.
- Login recorrente em `/portal/login?org=<slug>`: magic link (`expiresIn: 600`) ou
  senha, se definida em `/portal/conta`. Com mais de um `customer` ativo, cai em
  `/portal/escolher`.
- Auto-cadastro no portal: só se `tenant.settings.portal_self_signup = true`. Usa
  `emailAndPassword` do `portalAuth` com `requireEmailVerification: true` e o mesmo
  fluxo de link + página de confirmação; cria `customer` com `status: "lead"`.
- `sendMagicLink` recusa e-mail sem `customer` no tenant pedido com resposta
  idêntica à de sucesso (`disableSignUp: true` + checagem própria antes de enviar).

## Troca de e-mail

- `user.changeEmail.enabled: true` e `sendChangeEmailConfirmation` → e-mail ao
  endereço **atual** com link de aprovação (template `change-email-confirm`). Só
  depois o Better Auth envia a verificação ao **novo** endereço. O aviso ao
  endereço antigo é essa confirmação; ao concluir, `afterEmailVerification`
  envia `change-email-done` ao antigo. `/change-email` sempre responde sucesso.
- Portal: `portalAuth` com a mesma configuração.

## Recuperação de senha

- `sendResetPassword({ user, token })` → link `/redefinir-senha?token=` (página só
  renderiza; o POST do formulário chama `resetPassword`). Resposta de
  `requestPasswordReset` embrulhada em `POST /api/auth-ext/forgot-password` com 200
  uniforme e rate limit (3/15 min por IP). `revokeSessionsOnPasswordReset: true`.
  `onPasswordReset` grava auditoria e envia `password-changed`.

## 2FA

- Plugin `twoFactor` com `appName: "Bizu SaaS"`, TOTP padrão, `backupCodes` gerados ao
  ativar, `trustDevice` 30 dias (padrão do plugin). Telas em
  `/app/configuracoes/seguranca` e `/admin/configuracoes/seguranca`.
- Owner pode exigir 2FA do tenant: `tenant.settings.require_2fa` → `requireTenant`
  responde 403 `TENANT_2FA_REQUIRED` para membros sem 2FA.
- Portal: desligado por padrão; ativável por tenant em fase futura.

## Sessões

- Listagem e revogação em `/app/configuracoes/sessoes` via `listSessions`,
  `revokeSession`, `revokeOtherSessions`.
- `session.additionalFields.activeOrganizationId` (plugin) e, por hook
  `databaseHooks.session.create.before`, define a última organização usada
  (`user_preference.last_tenant_id`).

## Personificação (suporte)

- Plugin `admin` com `adminRoles: ["platform_owner", "platform_support"]`,
  `impersonationSessionDuration: 3600`, papéis customizados via `createAccessControl`
  (recurso `user`: `platform_support` sem `delete`, `set-role`, `set-password`).
- Política própria em `POST /api/admin/impersonate`:
  1. Exige `impersonation_grant` válido (`tenant_id`, `granted_by`, `expires_at`,
     `scope`), criado pelo owner em `/app/configuracoes/suporte` ("Permitir acesso
     do suporte por 24 h"), ou `platform_setting.impersonation_policy =
     "allow_without_consent"` (padrão `"consent"`).
  2. Chama `auth.api.impersonateUser`, grava `audit_log`
     (`platform.impersonation_started`, com `grant_id`).
  3. `requireAuth` expõe `impersonatedBy`; `blockWhileImpersonating` recusa com 403 e
     audita: rotas de `/api/billing/*` (exceto GET), `/api/tenant` DELETE,
     `/api/team/*` mutações de owner, `/api/me/*` troca de e-mail e senha.
  4. Interface mostra banner fixo "Você está vendo como <nome> (suporte)" com
     "Sair da personificação" → `stopImpersonating` + auditoria.

## Login social (fase futura)

- Provedores Google e Microsoft via `socialProviders`. Verificação herdada apenas se
  o provedor devolver `email_verified: true`; caso contrário o fluxo comum de link é
  disparado. `account.accountLinking.trustedProviders: ["google", "microsoft"]` só
  para e-mails verificados. Portal não recebe login social.

## Estados e erros do fluxo de verificação

| Estado | Como se chega | Saída |
|---|---|---|
| `unverified` | cadastro ou troca de e-mail | verificação |
| `verified` | botão na página com token válido | sessão criada |
| `expired` | `exp` do JWT passou | página mostra "Link expirado" + reenvio |
| `superseded` | reenvio emitiu token novo | `verificationGuard` responde 400 |
| `consumed` | mesmo link usado duas vezes | 400; se já verificado, página diz "E-mail já confirmado, entre" |
| `rate_limited` | reenvio acima do limite | 429 com `Retry-After` |

Mensagens nunca dizem se o e-mail existe: "Se existir uma conta com este e-mail,
enviamos um link."

## Dados de demonstração e testes locais

- Seed marca `emailVerified: true` e registra no `README`.
- Teste local do fluxo: cadastrar em `/cadastro`, abrir `http://localhost:8025`
  (Mailpit), clicar, confirmar. `npm run test:email-flow` roda o cenário com
  provedor fake (`EmailProvider` em memória) e `api.request()`.

## Decisões específicas

| Decisão | Motivo | Alternativa descartada |
|---|---|---|
| Guard próprio em vez de `beforeEmailVerification` | Não depende de o hook expor o token; é testável com `api.request()` | Hook do Better Auth (não verificado) |
| JWT do Better Auth como token, hash próprio só para uso único | Reusa assinatura e expiração; evita reimplementar o `verify-email` | Token aleatório próprio com endpoint próprio |
| Magic link no portal | Lead sem senha, link prova e-mail, `storeToken: "hashed"` nativo | Senha obrigatória no portal |
| Sem OTP numérico nesta entrega | Link já cobre celular/desktop com "Já confirmei"; OTP é módulo opcional (`emailOTP`, `storeOTP: "hashed"`) | OTP obrigatório |
