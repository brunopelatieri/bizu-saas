# SPEC: Planos, assinaturas, módulos de pagamento e webhooks

- **Parte de:** `docs/specs/saas-foundation/spec.md`
- **Paths previstos:** `src/lib/billing/` (núcleo), `src/lib/payments/types.ts`,
  `src/lib/payments/registry.ts`, `src/lib/payments/providers/<id>/`, `src/api/billing.ts`,
  `src/api/webhooks.ts`, `src/jobs/billing.ts`

## Dois fluxos

| Fluxo | Quem paga quem | Credenciais | Entrega |
|---|---|---|---|
| **(a)** Owner paga a assinatura do SaaS ao proprietário | tenant → plataforma | variáveis de ambiente da plataforma | primeira entrega: núcleo + Stripe + Asaas |
| **(b)** Owner cobra seus clientes/leads | cliente → tenant (com ou sem split para a plataforma) | `tenant_payment_credential` por tenant, ou subconta/Connect | módulo futuro; interface já recebe `PaymentContext.credentials` |

## Planos e trial

- `plan` + `plan_price` geridos em `/admin/planos`. Plano `is_free` não precisa de
  provedor nem de preço.
- Trial: `platform_setting.trial_plan_id` e `trial_days`. `trial_days = 0` com plano
  `is_free` = **gratuito sem fim** (o tenant nasce `active` no plano free, sem
  `trial_ends_at`). `trial_days > 0` = `subscription.status = trialing`,
  `trial_ends_at = now + days`, sem provedor.
- Ao criar o tenant no onboarding, `startTrial(tenantId)` aplica a configuração
  vigente; mudar a configuração não altera tenants já criados.
- Limites e features vêm do plano da assinatura corrente (`trialing` usa o plano do
  trial).

## Máquina de estados da assinatura

| De | Para | Gatilho |
|---|---|---|
| – | `trialing` / `active` (free) | onboarding |
| `trialing` | `active` | `invoice.paid` do provedor |
| `trialing` | `expired` + `access_mode = read_only` | job `billing.trial` após `trial_ends_at + grace_days` sem pagamento; e-mails em T-3, T-1, T0 |
| `active` | `past_due` + `grace_until = now + grace_days` | `invoice.payment_failed` / fatura vencida |
| `past_due` | `active` | `invoice.paid` |
| `past_due` | `unpaid` + `read_only` | job `billing.dunning` após `grace_until`; e-mails T-3, T0 |
| `unpaid` / `expired` / `canceled` | `active` | novo checkout pago (reativação) |
| `active` | `canceled` no fim do período | owner cancela; `cancel_at_period_end = true`; job encerra em `current_period_end` → `read_only` se não houver plano free; com plano free, migra para free |
| `active` | `paused` | só Stripe (`pause_collection`); exposto como "pausar" quando `capabilities.pause` |
| qualquer | `canceled` imediato | proprietário em `/admin` |

Upgrade: imediato; provedor com proração (Stripe `proration_behavior`) ou nova
cobrança proporcional calculada no núcleo quando o provedor não prorrateia (Asaas:
atualiza `value` da assinatura e cria cobrança avulsa da diferença). Downgrade:
`pending_plan_id` aplicado por job em `current_period_end`. Reativação: novo
checkout. Toda transição grava `subscription_event`.

Modo `read_only`: `requireTenant` bloqueia mutações exceto `/api/billing/*` e
`/api/me/*`; banner com CTA para `/app/assinatura`.

## Interface do módulo (`src/lib/payments/types.ts`)

```ts
export type ProviderId = "stripe" | "asaas" | "mercadopago" | "pagarme" | "pagbank";

export type Capabilities = {
  pix: boolean; boleto: boolean; card: boolean; debitCard: boolean;
  recurring: boolean;          // assinatura nativa no provedor
  recurringPix: boolean;       // Pix recorrente para empresa no Brasil
  split: boolean; refund: boolean; partialRefund: boolean;
  hostedCheckout: boolean; customerPortal: boolean; pause: boolean;
  sandbox: boolean; webhookSignature: "hmac" | "ecdsa" | "token" | "none";
};

export type PaymentContext = {
  credentials?: TenantCredentials;   // ausente no fluxo (a): usa env
  sandbox: boolean;
};

export interface PaymentProvider {
  id: ProviderId;
  capabilities: Capabilities;
  ensureCustomer(ctx, input: { tenantId; billingProfile }): Promise<{ customerRef: string }>;
  createCheckout(ctx, input: {
    customerRef; price: PlanPrice; methods: ("pix"|"boleto"|"card")[];
    successUrl; cancelUrl; idempotencyKey; metadata: { tenantId; subscriptionId }
  }): Promise<{ kind: "redirect"; url } | { kind: "inline"; pixPayload?; boletoUrl?; expiresAt }>;
  createSubscription?(ctx, input): Promise<{ subscriptionRef; status; currentPeriodEnd }>;
  updateSubscription?(ctx, ref, input: { price; prorate: boolean }): Promise<void>;
  cancelSubscription(ctx, ref, input: { atPeriodEnd: boolean }): Promise<void>;
  pauseSubscription?(ctx, ref): Promise<void>;
  refund(ctx, input: { invoiceRef; amountCents? ; idempotencyKey }): Promise<{ refundRef; status }>;
  fetchSubscription(ctx, ref): Promise<RemoteSubscription>;      // reconciliação
  fetchInvoice(ctx, ref): Promise<RemoteInvoice>;                // confirmação
  verifyWebhook(ctx, req: { headers; rawBody: string; url }): Promise<{ ok: true; eventId: string } | { ok: false; reason }>;
  parseWebhook(rawBody: string): NormalizedEvent[];
  portalUrl?(ctx, customerRef): Promise<string>;
}

export type NormalizedEvent =
  | { type: "invoice.paid"; invoiceRef; subscriptionRef?; amountCents; method; paidAt }
  | { type: "invoice.payment_failed"; invoiceRef; subscriptionRef?; reason }
  | { type: "invoice.created"; invoiceRef; subscriptionRef?; dueAt; hostedUrl?; pixPayload?; boletoLine? }
  | { type: "subscription.updated"; subscriptionRef; status; currentPeriodEnd }
  | { type: "subscription.canceled"; subscriptionRef }
  | { type: "refund.completed"; invoiceRef; amountCents }
  | { type: "chargeback.opened"; invoiceRef }
  | { type: "ignored"; reason };
```

- Registro: `src/lib/payments/registry.ts` monta `providers` a partir de
  `PAYMENT_PROVIDERS=stripe,asaas` e de `import.meta.glob("./providers/*/index.ts")`.
  Apagar a pasta e tirar o id da env remove o módulo; nenhum arquivo do núcleo o
  referencia por nome.
- Cada módulo: `index.ts` (implementa `PaymentProvider`), `client.ts` (SDK ou fetch),
  `webhook.ts`, `README.md` (como obter chaves, configurar webhook, testar em
  sandbox), `index.test.ts` com fixtures de webhook reais anonimizadas.
- Metadados obrigatórios em todo checkout/assinatura: `tenantId`, `subscriptionId`,
  `idempotencyKey` (= `subscription_event.id` ou `invoice.id`).

## Matriz de provedores (fluxo a)

Legenda: ✓ confirmado na documentação oficial; ✗ não suportado; ? não verificado.

| Recurso | Stripe | Asaas | Mercado Pago | Pagar.me | PagBank |
|---|---|---|---|---|---|
| Pix avulso | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pix recorrente (empresa BR) | ✗ (Pix Automático indisponível no Brasil) | ✓ assinatura `billingType PIX` | ? | ? | ? |
| Boleto | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cartão de crédito | ? (assumido) | ✓ | ✓ | ✓ | ✓ |
| Cartão de débito | ? | ? (`DEBIT_CARD` no enum, não na criação de assinatura) | ✓ | ✓ | ✓ |
| Assinatura nativa | ✓ Billing | ✓ `POST /v3/subscriptions` (cycle) | ✓ API de Assinaturas (`preapproval`) | ✓ `plan`/`subscription` (card ou boleto) | ✓ API de Pagamentos Recorrentes (card ou boleto) |
| Trial nativo | ✓ `trial_end` | ✗ (sem campo; usar `nextDueDate`) | ? | ? | ? |
| Reembolso | ✓ Pix (90 d), ✗ boleto | ✓ `POST /v3/payments/{id}/refund` (card e Pix; boleto por endpoint próprio) | ✓ `POST /v1/orders/{id}/refund` (180 d) | ? (evento `charge.refunded` existe) | ✓ `POST /charges/{id}/cancel` (36 meses) |
| Split | ✓ Connect (BR com contas conectadas: ?) | ✓ `split[]` por `walletId` | ✓ `marketplace_fee`/`application_fee` + OAuth | ✓ `split[]` por `recipient_id` | ✓ `splits` (até 15 recebedores) |
| Sandbox | ✓ chaves de teste | ✓ `api-sandbox.asaas.com`, chave `$aact_hmlg_` | ✓ credenciais de teste (detalhe ?) | ✓ chave de teste, mesma URL | ✓ `sandbox.api.pagseguro.com` |
| Idempotência | ✓ `Idempotency-Key` | ✗ header; `externalReference` + consulta | ? `X-Idempotency-Key` | ? | ✓ `x-idempotency-key` (assinaturas); pedidos ? |
| Verificação de webhook | ✓ `Stripe-Signature` HMAC-SHA256, tolerância 5 min | token estático `asaas-access-token` | ✓ `x-signature` (`ts`,`v1`) HMAC-SHA256 + `x-request-id` | ✗ nenhuma documentada | ✓ `x-payload-signature` ECDSA SHA-256 com chave pública |
| Retentativas de webhook | 3 dias, exponencial | sim; fila pausa após 15 falhas; eventos guardados 14 d | ? | ? (`attempts` no objeto) | ? |
| Pausa | ✓ `pause_collection` | ✗ | ? | ? | ? |
| Dunning nativo | ✓ Smart Retries (card) | parcial (vencimento + notificações) | ✓ tentativas automáticas | ? | ✓ "retentativas" |

Tratamento das diferenças no núcleo:

- `capabilities` decide o que a interface oferece (métodos, pausar, portal).
- Provedores **sem assinatura HMAC** (Asaas por token, Pagar.me sem nada): o
  evento é aceito só com token/segredo de URL correto **e** o estado é aplicado
  apenas após `fetchInvoice`/`fetchSubscription` confirmar na API do provedor
  ("confiar, mas conferir"). Para provedores com HMAC/ECDSA, a conferência é feita
  pela reconciliação diária.
- Provedores sem trial nativo: o trial é do núcleo; a assinatura no provedor só é
  criada no primeiro checkout.
- Provedores sem proração: o núcleo calcula a diferença e cria cobrança avulsa.
- Provedores sem pausa: a interface não mostra "pausar".
- Pix recorrente no Stripe para empresa brasileira não existe: o checkout Stripe
  oferece cartão e boleto; para Pix recorrente usa-se Asaas.

## Webhooks (`POST /api/webhooks/payments/:provider`)

1. Rota montada **antes** de `bodyLimit`/`zValidator`, com `bodyLimit` próprio de
   1 MB e leitura do corpo bruto (`await c.req.text()`), sem parse prévio.
2. `provider.verifyWebhook` com headers e corpo bruto. Falha → 400, linha em
   `payment_event` com `verified = false`, `status = failed`, contagem por IP para
   rate limit (20/min).
3. Insere `payment_event` com `provider_event_id`; conflito na unique → 200 e
   `status = duplicate`.
4. Enfileira `webhook.process` (pg-boss, `singletonKey = payment_event.id`, retry 5x
   com backoff) e responde 200 em menos de 1 s.
5. Job: `parseWebhook` → para cada `NormalizedEvent`, resolve `subscription`/`invoice`
   por `provider_*_ref` (ou por `metadata.subscriptionId`), confirma no provedor
   quando a verificação for por token, aplica a transição em transação com
   `withPlatformScope("webhook")` + `SELECT ... FOR UPDATE` da assinatura, grava
   `subscription_event` com `payment_event_id`. Transição repetida (mesmo estado) é
   no-op e marca `ignored`.
6. Reprocessamento: `/admin/webhooks` lista eventos com filtro de status e botão
   "Reprocessar" (`POST /api/admin/webhooks/:id/reprocess`) que reenfileira; e
   "Buscar do provedor" para eventos perdidos (`fetchSubscription`).
7. Reconciliação: job diário `billing.reconcile` percorre assinaturas `trialing`
   com provedor, `active`, `past_due` e compara `fetchSubscription` com o estado
   local; divergência gera `subscription_event` com `source = job` e alerta no
   `/admin` (e e-mail ao proprietário se `platform_setting.alert_email`).
8. Ordem não garantida: o handler só avança estados por timestamp do evento
   (`occurred_at` ≥ último `subscription_event`); eventos antigos viram `ignored`.

## Fluxo de checkout (owner)

1. `/app/assinatura` → `GET /api/billing/plans` (planos ativos, preços por provedor
   disponível, capacidades).
2. `POST /api/billing/checkout` `{ planPriceId, method }` → `ensureCustomer` →
   `createCheckout` → `redirect` (Stripe Checkout, Mercado Pago) ou `inline` (Asaas:
   Pix QR e linha de boleto renderizados na própria página; polling de
   `GET /api/billing/invoices/:id` a cada 5 s até `paid`).
3. Webhook `invoice.paid` → `active`. Página de sucesso consulta o estado local,
   nunca confia no `?success=1`.
4. `/app/assinatura/faturas`: `invoice` local com link `hosted_url`.
5. Portal do cliente Stripe (`portalUrl`) quando disponível; nos demais, a tela
   própria cobre trocar plano, cancelar e ver faturas.

## Fluxo (b), reservado

- `tenant_payment_credential` guarda chave do provedor do tenant, cifrada com
  `CREDENTIALS_ENCRYPTION_KEY` (AES-256-GCM, nonce por registro, `key_version`
  para rotação). Nunca sai da API; `/app/configuracoes/pagamentos` mostra só os 4
  últimos caracteres.
- O mesmo `PaymentProvider` recebe `ctx.credentials`. Split: `split[]` (Asaas,
  Pagar.me, PagBank), `application_fee` (Mercado Pago), Connect (Stripe).
- Webhooks de (b): rota `/api/webhooks/payments/:provider/:tenantId` com segredo por
  tenant. Faturas do cliente em `/portal/faturas`.

## Decisões específicas

| Decisão | Motivo | Alternativa descartada |
|---|---|---|
| Estado no Postgres, provedor executa | Troca de provedor sem perder histórico; trial e free sem provedor | Stripe como fonte da verdade |
| Caixa de entrada `payment_event` + job | Resposta rápida, retry, idempotência por unique | Processar no handler HTTP |
| Confirmar na API quando não há assinatura HMAC | Token estático não protege contra replay nem corpo forjado | Confiar no token |
| Downgrade no fim do período em todos os provedores | Comportamento uniforme, sem estorno | Downgrade imediato com crédito |
| Proração no núcleo quando o provedor não tem | Mesma regra para o owner | Sem proração |
