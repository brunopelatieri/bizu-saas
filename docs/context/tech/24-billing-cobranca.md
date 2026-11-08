# Cobrança: assinatura, provedores e webhooks

- **Escopo:** Máquina de estados da assinatura, cobrança manual (padrão sem provedor), módulos de pagamento, checkout, webhooks, faturas, dunning, fim do período e reconciliação (fase 6). Planos, trial e limites estão em `tech/23-billing-planos.md`.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-billing.md`, `docs/specs/cobranca-manual/spec.md`, `spec-dados.md`, `spec-rotas-api.md`, `spec-email-jobs.md`, `spec-seguranca.md`
- **Paths do código:** `src/lib/billing/` (`state-machine.ts`, `apply.ts`, `manual.ts`, `checkout.ts`, `inbox.ts`, `invoices.ts`, `reconcile.ts`, `dunning.ts`, `notices.ts`, `proration.ts`), `src/lib/payments/` (`types.ts`, `registry.ts`, `providers/`), `src/api/billing.ts`, `src/api/webhooks-payments.ts`, `src/jobs/webhooks.ts`, `src/jobs/billing.ts`, `src/lib/schemas/billing.ts`, `src/lib/admin/subscriptions.ts`, `src/components/app/billing/`, `src/pages/{subscription,invoices,checkout-return}-page.tsx`, `src/pages/admin/{subscriptions,webhooks}-page.tsx`, `drizzle/0010_billing_cobranca.sql`, `drizzle/0011_rls_cobranca.sql`, `scripts/check-module-removal.mjs`, `tests/db/billing-{webhooks,lifecycle,queue}.test.ts`

## Como as peças se ligam

O estado fica no Postgres; o provedor executa. O núcleo só conhece `PaymentProvider`, e nenhum
arquivo fora de `providers/<id>/` importa um módulo (`registry.test.ts` reprova).

```text
owner → POST /api/billing/checkout → provedor (redirect ou inline)
provedor → POST /api/webhooks/payments/:provider → payment_event → webhook.process
                                                                     ├─ transition()
                                                                     ├─ subscription + invoice
                                                                     └─ e-mail, depois do commit
```

Toda escrita em provedor vem antes da transação local: se ele recusar, nada muda aqui; se a
gravação falhar depois, o webhook e a reconciliação trazem o estado de volta.

## Cobrança manual (padrão)

Com `PAYMENT_PROVIDERS` vazio, a cobrança é manual: o proprietário marca em `/admin/tenants/:id` quem
pagou e quem não pagou (`manual.ts`, `components/admin/manual-billing-card.tsx`). Com provedor ativo,
continua valendo para toda assinatura sem cobrança viva no provedor (`isProviderManaged`), e a do
provedor não é tocada.

- **Preço:** `plan_price` com `provider = manual` (sem referência). `getProvider("manual")` é `null`:
  o checkout recusa, e `toPlanPrice` também. Sem provedor, `/precos` e `GET /api/billing/plans`
  (`billingMode: manual`, `manualPrices`) mostram esse valor; `/app/assinatura` diz que a troca é com
  a plataforma.
- **Fatura:** `invoice` com `provider = manual`, `provider_ref` nulo e `period_start`/`period_end`.
- **Vencimento:** `billing.period_end`, depois dos downgrades, pega `active` + plano pago + sem
  referência + `current_period_end` no passado: abre a fatura do período seguinte (se não houver uma
  aberta) e passa a `past_due` com `grace_until = vencimento + grace_days` (`manual.due`). Daí é o
  `billing.dunning` de sempre. Sem preço manual, só transita e loga.
- **Pagou** (`manual.paid`): fatura aberta (ou nova) `paid`; `active` + `full`, sem carência nem avisos,
  `provider` e referência nulos. O período (`manualPeriod`) continua do início da fatura aberta ou do
  vencimento em `active`/`past_due` e começa agora nos demais estados (em somente leitura o tenant não
  usou nada); se ainda assim terminasse no passado, começa agora. O fim soma o intervalo do preço
  (`addInterval`, mês de calendário). A fatura paga passa a dizer o período, e o valor quando o admin
  escolhe o preço.
- **Não pagou** (`manual.unpaid`): fatura `failed`; `active`/`trialing` → `past_due` com carência a
  partir de agora, ou `unpaid` + `read_only` com `immediate`. Sem fatura aberta, a nova cobre o período
  corrente se ele ainda corre, ou o devido se já venceu (`unpaidPeriod`).
- **Para o provedor:** com um módulo ligado, a assinatura manual (`active` ou `past_due`, sem
  referência) pode fazer checkout (`canStartCheckout`); o primeiro pagamento a liga ao provedor.
- **Auditoria:** `admin.manual_payment_recorded`, `admin.manual_payment_missed` e
  `billing.subscription_changed` (ator `platform`; no job, `system`).

## Tabelas

| Tabela | Escopo | Observações |
|---|---|---|
| `billing_profile` | tenant, RLS forçado | uma por tenant, exigida antes do checkout. `document` só com dígitos, conferido por dígito verificador |
| `invoice` | tenant, RLS forçado | espelho local, ou fatura manual (`provider = manual`). Unique `(provider, provider_ref)`; `provider_ref` nulo entre o checkout inline e o primeiro evento, e sempre na manual. `period_start`/`period_end` (migration `0020`) |
| `payment_event` | plataforma, RLS forçado | caixa de entrada. Unique `(provider, provider_event_id)`. Só se lê com `withPlatformScope` |
| `subscription_event` | tenant | ganhou `occurred_at` (hora no provedor) e FK `payment_event_id` |

`payment_event.raw` guarda só o evento verificado: recusado fica com `raw` nulo. Dos cabeçalhos
ficam só `content-type` e `user-agent`, porque outros podem trazer segredo (token estático do
provedor). `status = duplicate` não é gravado: a unique mantém a linha original e a resposta
diz `duplicate`.

## Estados

`transition(atual, evento, agora)` (`state-machine.ts`) é pura; `applyDecision` (`apply.ts`) grava
com a linha travada por `lockSubscription` e registra `subscription_event`.

| De | Para | Gatilho |
|---|---|---|
| `trialing` | `active` | `invoice.paid` |
| `trialing` com assinatura no provedor | `past_due` | `invoice.payment_failed` (trial nativo que falhou na primeira cobrança) |
| `trialing` | `expired` + `read_only` | job `billing.trial` |
| `active` | `past_due` + `grace_until` | `invoice.payment_failed` ou `subscription.updated` com `past_due` |
| `past_due` | `active` | `invoice.paid` |
| `past_due` | `unpaid` + `read_only` | job `billing.dunning`, após `grace_until` |
| `unpaid`, `expired`, `canceled` | `active` | `invoice.paid` de checkout novo (reativação) |
| `active` | `paused` + `read_only` | `POST /api/billing/pause`, só com `capabilities.pause` |
| `paused` | `active` | `POST /api/billing/reactivate` ou o provedor retomar |
| vivo | `canceled` + `read_only`, ou `active` no plano gratuito | fim do período, ou `subscription.canceled` |
| qualquer | `canceled` + `read_only` | admin (imediato) |

Regras que não saem da tabela:

- **Só pagamento ativa.** `subscription.updated` nunca tira de `trialing` nem de `past_due`.
- **Fatura antiga não reabre.** `invoice.paid` da mesma assinatura depois do `canceled` é ignorado;
  por isso `canceled` mantém `provider_subscription_ref`. Quem migra para o gratuito perde a
  referência, ou a reconciliação tentaria encerrar de novo.
- **Segundo checkout pago** com assinatura viva não substitui a primeira: vira alerta
  `duplicate_subscription`. Reativação troca a referência e cancela a antiga no provedor, depois
  do commit; se isso falhar, fica o mesmo alerta. Em `unpaid`, o checkout não troca de provedor
  (409 `PROVIDER_MISMATCH`): a assinatura antiga ficaria sem dono.
- **`paid` da API** (`isLiveStatus`) só vale para cobrança viva: `canceled` e `unpaid` guardam a
  referência, mas a tela oferece checkout.
- **Evento de outra assinatura não mexe nesta:** `subscription.canceled` da substituída é
  `other_subscription`.
- **Pausa corta o serviço.** O provedor anula as faturas da pausa: com acesso mantido, seria o
  plano de graça. `metadata.paidThrough` guarda até quando estava pago. Retomar antes disso não
  cobra; depois, abre um ciclo novo cobrado na hora (`chargeNow`), e a recusa deixa tudo pausado.
  Sem isso, pausar um minuto antes da renovação e retomar depois dela daria um ciclo grátis.
- **`locked` vence:** só `full` vira `read_only` e só `read_only` volta a `full`.
- **Fora de ordem:** `metadata.lastProviderEventAt` guarda o maior `occurred_at` aplicado, mesmo
  quando o evento não mudou a assinatura. Evento mais antigo vira `ignored`. O mesmo instante
  passa, porque o provedor só informa segundos. A fatura é atualizada mesmo assim: um
  pagamento atrasado não se perde. Eventos de job não entram nessa conta: o dinheiro que chegou
  depois do `unpaid` precisa valer.
- **Espelho da fatura só anda para a frente:** `nextInvoiceStatus`.

## Checkout e troca de plano (`checkout.ts`)

`startCheckout`: preço ativo → provedor no registro → método em `recurringMethods` (Pix só com
`recurringPix`) → perfil → `canStartCheckout` → `ensureCustomer` (reaproveita a referência salva)
→ `createCheckout`. O plano só muda quando o dinheiro entra: `metadata.planPriceId` volta no
webhook. A chave de idempotência é um hash de assinatura, preço, método e janela de 10 minutos:
clique duplo abre o mesmo checkout.

| Mudança | Comportamento |
|---|---|
| Upgrade | Imediato e só depois da diferença paga. Com `capabilities.proration`, o provedor prorrateia e recusa a troca se a cobrança falhar (502, plano mantido); sem, `prorationCents` + `chargeOnce` |
| Downgrade | O preço novo entra no provedor sem proração, e o plano local espera em `pending_plan_id` até o fim do período. Assim a próxima fatura não sai com o preço antigo |
| Comparação | Por valor mensal: anual vale `valor / 12` |
| Para gratuito | Não existe: é cancelar. No fim do período, migra sozinho |
| Desfazer downgrade | Escolher o plano atual: o provedor volta ao preço e `pending_plan_id` zera. Com downgrade agendado, upgrade responde 409 `PENDING_DOWNGRADE`, porque prorratearia a partir do preço menor |

O downgrade entra no primeiro que chegar: renovação com período novo (`periodPatch`) ou o job
`billing.period_end`. `subscription.updated` com o preço agendado não antecipa o plano.

## Webhooks

`POST /api/webhooks/payments/:provider` (`webhooks-payments.ts`), corpo bruto, 1 MB:

| Situação | Resposta |
|---|---|
| Provedor fora de `PAYMENT_PROVIDERS` | 404, nada gravado |
| 20 assinaturas erradas no minuto, por IP | 429, sem gravar. Checado depois da verificação: assinatura válida nunca é barrada |
| Assinatura inválida | 400 e rastro em `payment_event`, sem corpo |
| Novo | 200, grava `pending` e enfileira |
| Repetido | 200 `duplicate`. Se a linha ainda está `pending`, reenfileira |
| Falha ao gravar ou enfileirar | 500: o provedor reenvia |

`webhook.process` (`src/jobs/webhooks.ts`): `parseWebhook` → `enrichEvent` → `confirm` → numa só
transação, `withPlatformScope("webhook")`, aplica todos os eventos e marca `payment_event`. O
`FOR UPDATE` em `payment_event` faz o segundo job do mesmo evento esperar e encontrar o trabalho
feito. E-mail e cancelamento da assinatura substituída saem depois do commit; falha neles vai
ao log e não repete o evento. Rede só antes da transação.

- **Confiar, mas conferir:** com `webhookSignature` `token` ou `none`, `confirm` só aceita o evento
  depois de `fetchInvoice`/`fetchSubscription`. Valor, assinatura, cliente e metadados vêm da API:
  o corpo poderia citar uma fatura paga de verdade com os metadados de outro tenant.
- **Resolução:** `provider_subscription_ref` → `metadata.subscriptionId` com o mesmo provedor →
  fatura conhecida → cliente, só em evento sem `subscriptionRef`.

## Jobs

| Fila | Cron (UTC) | Faz |
|---|---|---|
| `webhook.process` | por evento | acima; 5 tentativas com backoff, política `exclusive` por `singletonKey = payment_event.id` |
| `billing.dunning` | 03:10 diário | `t3`, `t0`, `unpaid` + `read_only`; idempotente em `metadata.dunningNotices`, limpo quando o pagamento volta |
| `billing.period_end` | de hora em hora | encerra cancelamentos, aplica downgrades vencidos e vence a cobrança manual |
| `billing.reconcile` | 04:00 diário | compara com `fetchSubscription` e devolve à fila os eventos `pending` há mais de 10 min |

A reconciliação **corrige** status, período e plano (`priceRef`), e deixa alerta
(`metadata.alert`, `/admin/assinaturas`), com `subscription_event` de `source = job`. A exceção é assinatura encerrada aqui e viva no provedor:
só alerta, porque reabrir é decisão de alguém.

## API do owner

`requireAuth` + `requireTenant`, leitura com `billing:read`, escrita com `billing:manage`. Liberada
em `read_only`. Nenhuma resposta traz referência do provedor.

| Rota | Observação |
|---|---|
| `GET /api/billing/plans` | planos ativos, preços dos provedores ativos e capacidades. Preço sem referência some quando o provedor a exige |
| `GET /api/billing/subscription` | assinatura, perfil e 5 últimas faturas |
| `PUT /api/billing/profile` | `billingProfileSchema` |
| `POST /api/billing/checkout` | `{ planPriceId, method }` → `redirect` ou `inline`. 409 `BILLING_PROFILE_REQUIRED`, `METHOD_NOT_AVAILABLE`, `CHECKOUT_NOT_ALLOWED`, `PROVIDER_UNAVAILABLE`, `PRICE_NOT_CONFIGURED` |
| `GET /api/billing/invoices`, `.../:id` | o detalhe traz Pix e boleto, para o polling |
| `POST /api/billing/cancel` | só `{ atPeriodEnd: true }` |
| `POST /api/billing/reactivate` | desfaz o cancelamento agendado ou a pausa |
| `POST /api/billing/pause` | 409 `NOT_SUPPORTED` sem a capacidade |
| `POST /api/billing/change-plan` | `{ planPriceId }` → `change.effectiveAt`: `now` ou `period_end`. 409 `SAME_PLAN`, `PLAN_CHANGE_NOT_ALLOWED`, `PROVIDER_MISMATCH` |
| `POST /api/billing/portal` | só com `capabilities.customerPortal` |

Erro do provedor chega como 502 `PROVIDER_ERROR`, genérico. No log fica só o código: o módulo lança
`PaymentProviderError` sem a mensagem original.

## Telas

`/app/assinatura`, `/app/assinatura/faturas` e `/app/assinatura/retorno`. A página de retorno
ignora a query string e consulta o estado local a cada 3 s por até 2 minutos. O checkout inline
consulta a fatura a cada 5 s. Sem loader; dados por `useBillingMutation`/`useSubscription`
(`billing-api.ts`).

## Adicionar ou remover um provedor

`src/lib/payments/providers/README.md` tem o checklist. `npm run check:module-removal -- <id>` tira
a pasta, roda typecheck e testes e a devolve.

Em `tsx` (seed, worker em dev) o `import.meta.glob` não existe: `registry.ts` lê a pasta à mão.

## Testes

`state-machine.test.ts`, `proration.test.ts`, `registry.test.ts`, `schemas/billing.test.ts`,
`providers/stripe/index.test.ts` (sem banco). `tests/db/billing-webhooks.test.ts` e
`billing-lifecycle.test.ts` usam o provedor stub de `billing-helpers.ts` e chamam o job direto;
`billing-queue.test.ts` usa o pg-boss real.

## Limites conhecidos

- As fixtures do Stripe foram escritas a partir dos tipos do SDK, não capturadas: o checklist do
  README do módulo segue pendente.
- Sem chamada de reembolso na interface: `provider.refund` existe, mas o reembolso sai pelo painel
  do provedor e chega por webhook.
- Dois checkouts simultâneos para planos diferentes podem ser pagos: o segundo vira alerta, e o
  estorno é manual.
- Cupom de 100% não ativa no Stripe (fatura de zero é ignorada).
- Upgrade com boleto: `error_if_incomplete` exige cobrança imediata e tende a recusar quem paga por
  boleto. Falta conferir em sandbox; a saída seria `pending_if_incomplete`, que não aceita `metadata`.
- `platform_setting.alert_email` não existe: o alerta fica só no `/admin`.
- `payment_event` ainda não entra no `maintenance.prune` (fase 10).
