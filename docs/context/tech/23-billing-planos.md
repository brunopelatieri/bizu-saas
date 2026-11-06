# Planos, trial e limites

- **Escopo:** Planos e preços, configurações da plataforma, assinatura e trial, estado de cobrança do tenant, limites e features, job `billing.trial`, seed. A cobrança em si (checkout, webhooks, provedores) está em `tech/24-billing-cobranca.md`.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-billing.md`, `spec-dados.md`, `spec-tenant-rbac.md` (limites), `spec-email-jobs.md`
- **Paths do código:** `src/lib/billing/` (`constants.ts`, `trial.ts`, `state.ts`, `settings.ts`, `subscription.ts`, `limits.ts`, `summary.ts`, `notify.ts`, `public-plans.server.ts`), `src/db/schema/billing.ts`, `src/jobs/billing.ts`, `src/db/seed.ts`, `src/lib/schemas/admin.ts`, `tests/db/{billing,admin}.test.ts`, `drizzle/0008_billing_planos.sql`, `drizzle/0009_rls_billing.sql`

## Tabelas

| Tabela | Escopo | Observações |
|---|---|---|
| `plan` | plataforma, sem RLS | `slug` único e imutável, `limits` jsonb, `features` text[], `is_free`, `active`, `sort_order`. Nunca se apaga: `active = false` tira de `/precos` e da oferta, e quem já usa segue nele |
| `plan_price` | plataforma, sem RLS | um por (plano, provedor, intervalo); `amount_cents` em centavos, `currency` `BRL`, `provider_price_ref` só como campo (preenchido em `/admin/planos`) |
| `platform_setting` | plataforma, sem RLS | uma chave por linha; ver abaixo |
| `subscription` | tenant, RLS forçado | uma por tenant. Estados e colunas do provedor em `tech/24-billing-cobranca.md` |
| `subscription_event` | tenant, RLS forçado | toda transição grava uma linha (`system`, `admin`, `job`, `owner`, `webhook`) |

`plan.limits`: `{ members, customers, storage_mb, custom_roles }`. Chave ausente ou `null` =
ilimitado; `0` não deixa criar nada.

## Configurações da plataforma

`loadSettings()` (`settings.ts`) lê, com padrão se faltar ou vier malformado:

| Chave | Padrão | Significado |
|---|---|---|
| `trial_plan_id` | `null` | plano que o tenant novo recebe. `null`: o primeiro plano gratuito ativo |
| `trial_days` | 14 | `> 0`: `trialing` até `agora + dias`. `0`: sem teste |
| `grace_days` | 7 | dias de acesso total depois do fim do teste, antes do `read_only` |

`PATCH /api/admin/settings` valida contra o banco: plano ativo e, com `trial_days = 0`, plano
**gratuito** (senão o tenant nasceria com plano pago sem pagar). Mudar a configuração **não altera
tenants já criados**.

## Trial no onboarding

`POST /api/tenant` chama `startTrial(tenantId)` (`subscription.ts`) depois de criar a
organização. A decisão é a função pura `initialSubscription` (`trial.ts`):

| Plano escolhido | Dias | Resultado |
|---|---|---|
| gratuito | qualquer | `active`, sem `trial_ends_at` (gratuito sem fim) |
| pago | `> 0` | `trialing`, `trial_ends_at = agora + dias` |
| pago | `0` | cai no plano gratuito ativo; sem gratuito, nenhuma assinatura |

Sem assinatura (tenant anterior à fase 5, ou sem plano utilizável) o tenant não tem limites nem
features. Falha em `startTrial` vai para `logError` e não derruba o onboarding. É idempotente
(`ON CONFLICT DO NOTHING` em `tenant_id`). `organization.trial_ends_at` guarda a mesma data.

## Estado de cobrança

`billingState()` (`state.ts`), exposto em `GET /api/me` como `billing.state`:

| Estado | Quando |
|---|---|
| `locked` | `status <> active` ou `access_mode = locked` (suspenso): `requireTenant` responde 403 `TENANT_SUSPENDED` a tudo |
| `read_only` | `access_mode = read_only`: lê normal; mutações respondem 403 `TENANT_READ_ONLY`, exceto `/api/billing/*` |
| `trialing` | assinatura `trialing` |
| `past_due` | pagamento falhou, ainda na carência: acesso total, com aviso (`graceUntil` em `/api/me`) |
| `active` | o resto |

`/api/me` devolve `billing` (`state`, `plan`, `trialEndsAt`, `trialDaysLeft`), `features[]` e
`limits{}` (só os definidos) do plano da assinatura. Em `locked`, features e limites vêm vazios.
O banner de `/app` (`BillingBanner`) só informa; quem barra é a API.

## Limites e features

`checkLimit(tenantId, metric)` (`limits.ts`) compara o uso com `plan.limits[metric]` e devolve
`{ limit, used, allowed }`; `assertWithinLimit` lança 403 `PLAN_LIMIT_REACHED`. A fonte de dados
é injetável (`LimitSource`) para testar sem banco.

- `members` conta membros **e convites pendentes e vigentes**: o convite já reserva o assento.
  Reconvidar o mesmo e-mail não ocupa um segundo (`ignoreInvitationEmail`); aceitar ignora o
  próprio convite (`ignoreInvitationId`).
- Aplicado em `POST /api/team/invitations` e `POST /api/invitations/:id/accept`.
- `custom_roles` conta `organization_role`, mas **ainda não é aplicado** (o teto de 20 do plugin
  continua valendo). `customers` e `storage_mb` contam 0 até as fases 8 e 10.
- Features: `GET /api/me` entrega a lista; `hasFeature` no servidor e `tenant_feature_override`
  ficam para quando a primeira feature for cobrada.

## Job `billing.trial`

Cron diário 03:00 UTC (`src/jobs/billing.ts`, fila `billing.trial`, 3 tentativas, dead letter
`billing.trial.dead`). Para cada assinatura `trialing` de tenant ativo, `dueTrialNotice` devolve
o aviso mais urgente devido:

| Aviso | Quando | Efeito |
|---|---|---|
| `t3` / `t1` | faltam ≤ 3 / ≤ 1 dia | e-mail `trial-ending` |
| `t0` | o trial acabou, dentro da carência | e-mail `trial-ending` ("termina hoje") |
| `expired` | passou `trial_ends_at + grace_days` | `status = expired`, tenant `read_only`, evento, auditoria, e-mail `trial-expired` |

Idempotência: cada aviso é reservado em `subscription.metadata.trialNotices.<aviso>` por
`UPDATE` condicional **antes** de enviar; rodar duas vezes não repete e-mail. Se o envio falha
(enfileirar), a reserva é desfeita e o job relança no fim para o pg-boss tentar de novo; falha
de um tenant não impede os outros. Quem já tem assinatura no provedor (trial nativo) fica fora: cobrar
e encerrar é com ele. Tenant suspenso não é tocado, e suspensão (`locked`) tem
precedência sobre `read_only`. `runBillingTrial(now, { tenantIds })` aceita um relógio e um
filtro, usados pelos testes. Destinatários: proprietários do tenant (`listTenantOwners`).

## Seed

`npm run db:seed` (`src/db/seed.ts`): idempotente, recusa `NODE_ENV=production` sem
`SEED_ALLOW_PRODUCTION=1`, exige `SEED_PASSWORD` (mín. 10). Cria planos `free`, `basic` e `pro`
(preços no provedor `stripe`, `provider_price_ref` nulo), as três configurações (`trial_plan_id`
= `pro`, 14 e 7 dias), `owner@bizu.local` (`platform_owner`), `suporte@bizu.local`
(`platform_support`) e o tenant `acme` (`acme.owner`, `acme.admin`, `acme.membro`, trial no
`pro`). Só cria o que falta: planos e configurações editados em `/admin` não são sobrescritos.
Usa o papel de runtime (`DATABASE_URL`) e insere as contas já verificadas, com o hash do
próprio Better Auth.

## Fora desta fase

`billing.usage` e `usage_counter`; `tenant_feature_override`; `max_tenants_per_user` em
`platform_setting` (o plugin lê um número fixo na criação); perfil de cobrança no onboarding.
