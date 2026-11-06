# SPEC: Modelo de dados, migrations e seed

- **Parte de:** `docs/specs/saas-foundation/spec.md`
- **Paths previstos:** `src/db/schema/*.ts` (um arquivo por domínio, reexportados em
  `src/db/schema.ts`), `src/db/rls.ts`, `src/db/seed.ts`, `drizzle/`, `docker/postgres/init.sql`

Convenções: `uuid` gerado pelo banco (`defaultRandom()`), `timestamptz`
`created_at`/`updated_at` em tudo, `tenant_id` em toda tabela de tenant, dinheiro em
`integer` centavos com `currency` `char(3)` padrão `BRL`, `jsonb` só para
configuração e payload bruto. RLS marcado na coluna "RLS".

## Tabelas do Better Auth (geradas por `npx auth generate`, ajustadas à mão)

| Tabela | Colunas principais | Observações | RLS |
|---|---|---|---|
| `user` | `id`, `name`, `email` unique, `email_verified`, `image`, `role` (`user`/`platform_owner`/`platform_support`), `banned`, `ban_reason`, `ban_expires`, `two_factor_enabled`, `phone`, `locale`, `last_tenant_id` | Campos extras via `additionalFields` | – |
| `session` | `id`, `token` unique, `user_id` FK, `expires_at`, `ip_address`, `user_agent`, `active_organization_id`, `impersonated_by` | Índice `(user_id)` | – |
| `account` | `id`, `user_id`, `provider_id`, `account_id`, `password`, tokens OAuth | `provider_id = credential` para senha | – |
| `verification` | `id`, `identifier`, `value`, `expires_at` | Usada por reset e change-email | – |
| `two_factor` | `id`, `user_id`, `secret`, `backup_codes` | Plugin `twoFactor` | – |
| `rate_limit` | `key`, `count`, `last_request` | `rateLimit.storage: "database"` | – |
| `organization` | `id`, `name`, `slug` unique, `logo`, `metadata`, `status`, `access_mode`, `settings` jsonb, `trial_ends_at`, `deleted_at` | É o tenant | – |
| `member` | `id`, `organization_id`, `user_id`, `role` (csv), `created_at` | Unique `(organization_id, user_id)` | – |
| `invitation` | `id`, `organization_id`, `email`, `role`, `status`, `expires_at`, `inviter_id` | Índice `(email, status)` | – |
| `organization_role` | `id`, `organization_id`, `role`, `permission` jsonb, `description` | Dynamic access control | – |
| `portal_user` | igual a `user` sem `role`/`ban` | `modelName: "portal_user"` | – |
| `portal_session` | igual a `session` + `active_tenant_id` | | – |
| `portal_account`, `portal_verification`, `portal_rate_limit` | | | – |

## Tabelas do domínio

| Tabela | Colunas principais | Observações | RLS |
|---|---|---|---|
| `email_verification_issue` | `user_id` PK, `token_hash` char(64), `issued_at`, `kind` (`verify`/`change`) | Uso único e invalidação; apagada no consumo | – |
| `user_preference` | `user_id` PK, `last_tenant_id`, `theme`, `notifications` jsonb | | – |
| `billing_profile` | `id`, `tenant_id` unique, `legal_name`, `document` (CPF/CNPJ), `document_type`, `email`, `address` jsonb | Dados de faturamento do tenant | ✓ |
| `customer` | `id`, `tenant_id`, `portal_user_id` FK nullable, `name`, `email`, `phone`, `document`, `status` (`lead`/`active`/`blocked`), `tags` text[], `notes`, `invited_at`, `last_login_at` | Unique `(tenant_id, email)`; índice `(portal_user_id)` | ✓ |
| `plan` | `id`, `slug` unique, `name`, `description`, `limits` jsonb, `features` text[], `trial_days` int, `is_free` bool, `active` bool, `sort_order` | Gerido em `/admin/planos` | – |
| `plan_price` | `id`, `plan_id`, `provider` (`stripe`/`asaas`/...), `interval` (`month`/`year`), `amount_cents`, `currency`, `provider_price_ref`, `active` | Um preço por provedor e intervalo | – |
| `subscription` | `id`, `tenant_id` unique (uma ativa por tenant), `plan_id`, `plan_price_id` nullable, `status`, `provider` nullable, `provider_customer_ref`, `provider_subscription_ref`, `trial_ends_at`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `canceled_at`, `grace_until`, `pending_plan_id` (downgrade agendado), `metadata` jsonb | `status`: `trialing`, `active`, `past_due`, `unpaid`, `paused`, `canceled`, `expired` | ✓ |
| `subscription_event` | `id`, `tenant_id`, `subscription_id`, `from_status`, `to_status`, `reason`, `source` (`webhook`/`admin`/`job`/`owner`), `payment_event_id` nullable | Histórico da máquina de estados | ✓ |
| `invoice` | `id`, `tenant_id`, `subscription_id`, `provider`, `provider_ref` unique, `amount_cents`, `currency`, `status` (`open`/`paid`/`failed`/`refunded`/`void`), `payment_method` (`pix`/`boleto`/`card`), `due_at`, `paid_at`, `hosted_url`, `pix_payload`, `boleto_line`, `attempt` | Espelho local da fatura | ✓ |
| `payment_event` | `id`, `provider`, `provider_event_id`, `event_type`, `raw` jsonb, `headers` jsonb, `received_at`, `verified` bool, `status` (`pending`/`processed`/`ignored`/`failed`/`duplicate`), `processed_at`, `error`, `attempts`, `tenant_id` nullable | Unique `(provider, provider_event_id)`; caixa de entrada de webhooks | – |
| `tenant_payment_credential` | `id`, `tenant_id`, `provider`, `encrypted_secret` bytea, `key_version`, `label`, `sandbox` bool | Fluxo (b) futuro; AES-256-GCM | ✓ |
| `platform_setting` | `key` PK, `value` jsonb, `updated_by`, `updated_at` | `trial_plan_id`, `trial_days`, `grace_days`, `impersonation_policy`, `max_tenants_per_user`, `invoice_retention_years`, `default_payment_provider` | – |
| `tenant_feature_override` | `id`, `tenant_id`, `feature`, `enabled`, `expires_at`, `reason` | Unique `(tenant_id, feature)` | ✓ |
| `usage_counter` | `tenant_id`, `metric`, `period` date, `value` bigint | PK composta | ✓ |
| `audit_log` | `id`, `tenant_id` nullable, `actor_type` (`user`/`portal_user`/`system`/`platform`), `actor_id`, `impersonator_id` nullable, `action` (`auth.email_verified`, `member.role_changed`, ...), `target_type`, `target_id`, `metadata` jsonb (sem PII), `ip_hash`, `created_at` | Índices `(tenant_id, created_at)`, `(actor_id)`; particionável por mês depois | ✓ (plataforma lê com bypass) |
| `impersonation_grant` | `id`, `tenant_id`, `granted_by` (user), `scope` (`tenant`), `expires_at`, `revoked_at`, `used_by` nullable | | ✓ |
| `consent_log` | `id`, `subject_type` (`user`/`portal_user`), `subject_id`, `kind` (`terms`/`privacy`/`marketing`), `version`, `accepted` bool, `ip_hash`, `user_agent`, `created_at` | | – |
| `deletion_request` | `id`, `subject_type` (`user`/`portal_user`/`tenant`), `subject_id`, `tenant_id` nullable, `requested_by`, `scheduled_for`, `executed_at`, `status` | Carência 30 dias | ✓ quando `tenant_id` |
| `data_export` | `id`, `subject_type`, `subject_id`, `tenant_id` nullable, `status`, `file_key`, `expires_at` | Resultado do job `lgpd.export` | ✓ quando `tenant_id` |
| `email_message` | `id`, `tenant_id` nullable, `to_hash`, `template`, `provider`, `provider_message_id`, `status` (`queued`/`sent`/`delivered`/`bounced`/`complained`/`failed`), `error`, `sent_at` | Sem o corpo; `to_hash` = sha256 do e-mail | – |
| `email_suppression` | `email_hash` PK, `reason` (`hard_bounce`/`complaint`/`manual`), `created_at` | Bloqueia envio | – |
| `file` | `id`, `tenant_id`, `owner_type`, `owner_id`, `key`, `name`, `size`, `mime`, `provider`, `created_by` | Módulo de arquivos | ✓ |
| `notification` | `id`, `tenant_id`, `recipient_type`, `recipient_id`, `kind`, `title`, `body`, `read_at` | Módulo opcional | ✓ |
| `contact_messages` | existente | mantida | – |

## Relações principais

```text
user ──< member >── organization(tenant) ──1 subscription >── plan >── plan_price
                                   │             └──< invoice
                                   ├──< customer >── portal_user
                                   ├──1 billing_profile
                                   ├──< audit_log, impersonation_grant, usage_counter,
                                   │    tenant_feature_override, file, notification
payment_event ──(resolve)──> subscription / invoice
```

## Migrations

- Schema em `src/db/schema/{auth,portal-auth,tenant,billing,platform,audit,lgpd,email,files}.ts`;
  `src/db/schema.ts` reexporta. O Better Auth recebe o `schema` completo no adapter.
- Fluxo: alterar schema → `npm run db:generate` → revisar SQL → `npm run db:migrate`.
  Policies de RLS declaradas com `pgPolicy` no schema; `FORCE ROW LEVEL SECURITY` e
  `GRANT`s para `bizu_app` em migration customizada `drizzle/00xx_rls_roles.sql`
  (`drizzle-kit generate --custom`).
- Papéis do Postgres: `docker/postgres/init.sql` cria `bizu_owner` e `bizu_app` no
  primeiro `docker compose up`. Em produção, o README traz o SQL equivalente.
  Migration **não** cria roles (depende de superusuário).
- Runtime: `DATABASE_URL` com `bizu_app`; `DIRECT_URL` com `bizu_owner`.
  `drizzle.config.ts` segue usando `DIRECT_URL`.
- Deploy: migrations rodam em job separado (`docker compose run --rm migrate`),
  serviço `migrate` no `docker/compose.prod.yml` com a imagem de build (tem
  `drizzle-kit`) e `command: npm run db:migrate`.
- Migrations antigas (`profiles`) ficam no histórico; o rollout cria tudo do zero
  em projetos derivados (`db:migrate` aplica o journal inteiro).
- Rollout de dados existentes: `contact_messages` não muda. Não há dados a migrar.

## Seed (`npm run db:seed`, `src/db/seed.ts`)

Idempotente (upsert por e-mail/slug). Recusa `NODE_ENV=production` sem
`SEED_ALLOW_PRODUCTION=1`. Senha única `SEED_PASSWORD` (padrão documentado no
`.env.example`, nunca em produção). Usa `auth.api.signUpEmail` para gerar hashes
compatíveis e depois marca `email_verified = true` por update direto (exceção
registrada no README).

| Entidade | Dados |
|---|---|
| Proprietário | `owner@bizu.local`, `role = platform_owner`; `suporte@bizu.local`, `platform_support` |
| Planos | `free` (gratuito, `is_free`, limites 2 membros/20 clientes); `pro` (R$ 99/mês, R$ 990/ano, 10 membros/1000 clientes, `trial_days 14`); `business` (R$ 299/mês, ilimitado, features `audit_export`, `custom_roles`) |
| `platform_setting` | `trial_plan_id = pro`, `trial_days = 14`, `grace_days = 7`, `impersonation_policy = consent` |
| Tenant "Clínica Acme" | slug `acme`, `subscription` `trialing` até +14 d; `billing_profile` com CNPJ fictício válido |
| Equipe | `acme.owner@bizu.local` (owner), `acme.admin@bizu.local` (admin), `acme.membro@bizu.local` (member), papel personalizado `recepcao` (`customer:read/create/update`) |
| Tenant "Studio Beta" | slug `beta`, plano `free`; `acme.admin@bizu.local` também é `member` aqui (prova multi-tenant) |
| Clientes | `julia@cliente.local` (`active` em `acme` e `beta`, com `portal_user` e senha), `lead@cliente.local` (`lead` em `acme`, sem senha) |
| `plan_price` | preços com `provider_price_ref` nulos; o README explica como preencher com ids do Stripe/Asaas |
| `audit_log` | 5 eventos de exemplo |

Script `npm run db:reset` = drop schema + migrate + seed, só em dev.
