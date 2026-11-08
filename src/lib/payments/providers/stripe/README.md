# Módulo Stripe

Assinatura recorrente com cartão e boleto pelo Stripe Checkout (redirecionamento), portal do
cliente, trial nativo, pausa e proração. Pix recorrente para empresa no Brasil não existe no
Stripe: para isso use o módulo Asaas.

Versão da API: a fixada pelo pacote `stripe` (`2026-10-28.endive` no pacote 23). Ao atualizar o
pacote, confira as fixtures: os campos de `Invoice` e `Subscription` mudam entre versões.

## Chaves de teste

1. Crie uma conta em <https://dashboard.stripe.com> e deixe o painel em modo de teste.
2. Em **Developers → API keys**, copie a **Secret key** (`sk_test_...`).
3. Instale a [Stripe CLI](https://docs.stripe.com/stripe-cli) e rode `stripe login`.
4. Encaminhe os webhooks para o app. O comando imprime o segredo (`whsec_...`):

```bash
stripe listen --forward-to localhost:5173/api/webhooks/payments/stripe
```

Em produção local (`npm run build && npm start`) a porta é a 3000.

5. Preencha o `.env.local`, que nunca vai para o git:

```bash
PAYMENT_PROVIDERS=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Preços

O módulo exige `provider_price_ref`: sem ele o preço não aparece em `/app/assinatura`.

1. Em **Product catalog**, crie um produto por plano com um preço recorrente (mensal, anual).
2. Em `/admin/planos`, abra o plano e preencha, no preço do provedor `stripe`, o id `price_...`.

## Portal do cliente

Em **Settings → Billing → Customer portal**, ative o portal e salve uma vez, ou
`billingPortal.sessions.create` falha. Trocas de plano feitas no portal chegam por
`customer.subscription.updated`, desde que o preço escolhido esteja em `plan_price`.

## Métodos de pagamento

Ative cartão e boleto em **Settings → Payment methods**. O boleto exige conta brasileira. O
Checkout coleta sozinho o CPF/CNPJ que o boleto pede.

## Webhook em produção

Em **Developers → Webhooks**, crie um endpoint apontando para
`https://<seu-domínio>/api/webhooks/payments/stripe` com estes eventos:

- `invoice.created`, `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`
- `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`
- `charge.refunded`, `charge.dispute.created`

Use o **Signing secret** do endpoint em `STRIPE_WEBHOOK_SECRET`. O segredo do `stripe listen`
é outro. A tolerância da assinatura é de 5 minutos: o relógio do servidor precisa estar certo.

## Checklist de sandbox

Rode antes de um release, com `stripe listen` aberto e o cartão de teste `4242 4242 4242 4242`:

- [ ] Checkout a partir do trial: redireciona, volta para `/app/assinatura/retorno`, a tela
      mostra o plano ativo e a fatura.
- [ ] `invoice.paid` aparece como `processed` em `/admin/webhooks`.
- [ ] Trial com mais de 48 h: nada é cobrado agora e `provider_subscription_ref` é preenchido.
- [ ] Cartão `4000 0000 0000 0341`: a falha leva a `past_due` e ao e-mail no Mailpit.
- [ ] Upgrade: fatura de proração e plano novo na hora.
- [ ] Upgrade com cartão recusado (`4000 0000 0000 0341`): erro na tela, plano mantido.
- [ ] Upgrade de quem paga por boleto: conferir o que `error_if_incomplete` faz.
- [ ] Pausar: faturas anuladas e organização em somente leitura. Retomar depois do fim do período:
      ciclo novo cobrado na hora, e recusa deixa pausada.
- [ ] Downgrade: `pending_plan_id` preenchido e preço novo na próxima fatura.
- [ ] Cancelar no fim do período e desfazer.
- [ ] Portal abre e volta para `/app/assinatura`.
- [ ] Reembolso total pelo painel: a fatura vira `refunded`.
- [ ] Boleto, na conta brasileira.
- [ ] `stripe trigger invoice.paid` reenviado: `duplicate` e nada aplicado de novo.
- [ ] `/admin/assinaturas` → editar o vencimento de uma assinatura ativa: `trial_end` muda no
  painel, nenhuma fatura de proração sai, a cobrança acontece na data nova e a assinatura
  segue `active` aqui (`updateSubscriptionSchedule`). Idem para o fim de um trial nativo.

## Decisões deste módulo

- **Fatura de zero é ignorada.** No trial nativo o Stripe emite uma fatura de R$ 0 ao criar a
  assinatura; ela não pode ativar nada. Com cupom de 100% a ativação também não acontece: o
  checkout não oferece cupom, e quem acrescentar precisa rever `parseInvoice`.
- **`Charge` e `Dispute` não têm mais a fatura.** `charge.refunded` e `charge.dispute.created`
  levam o `payment_intent`, e `enrichEvent` busca a fatura em `invoicePayments`.
- **Downgrade** troca o preço no Stripe na hora, com `proration_behavior: "none"`: a próxima
  fatura já vem no valor novo, e o plano local só muda no fim do período.
- **Pausa** usa `pause_collection: { behavior: "void" }`: as faturas do período são anuladas, e por
  isso o acesso é cortado. Retomar depois do período pago usa `billing_cycle_anchor: { type: "now" }`.
- **Trial com menos de 48 h** cobra na hora: o Stripe recusa `trial_end` mais perto que isso
  no Checkout.
- **Cliente** é criado só com nome, e-mail e `tenantId`. Mudar o perfil de faturamento depois
  não atualiza o cliente no Stripe.

## Fixtures

`fixtures/` foi escrita à mão a partir dos tipos do pacote, porque esta fase foi entregue sem
acesso a um sandbox: serve de contrato, não de prova de que o Stripe responde assim. Troque
pelas capturas reais, anonimizadas, na primeira rodada do checklist acima:

```bash
stripe events retrieve <id>
```

## Remover

1. Tire `stripe` de `PAYMENT_PROVIDERS` e apague as variáveis `STRIPE_*`.
2. Apague esta pasta.
3. Rode `npm uninstall stripe`.

`npm run check:module-removal -- stripe` confere que typecheck e testes seguem verdes sem a
pasta. Antes de remover em produção, cancele as assinaturas que estiverem no Stripe.
