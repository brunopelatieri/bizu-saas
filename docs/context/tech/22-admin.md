# Admin da plataforma (/admin)

- **Escopo:** Área do proprietário da plataforma: rotas `/admin/**`, API `/api/admin/*`, papéis, suspensão, usuários, planos e configurações.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-rotas-api.md`, `spec-tenant-rbac.md`, `spec-billing.md`
- **Paths do código:** `src/api/admin.ts`, `src/lib/admin/` (`tenants.ts`, `users.ts`, `plans.ts`), `src/lib/schemas/admin.ts`, `src/lib/constants/admin-nav.ts`, `src/components/admin/`, `src/pages/admin/`, `src/routes/admin/`, `tests/db/admin.test.ts`

## Acesso

| Papel (`user.role`) | Lê | Escreve |
|---|---|---|
| `platform_owner` | tudo | planos, preços, configurações, suspender/reativar, trocar plano, banir |
| `platform_support` | tudo | nada (403) |
| `user` | nada | nada (403 `PLATFORM_FORBIDDEN`) |

`adminRoutes` aplica, em `/api/admin/*`: `sameOrigin` → `jsonBodyLimit` → `authRateLimit` →
`requireAuth` → `requirePlatform()`; cada escrita soma `requirePlatform(["platform_owner"])`
**antes** da validação. O `AdminLayout` manda quem não é da plataforma de volta a `/app`, mas é
só o caminho da interface. Sem `loader` de servidor. O 2FA obrigatório da plataforma é da fase 9.

## API

| Rota | Quem | Observação |
|---|---|---|
| `GET /api/admin/overview` | plataforma | tenants por estado, usuários, testes acabando em 7 dias, planos ativos, webhooks com falha |
| `GET /api/admin/tenants?q&status&page` | plataforma | `status` é o estado de cobrança; 20 por página |
| `GET /api/admin/tenants/:id` | plataforma | membros, assinatura, últimos eventos e auditoria |
| `POST /api/admin/tenants/:id/suspend` `{ reason? }` | owner | `suspended` + `locked`; e-mail `tenant-suspended` aos proprietários (falha no aviso só vai para o log: a suspensão vale e é auditada); 409 `ALREADY_SUSPENDED` |
| `POST /api/admin/tenants/:id/unsuspend` | owner | volta `full`, ou `read_only` se a assinatura expirou; 409 `NOT_SUSPENDED` |
| `PUT /api/admin/tenants/:id/plan` `{ planId }` | owner | plano gratuito encerra o trial, destrava o `read_only` e larga a referência do provedor; plano pago mantém o estado; 409 `PROVIDER_SUBSCRIPTION_ACTIVE` com assinatura viva no provedor (`unpaid` conta como viva: cancele antes) |
| `GET /api/admin/subscriptions?status&q&page` | plataforma | sem referências do provedor; traz `alert` da reconciliação |
| `POST /api/admin/subscriptions/:id/cancel` | owner | imediato, no provedor e aqui; 409 `ALREADY_CANCELED` |
| `POST /api/admin/subscriptions/:id/sync` | owner | busca do provedor, corrige e alerta; conferido e igual, o alerta sai; 409 `NO_PROVIDER_SUBSCRIPTION` |
| `GET /api/admin/webhooks?status&page` | plataforma | `payment_event` sem `raw`, que tem dado pessoal |
| `POST /api/admin/webhooks/:id/reprocess` | owner | só `failed` ou `ignored` e verificado; 409 `NOT_REPROCESSABLE` |
| `GET`, `POST /api/admin/plans` | leitura plataforma; escrita owner | 409 `SLUG_TAKEN` |
| `PATCH /api/admin/plans/:id` | owner | parcial, o `slug` não muda; 409 `PLAN_HAS_PRICES` ao marcar gratuito com preço ativo; preço não se apaga, e reativar preço de plano gratuito é 409 `FREE_PLAN_NO_PRICE` |
| `POST /api/admin/plans/:id/prices`, `PATCH .../prices/:priceId` | owner | 409 `PRICE_EXISTS`, 409 `FREE_PLAN_NO_PRICE`; sem exclusão, só `active` |
| `GET`, `PATCH /api/admin/settings` | leitura plataforma; escrita owner | `trialPlanId: null` = primeiro plano gratuito ativo; 400 `PLAN_NOT_FOUND`, `TRIAL_PLAN_NOT_FREE` |
| `GET /api/admin/users?q&page` | plataforma | |
| `POST /api/admin/users/:id/ban` `{ reason? }`, `.../unban` | owner | via `auth.api.banUser`, que encerra as sessões; 409 `SELF_BAN`, 403 `PLATFORM_USER_PROTECTED` |

O plugin `admin` não compara o papel do alvo; por isso `assertBannable` só deixa banir quem tem
papel `user`. Toda escrita grava `audit_log` com `actor_type = platform` (`admin.*`); as de um
tenant levam o `tenant_id`. Tabelas de tenant são lidas com `withPlatformScope(motivo, ...)`.

## Telas

| Rota | Arquivo |
|---|---|
| `/admin` | `pages/admin/overview-page.tsx` |
| `/admin/tenants`, `/admin/tenants/:id` | `tenants-page.tsx`, `tenant-detail-page.tsx` |
| `/admin/usuarios` | `users-page.tsx` |
| `/admin/planos`, `/admin/planos/:id` | `plans-page.tsx`, `plan-detail-page.tsx` |
| `/admin/assinaturas` | `subscriptions-page.tsx` |
| `/admin/webhooks` | `webhooks-page.tsx` |
| `/admin/configuracoes` | `settings-page.tsx` |

Reaproveitam o shell de `/app`: `AppSidebar`, `AppNav` e `AppTopbar` recebem o menu
(`admin-nav.ts`) por props. Dados por `useAdminQuery`/`useAdminMutation` (`admin-api.ts`);
escrita só aparece para `platform_owner` (`useIsPlatformOwner`). O menu do usuário mostra
"Administração" para quem tem papel de plataforma. Formulários validam com os schemas de
`src/lib/schemas/admin.ts`; `limits` vazio vira `null` (ilimitado).

## Usuários do portal

`/admin/usuarios` tem duas abas. Clientes e leads são outra identidade (`portal_user`):
`GET /api/admin/users?scope=portal` traz organizações e sessões em aberto, e
`POST /api/admin/portal-users/:id/revoke-sessions`, só do proprietário, derruba as sessões. Não
há banimento: o acesso é de cada tenant, por `customer.status`. O overview conta os clientes
de todos os tenants.

## Ainda não existe

Overview sem MRR e jobs mortos; `/admin/jobs`, `/admin/auditoria`; personificação (fase 9);
detalhe de usuário; revogar sessões.
