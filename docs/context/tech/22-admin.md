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
só o caminho da interface. Sem `loader` de servidor. Em produção, sem 2FA, toda rota responde 403
`PLATFORM_2FA_REQUIRED`, e o layout leva a `/admin/configuracoes/seguranca`.

## API

| Rota | Quem | Observação |
|---|---|---|
| `GET /api/admin/overview` | plataforma | tenants por estado, usuários, testes acabando em 7 dias, planos ativos, webhooks com falha |
| `GET /api/admin/tenants?q&status&page` | plataforma | `status` é o estado de cobrança; 20 por página |
| `GET /api/admin/tenants/:id` | plataforma | membros, assinatura (período, vencimento, carência, `billingMode`), 12 últimas faturas, preços manuais do plano, últimos eventos e auditoria |
| `POST /api/admin/tenants/:id/suspend` `{ reason? }` | owner | `suspended` + `locked`; e-mail `tenant-suspended` aos proprietários (falha no aviso só vai para o log: a suspensão vale e é auditada); 409 `ALREADY_SUSPENDED` |
| `POST /api/admin/tenants/:id/unsuspend` | owner | volta `full`, ou `read_only` se a assinatura expirou; 409 `NOT_SUSPENDED` |
| `PUT /api/admin/tenants/:id/plan` `{ planId }` | owner | plano gratuito encerra o trial, destrava o `read_only`, limpa o período e larga a referência do provedor; plano pago mantém o estado, e do gratuito (sem período) vence **agora**; faturas manuais abertas viram `void`; 409 `PROVIDER_SUBSCRIPTION_ACTIVE` com assinatura viva no provedor (`unpaid` conta como viva: cancele antes) |
| `POST /api/admin/subscriptions/:id/manual-payment` `{ invoiceId?, planPriceId?, method? }` | owner | cobrança manual: fatura aberta (ou nova) paga, assinatura `active` com período novo; 409 `PROVIDER_SUBSCRIPTION_ACTIVE`, `FREE_PLAN`, `MANUAL_PRICE_REQUIRED`, `INVOICE_NOT_OPEN` |
| `POST /api/admin/subscriptions/:id/manual-unpaid` `{ invoiceId?, immediate? }` | owner | fatura `failed`, assinatura `past_due` com carência ou, com `immediate`, `unpaid` + `read_only`; 409 `ALREADY_PAST_DUE` |
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
| `/admin/tenants`, `/admin/tenants/:id` | `tenants-page.tsx`, `tenant-detail-page.tsx`; cobrança manual em `components/admin/manual-billing-card.tsx` |
| `/admin/usuarios` | `users-page.tsx`; o nome leva ao detalhe |
| `/admin/usuarios/:id`, `/admin/usuarios/portal/:id` | `user-detail-page.tsx`, `portal-user-detail-page.tsx` (rotas `routes/admin/user.tsx`, `portal-user.tsx`) |
| `/admin/planos`, `/admin/planos/:id` | `plans-page.tsx`, `plan-detail-page.tsx` |
| `/admin/assinaturas` | `subscriptions-page.tsx` |
| `/admin/webhooks` | `webhooks-page.tsx` |
| `/admin/auditoria` | `routes/admin/audit.tsx`: log global, por ação, organização e pessoa |
| `/admin/configuracoes` | `settings-page.tsx`, inclusive a política de acesso do suporte |
| `/admin/configuracoes/seguranca` | `routes/admin/security.tsx`: 2FA de quem administra |

Reaproveitam o shell de `/app`: `AppSidebar`, `AppNav` e `AppTopbar` recebem o menu
(`admin-nav.ts`) por props. Dados por `useAdminQuery`/`useAdminMutation` (`admin-api.ts`);
escrita só aparece para `platform_owner` (`useIsPlatformOwner`). O menu do usuário mostra
"Administração" para quem tem papel de plataforma. Formulários validam com os schemas de
`src/lib/schemas/admin.ts`; `limits` vazio vira `null` (ilimitado).

## Personificação

`/admin/tenants/:id` mostra, por membro, "Personificar" (com grant ativo ou
`impersonation_policy = allow_without_consent`) ou "Pedir acesso". As duas chamam
`POST /api/admin/impersonate`, aberta a `platform_owner` e `platform_support`; sem consentimento, ela
responde 403 e avisa os owners. A política se edita em `/admin/configuracoes` e só
`platform_owner` a altera. Regras em `tech/26-seguranca.md`.

## Usuários do portal

`/admin/usuarios` tem duas abas. Clientes e leads são outra identidade (`portal_user`):
`GET /api/admin/users?scope=portal` traz organizações e sessões em aberto, e
`POST /api/admin/portal-users/:id/revoke-sessions`, só do proprietário, derruba as sessões. Não
há banimento: o acesso é de cada tenant, por `customer.status`. O overview conta os clientes
de todos os tenants.

## Ainda não existe

Overview sem MRR e jobs mortos; `/admin/jobs`.

## Fase 10

- `/admin/configuracoes` edita também `dpoEmail` (aparece em `/legal/*`) e `auditRetentionDays` (30 a 3650, padrão 365).
- `/admin` mostra "Jobs mortos": soma das filas `*.dead` do pg-boss (`src/lib/admin/jobs.ts`), `—` se a fila não responder.
- `/admin` mostra "Consumidores da fila": processos vivos por modo (`inline`, `worker`), com alerta para os dois juntos ou nenhum (`tech/20-jobs.md`).

## Exclusões e pessoas (admin-crud, trilha C)

SPEC: `docs/specs/admin-crud/spec.md` (seções 1 a 3). Lógica em `src/lib/admin/deletion.ts`
(exclusões) e `src/lib/admin/people.ts` (detalhe, edição, sessões); o núcleo LGPD é o de
`src/lib/lgpd/deletion.ts` (`tech/27-lgpd-arquivos.md`). Toda escrita é `ownerOnly` +
`blockWhileImpersonating`; sessão personificada já cai no `requirePlatform` (papel do alvo).

| Rota | Quem | Observação |
|---|---|---|
| `DELETE /api/admin/tenants/:id` `{ mode, confirm, reason? }` | owner | `confirm` = slug (400 `CONFIRMATION_MISMATCH`); encerra no provedor antes (409 `PROVIDER_CANCEL_FAILED`, nada agendado); aceita organização suspensa; 409 `DELETION_PENDING` |
| `POST /api/admin/tenants/:id/deletion/cancel` | owner | só pedido `origin = platform` (409 `DELETION_NOT_PLATFORM`, `NO_PENDING_DELETION`); devolve `active` (`read_only` se a assinatura foi encerrada) ou a suspensão anterior |
| `GET /api/admin/tenants/:id/deletion` | plataforma | `{ deletion: { scheduledFor, origin } | null }` |
| `GET /api/admin/users/:id` | plataforma | perfil, papel, 2FA, banido, sessões vivas, organizações (nome, slug, papel, estado de cobrança, plano), exclusão pendente |
| `PATCH /api/admin/users/:id` `{ name?, email? }` | owner | e-mail: 409 `EMAIL_TAKEN`; desverifica, encerra sessões, `email-changed` ao antigo e link de definir senha ao novo (o reset marca verificado, `tech/08-auth.md`); auditoria `admin.user_updated` com os campos (sem valores) |
| `POST /api/admin/users/:id/revoke-sessions` | owner | `{ revoked }` |
| `DELETE /api/admin/users/:id` `{ mode, confirm, reason?, deleteSoleOrganizations }` | owner | `confirm` = e-mail; único owner sem a flag: 409 `LAST_OWNER { tenants }`; com ela, cada organização segue o mesmo `mode` (provedores encerrados antes de tudo). Agendar bane (motivo "Exclusão agendada pela plataforma"; já banido fica como estava) e encerra as sessões na mesma transação |
| `POST /api/admin/users/:id/deletion/cancel` | owner | desbaneia só se `metadata.wasBanned` era `false`; organizações agendadas junto têm o próprio cancelamento |
| `GET`, `PATCH`, `DELETE /api/admin/portal-users/:id`, `.../deletion/cancel` | leitura plataforma; escrita owner | regras em `tech/25-portal-clientes.md` |

- **Alvo:** `assertManageableUser` aceita papel `user` e `platform_support`; `platform_owner` é
  403 `PLATFORM_OWNER_PROTECTED` e o próprio ator, 409 `SELF_ACTION`. Banir continua em
  `assertBannable` (só papel `user`). Conta já anonimizada responde 404.
- **`mode`:** `scheduled` = 30 dias, reversível, acesso cortado na hora; `now` = mesma
  anonimização do job, na hora, sem volta (antecipa pedido pendente de qualquer origem). E-mail
  `deletion-scheduled` (variante da administração) ou `deletion-executed`.
- **Auditoria:** `admin.{tenant,user,portal_user}_deletion_{requested,executed,canceled}` com
  `metadata.mode`; o motivo (texto livre) fica em `deletion_request.metadata.reason`, nunca na
  auditoria. Respostas 409 com dados extras usam `TenantRuleError(..., details)`, que
  `handleTenantError` espalha na raiz do JSON.
- **Telas:** `components/admin/delete-dialog.tsx` (um diálogo para tudo: agendar ou excluir
  agora, digitar o slug ou o e-mail, motivo), `deletion-status.tsx` (faixa da exclusão pendente),
  `person-edit-card.tsx`, `tenant-deletion-card.tsx` (em `/admin/tenants/:id`).
