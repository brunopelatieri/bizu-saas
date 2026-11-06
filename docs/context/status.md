# Status do projeto

- **Escopo:** O que está pronto hoje, por fase da spec, e pendências técnicas conhecidas.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-plano.md` (fases)
- **Paths do código:** `src/lib/content/posts.ts`, `src/root.tsx`, `src/lib/env.ts`, `src/lib/auth/`, `src/lib/billing/`, `src/lib/payments/`

## Fases da spec saas-foundation

| Fase | Entrega | Estado |
|---|---|---|
| 0 | Reposicionamento: textos, docs, rules, `/dashboard` → `/app`, stubs removidos | concluída |
| 1 | Infra local: papéis do Postgres, Mailpit, `.env.example`, `env.ts`, CI com Postgres, `test:db`, seams de e-mail | concluída |
| 2 | Auth núcleo: Better Auth, cadastro, verificação de uso único, reset, troca de e-mail, `requireAuth` por sessão, papéis de plataforma | concluída |
| 3 | E-mail transacional completo (fila, Resend, supressão, templates) e jobs (pg-boss) | concluída |
| 4 | Tenant, equipe, RBAC, RLS e `audit_log` | concluída |
| 5 | Admin e planos: `/admin`, planos, trial, limites, `read_only`, job `billing.trial`, `/precos`, seed | concluída |
| 6 | Billing núcleo + Stripe | concluída; falta o checklist em sandbox real do Stripe |
| 7 | Módulo Asaas | pendente |
| 8 | Portal do cliente | pendente |
| 9 | 2FA, personificação e segurança | pendente |
| 10 | LGPD, arquivos e observabilidade | pendente |
| 11 | Repositório público e README final | pendente |

## Estado atual do código

- React Router Framework Mode com `ssr: true`; Hono integrado via `react-router-hono-server`.
- Site público com SSR: landing reposicionada para SaaS, blog estático em
  `src/lib/content/posts.ts`.
- Autenticação de equipe e plataforma com Better Auth: `/login`, `/cadastro`,
  `/verificar-email`, `/esqueci-senha`, `/redefinir-senha` e troca de e-mail em
  `/app/configuracoes`.
- Multi-tenant com o plugin `organization`: onboarding, seletor de tenant, equipe, convite
  por e-mail em `/convite/:id`, papéis personalizados, `requireTenant`, `requirePermission`,
  `<Can>` e `audit_log` (`tech/21-tenant-rbac.md`).
- RLS forçado com `withTenant` e `withPlatformScope` (`tech/07-banco-drizzle.md`).
- `/app/**` com shell client-side: visão geral, equipe, assinatura e configurações funcionam;
  clientes segue como "em breve". Banner de trial, pagamento pendente e somente leitura.
- `/admin/**` (proprietário e suporte da plataforma): visão geral, organizações, usuários, planos,
  assinaturas, webhooks e configurações, com `requirePlatform` na API (`tech/22-admin.md`).
- Planos, preços, trial no onboarding, limites por plano (assentos), estado `read_only`/`locked` e job
  `billing.trial` (`tech/23-billing-planos.md`). `/precos` público com loader.
- Cobrança (`tech/24-billing-cobranca.md`): máquina de estados pura, `PaymentProvider` com registro por
  `PAYMENT_PROVIDERS`, módulo Stripe, checkout, `/api/billing/*`, faturas, caixa de entrada de
  webhooks, jobs `webhook.process`, `billing.dunning`, `billing.period_end` e `billing.reconcile`.
- `npm run db:seed`: proprietário, suporte, planos e o tenant `acme`.
- `/api/health`, `/api/me`, `/api/tenant`, `/api/team`, `/api/roles`, `/api/invitations`,
  `/api/auth/*`, `/api/auth-ext/*` e `/api/contact` com rate limit, limite de corpo e headers
  de segurança.
- Variáveis de ambiente validadas em `src/lib/env.ts` na inicialização.
- Postgres do Docker com `bizu_owner` e `bizu_app` (`docker/postgres/init.sql`) e Mailpit.
- E-mail: `sendEmail` grava `email_message` e enfileira `email.send` (pg-boss, retry 5x,
  dead letter, supressão); provedores `smtp`, `resend` e `memory`; webhook
  `POST /api/webhooks/email/:provider`; 14 templates gerais; `npm run email:preview`
  (`tech/19-email.md`, `tech/20-jobs.md`).
- Jobs: pg-boss 12 no schema `pgboss` (`npm run jobs:install`), `JOBS_MODE=inline|worker|off`,
  `maintenance.prune`, `GET /api/ready`. Filas de LGPD entram na fase 10.
- Biome, Vitest (`npm test` sem banco, `npm run test:db` com banco) e CI com Postgres.
- Dockerfile multi-stage para VPS.

## Pendências Técnicas Conhecidas

- Fases 7 a 11 da spec.
- **Stripe sem sandbox real:** o módulo foi validado com fixtures escritas a partir dos tipos do SDK e
  com webhooks assinados pelo SDK contra o build de produção, mas sem conta de teste. Rode o checklist de
  `src/lib/payments/providers/stripe/README.md` e troque as fixtures por capturas anonimizadas.
- `payment_event` fora do `maintenance.prune` (fase 10); `platform_setting.alert_email` não existe.
- Reembolso sem tela: sai pelo painel do provedor e chega por webhook.
- `consent_log` (fase 10) ainda não existe: o aceite de termos é exigido, mas não registrado.
- `audit_log` grava, mas sem tela de leitura (`/app/auditoria`, `/admin/auditoria`).
- Teto de tenants por usuário (3) e de papéis personalizados (20) seguem constantes do plugin; só `members` usa o limite do plano (`tech/23-billing-planos.md`).
- Overview do admin sem MRR e jobs mortos; sem `/admin/auditoria`, `/admin/jobs`.
- Rate limit das rotas próprias em memória até a fase 9.
- Evoluir blog estático para tabela Drizzle quando virar feature real.
- Migrar para React Router 8 e `react-router-hono-server` 4 para zerar os alertas
  moderados restantes (`tech/16-bugs-riscos.md`), depois da entrega da spec.
- Stack Portainer completa (`docker/compose.prod.yml`) na fase 11.

## Desvios da spec na fase 6

Decisões registradas com o motivo. Detalhes em `tech/24-billing-cobranca.md`.

| Spec | Entregue | Motivo |
|---|---|---|
| `Capabilities`, `PaymentProvider` e `NormalizedEvent` fechados | Campos aditivos, marcados "Além da spec" em `types.ts`: `nativeTrial`, `proration`, `requiresPriceRef`, `resumeSubscription`, `chargeOnce`, `enrichEvent`, `occurredAt`, `metadata`, `priceRef`, período e valor | O contrato da spec não ordena eventos, não resolve a assinatura por metadados e não traz valor em `invoice.created`. No Stripe atual, `Charge` não aponta para a fatura |
| `payment_event` sem RLS | Com RLS forçado | Tem `tenant_id` e `raw` com dado pessoal; `tests/db/rls.test.ts` exige |
| `invoice.provider_ref` unique | Unique `(provider, provider_ref)` | Referências de provedores diferentes podem coincidir |
| Assinatura inválida com `payment_event` | Com a linha, mas `raw` nulo | Não guardar corpo de quem não provou quem é |
| `status = duplicate` na linha | Só na resposta | A unique preserva a linha original |
| Ordem por `subscription_event` | Por `metadata.lastProviderEventAt` | Evento sem mudança de status também conta, e evento de job não pode descartar pagamento real |
| `invoice.paid` e `trialing → past_due` | Acrescentado para trial nativo | Falha na primeira cobrança real |
| Downgrade só em `current_period_end` | Plano local no fim do período, preço no provedor na hora | O job é horário: cobraria a renovação pelo preço antigo |
| Reconciliação gera evento e alerta | Também corrige o estado | Evento perdido deixaria tenant pago bloqueado até alguém agir |
| `GET /api/billing/portal` | `POST` | Abre sessão no provedor; pedido no brief da fase |
| `GET /api/billing/plans` só com `requireTenant` | Com `billing:read` | Pedido no brief da fase |
| Sem rota de pausa | `POST /api/billing/pause` | A spec expõe "pausar" e não tinha rota |
| Checkout `não personificado` | Sem a checagem | Personificação é da fase 9 |

