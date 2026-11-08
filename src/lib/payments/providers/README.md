# Módulos de pagamento

Cada pasta aqui é um provedor que o núcleo (`src/lib/billing/`) conhece só pela interface
`PaymentProvider` (`../types.ts`). O registro (`../registry.ts`) acha a pasta sozinho; quem
liga o módulo é `PAYMENT_PROVIDERS`. Nada fora da pasta importa o módulo nem o SDK dele:
`src/lib/payments/registry.test.ts` reprova quem importar.

## Checklist de um módulo novo

1. Crie `providers/<id>/`. O `id` já precisa existir em `paymentProviderIds`
   (`src/lib/billing/constants.ts`).
2. `index.ts`: implementa `PaymentProvider` e faz `export default` de um `ProviderModule`
   (`{ id, createProvider(env) }`). `createProvider` só monta o objeto: sem rede.
3. `client.ts`: SDK ou `fetch`, injetável para o teste não sair da máquina.
4. `webhook.ts`: `verifyWebhook` sobre o corpo bruto e `parseWebhook`, que só traduz para
   `NormalizedEvent`. Tudo que não interessa vira `{ type: "ignored", reason }`.
5. Declare `capabilities` pelo que foi conferido na documentação do provedor. É isso que
   decide o que a tela oferece.
6. Nenhum erro do provedor sai com a mensagem original: ela pode citar dado do cliente.
   Lance `PaymentProviderError` só com o código.
7. Variáveis: `src/lib/env.ts` e `.env.example`, obrigatórias só com o id em
   `PAYMENT_PROVIDERS`. Leia por `env` em `createProvider`.
8. `README.md`: como obter chaves, configurar o webhook, testar em sandbox e remover.
9. `index.test.ts` e `fixtures/`: assinatura válida, inválida e expirada, e um caso por
   evento tratado. Capture as fixtures do sandbox e anonimize.
10. Rode `npm run check:module-removal -- <id>`: tira a pasta, roda typecheck e testes e
    devolve a pasta.

## O que o núcleo decide por você

| Provedor | O núcleo faz |
|---|---|
| Verifica por token ou nada (`webhookSignature`: `token`, `none`) | Confirma em `fetchInvoice`/`fetchSubscription` antes de aplicar. Sem isso, um token vazado forjaria pagamento |
| Sem trial nativo (`nativeTrial: false`) | Mantém o trial local e só cria a assinatura no primeiro checkout |
| Sem proração (`proration: false`) | Calcula a diferença e chama `chargeOnce` |
| Sem pausa ou portal | A tela não oferece |
| Checkout `inline` (Pix, boleto) | Grava a fatura local e a tela faz polling a cada 5 s |
| Sem `updateSubscriptionSchedule` | O `/admin` não muda fim do trial nem próxima cobrança dessa assinatura: 409 `PROVIDER_UNSUPPORTED` |

## Métodos opcionais para o `/admin`

- `updateSubscriptionSchedule(ctx, ref, { trialEnd?, nextBillingAt? })`: muda o fim do trial ou
  a data da próxima cobrança **sem** crédito nem cobrança da diferença, e devolve a assinatura
  como ficou (`RemoteSubscription`, com `trialEnd` se houver). O núcleo chama antes de gravar
  aqui e aplica a resposta pela reconciliação; erro lançado = nada muda (409
  `PROVIDER_UPDATE_FAILED`). No Stripe: `trial_end` = data nova com `proration_behavior: none`
  (a assinatura ativa aparece como `trialing` lá até a data; aqui continua `active`).
- `pauseSubscription` e `resumeSubscription` também servem à pausa e retomada pelo `/admin`.

## Eventos e o que se espera deles

- `occurredAt` é o que ordena: mande o instante do provedor, senão o evento não participa
  da checagem de fora de ordem.
- Metadados `tenantId`, `subscriptionId` e `planPriceId` precisam voltar nos eventos. É por
  eles que o primeiro pagamento acha a assinatura e o plano escolhido.
- `invoice.paid` ativa; `subscription.updated` nunca tira ninguém de `trialing` ou
  `past_due`, porque só pagamento faz isso.
- `enrichEvent` é o lugar de consultar a API do provedor para completar um evento: roda
  fora da transação, antes de aplicar.

## Remover um módulo

1. Tire o id de `PAYMENT_PROVIDERS`.
2. Apague a pasta.
3. Desinstale o SDK dele (`npm uninstall <pacote>`).

Webhooks do provedor passam a responder 404. Assinaturas que já estavam nele continuam no
banco e aparecem em `/admin/assinaturas`; o `billing.reconcile` só pula as que ficaram sem
módulo. Cancele-as no provedor antes de remover.
