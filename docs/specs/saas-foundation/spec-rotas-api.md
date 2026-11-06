# SPEC: Mapa de rotas e contratos da API

- **Parte de:** `docs/specs/saas-foundation/spec.md`
- **Paths previstos:** `src/routes.ts`, `src/routes/{public,auth,app,admin,portal}/`,
  `src/api/{app,auth,auth-ext,me,tenant,team,roles,customers,billing,admin,portal,webhooks}.ts`,
  `src/lib/schemas/*.ts`, `src/lib/constants/{navigation,app-nav,admin-nav,portal-nav}.ts`

## Rotas (React Router)

### Públicas (SSR, `meta`, indexáveis)

| Rota | Arquivo | Conteúdo |
|---|---|---|
| `/` | `routes/public/home.tsx` | landing reposicionada: "comece seu SaaS", CTA `/cadastro` |
| `/precos` | `routes/public/pricing.tsx` | `loader` lê `plan` ativos (dados públicos) |
| `/sobre`, `/contato`, `/blog`, `/blog/:slug` | existentes | mantidos |
| `/legal/termos`, `/legal/privacidade` | `routes/public/legal.tsx` | markdown |

### Autenticação (standalone, `noindex`)

| Rota | Função |
|---|---|
| `/login` | login equipe/plataforma, `?next=` |
| `/cadastro` | cadastro de owner |
| `/verificar-email` | página de confirmação (`?token=`), botão consome |
| `/esqueci-senha`, `/redefinir-senha` | reset |
| `/convite/:id` | aceitar convite |
| `/2fa` | desafio TOTP/backup após login |
| `/trocar-organizacao` | escolher tenant ativo |

### App do tenant (`/app/**`, client-only, layout com sidebar)

| Rota | Permissão | Conteúdo |
|---|---|---|
| `/app` | membro | visão geral, banner de trial/inadimplência |
| `/app/onboarding` | usuário verificado sem tenant | cria organização e perfil de cobrança |
| `/app/clientes`, `/app/clientes/:id` | `customer:read` | CRUD, "enviar acesso ao portal" |
| `/app/equipe` | `member:*`/`invitation:*` | membros, convites, transferir propriedade |
| `/app/equipe/papeis` | `role:*` | papéis personalizados |
| `/app/assinatura`, `/app/assinatura/faturas` | `billing:read`/`manage` | planos, checkout, faturas, cancelar |
| `/app/auditoria` | `audit:read` | log do tenant |
| `/app/configuracoes` | `settings:read` | organização, perfil, `seguranca` (2FA), `sessoes`, `suporte` (consentimento), `notificacoes`, `privacidade` (export/exclusão) |

### Admin da plataforma (`/admin/**`, client-only, `requirePlatform`)

| Rota | Conteúdo |
|---|---|
| `/admin` | métricas: tenants por estado, MRR estimado, trials expirando, webhooks falhos, jobs mortos |
| `/admin/tenants`, `/admin/tenants/:id` | lista e detalhe (membros, assinatura, auditoria, suspender, personificar) |
| `/admin/usuarios`, `/admin/usuarios/:id` | usuários de equipe e portal, banir, revogar sessões |
| `/admin/planos`, `/admin/planos/:id` | CRUD de planos e preços |
| `/admin/assinaturas` | filtros por status, forçar reconciliação, cancelar |
| `/admin/webhooks` | `payment_event`, reprocessar |
| `/admin/jobs` | filas, falhas, reexecutar |
| `/admin/auditoria` | log global |
| `/admin/configuracoes` | `platform_setting`, `seguranca` (2FA do proprietário) |

### Portal do cliente (`/portal/**`, client-only, `portalAuth`)

| Rota | Conteúdo |
|---|---|
| `/portal/login` | `?org=slug`; magic link ou senha |
| `/portal/entrar` | página do magic link (`?token=`), botão consome |
| `/portal/escolher` | escolher tenant quando há mais de um |
| `/portal` | dados do cliente, avisos do tenant |
| `/portal/conta` | perfil, definir senha, sessões, privacidade |
| `/portal/faturas` | reservado ao fluxo (b) |

## Middlewares (ordem)

`secureHeaders` → `csp` → `csrf` (rotas próprias) → `rateLimit` → `requireAuth` |
`requirePortalAuth` → `requireTenant` | `requirePlatform` → `requirePermission` →
`blockWhileImpersonating` (mutações sensíveis) → `zValidator` → handler.

## Contratos (todos JSON; erro `{ error: string, code?: string }`)

Schemas Zod em `src/lib/schemas/`: `auth.ts` (atualizado), `tenant.ts`, `team.ts`,
`roles.ts`, `customers.ts`, `billing.ts`, `admin.ts`, `portal.ts`, `lgpd.ts`.

### Sessão e perfil

| Método e rota | Entrada | Saída | Autorização |
|---|---|---|---|
| `GET /api/me` | – | `{ user: AuthUser, tenants: [{id,slug,name,role}], features[], limits{} }` | `requireAuth` |
| `PATCH /api/me` | `profileSchema` (`name`, `phone`, `locale`) | `{ user }` | `requireAuth` |
| `POST /api/auth-ext/resend-verification` | `{ email }` | `{ ok: true }` sempre | rate limit |
| `POST /api/auth-ext/forgot-password` | `{ email }` | `{ ok: true }` sempre | rate limit |
| `POST /api/me/export` | – | `{ exportId }` | `requireAuth` |
| `DELETE /api/me` | `{ password, totp? }` | `{ scheduledFor }` | `requireAuth`, fresh session |
| `/api/auth/*`, `/api/portal/auth/*` | Better Auth | Better Auth | plugin |

### Tenant e equipe

| Método e rota | Entrada | Saída | Autorização |
|---|---|---|---|
| `POST /api/tenant` | `createTenantSchema` (`name`, `slug?`, `billingProfile`) | `{ tenant, subscription }` | `requireAuth`, e-mail verificado |
| `GET /api/tenant` | – | `{ tenant, subscription, usage }` | `requireTenant` |
| `PATCH /api/tenant` | `updateTenantSchema` | `{ tenant }` | `organization:update` |
| `DELETE /api/tenant` | `{ password, totp? }` | `{ scheduledFor }` | `owner`, não personificado |
| `GET /api/team` | – | `{ members[], invitations[] }` | `requireTenant` |
| `POST /api/team/invitations` | `inviteSchema` (`email`, `role`) | `{ invitation }` | `invitation:create`, limite |
| `DELETE /api/team/invitations/:id` | – | `{ ok }` | `invitation:cancel` |
| `PATCH /api/team/members/:id` | `{ role }` | `{ member }` | `member:update`; `admin` não toca `owner` |
| `DELETE /api/team/members/:id` | – | `{ ok }` | `member:delete`; último owner recusado |
| `POST /api/team/transfer` | `{ toUserId, password }` | `{ ok }` | `owner` |
| `GET/POST /api/roles`, `PATCH/DELETE /api/roles/:id` | `roleSchema` (`name`, `permissions[]`) | `{ role }` | `role:*`; reservadas rejeitadas |
| `POST /api/tenant/support-grant` | `{ hours }` | `{ grant }` | `support:grant` |
| `DELETE /api/tenant/support-grant/:id` | – | `{ ok }` | `support:grant` |

### Clientes

| Método e rota | Entrada | Saída | Autorização |
|---|---|---|---|
| `GET /api/customers?q&status&page` | query Zod | `{ items[], total }` | `customer:read` |
| `POST /api/customers` | `customerSchema` | `{ customer }` | `customer:create`, limite |
| `GET/PATCH/DELETE /api/customers/:id` | `customerSchema.partial()` | `{ customer }` | `customer:read/update/delete`; 404 fora do tenant |
| `POST /api/customers/:id/invite` | – | `{ ok }` | `customer:invite`; envia magic link |

### Billing

| Método e rota | Entrada | Saída | Autorização |
|---|---|---|---|
| `GET /api/billing/plans` | – | `{ plans[], providers[], capabilities }` | `requireTenant` |
| `GET /api/billing/subscription` | – | `{ subscription, invoices[] }` | `billing:read` |
| `POST /api/billing/checkout` | `{ planPriceId, method }` | `{ kind, url? , pixPayload?, boletoUrl?, invoiceId }` | `billing:manage`, não personificado |
| `POST /api/billing/change-plan` | `{ planPriceId }` | `{ subscription, effectiveAt }` | idem |
| `POST /api/billing/cancel` | `{ atPeriodEnd: true }` | `{ subscription }` | idem |
| `POST /api/billing/reactivate` | – | `{ subscription }` | idem |
| `GET /api/billing/invoices/:id` | – | `{ invoice }` | `billing:read` |
| `GET /api/billing/portal` | – | `{ url }` | `billing:manage`; só se `customerPortal` |

### Admin

| Método e rota | Entrada | Saída | Autorização |
|---|---|---|---|
| `GET /api/admin/overview` | – | métricas | `requirePlatform` |
| `GET /api/admin/tenants?q&status`, `GET /api/admin/tenants/:id` | query | `{ items }` / detalhe | `requirePlatform` |
| `POST /api/admin/tenants/:id/suspend` / `unsuspend` | `{ reason }` | `{ tenant }` | `platform_owner` |
| `GET/POST /api/admin/plans`, `PATCH /api/admin/plans/:id` | `planSchema`, `planPriceSchema` | `{ plan }` | `platform_owner` |
| `GET/PATCH /api/admin/settings` | `platformSettingsSchema` | `{ settings }` | `platform_owner` |
| `GET /api/admin/users`, `POST /api/admin/users/:id/ban` | admin plugin + Zod | | `requirePlatform` |
| `POST /api/admin/impersonate` | `{ userId }` | `{ ok }` | grant válido ou política; auditado |
| `GET /api/admin/webhooks`, `POST /api/admin/webhooks/:id/reprocess` | query | `{ items }` | `requirePlatform` |
| `GET /api/admin/jobs`, `POST /api/admin/jobs/:id/retry` | query | `{ items }` | `requirePlatform` |
| `POST /api/admin/subscriptions/:id/reconcile` | – | `{ subscription, diff }` | `requirePlatform` |

### Portal

| Método e rota | Entrada | Saída | Autorização |
|---|---|---|---|
| `GET /api/portal/me` | – | `{ user, tenants: [{id,slug,name,status}], active }` | `requirePortalAuth` |
| `POST /api/portal/active-tenant` | `{ tenantId }` | `{ ok }` | `requirePortalAuth`, `customer` ativo |
| `PATCH /api/portal/me` | `portalProfileSchema` | `{ user }` | `requirePortalAuth` |
| `POST /api/portal/me/export`, `DELETE /api/portal/me` | | | `requirePortalAuth` |
| `POST /api/portal/auth-ext/magic-link` | `{ email, org }` | `{ ok: true }` sempre | rate limit |

### Webhooks e saúde

| Método e rota | Entrada | Saída | Autorização |
|---|---|---|---|
| `POST /api/webhooks/payments/:provider` | corpo bruto | `200 {received:true}` / `400` | assinatura do provedor |
| `POST /api/webhooks/email/:provider` | corpo bruto | `200` / `400` | assinatura do provedor |
| `POST /api/csp-report` | JSON | `204` | rate limit |
| `GET /api/health` | – | `{ ok }` | – |
| `GET /api/ready` | – | `{ db, jobs }` | – |

## Interface

- Navegação: `src/lib/constants/app-nav.ts`, `admin-nav.ts`, `portal-nav.ts` com
  `permission?` por item; o menu filtra com `useCan()`.
- Estados padrão em toda tela: carregando (`Skeleton`), vazio, erro (`ApiError`
  com `code`) e sucesso (toast Sonner).
- Dados no cliente: `useQuery` com chaves `["me"]`, `["tenant"]`, `["customers", filtros]`,
  `["billing"]`; `invalidateQueries` após mutações. `apiFetch` passa a enviar
  `credentials: "same-origin"` (cookies) e trata `401` com redirect ao login da
  área correta.
- `AuthProvider` passa a usar `authClient` do Better Auth (`createAuthClient` com
  `organizationClient`, `adminClient`, `twoFactorClient`) e expõe `useAuth()` com a
  mesma assinatura atual + `tenant`, `permissions`, `switchTenant`. `PortalAuthProvider`
  análogo em `/portal/**`.
