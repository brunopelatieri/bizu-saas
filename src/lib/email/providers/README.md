# Provedores de e-mail

Implementados: `smtp.ts` (nodemailer), `resend.ts` (SDK oficial) e `memory.ts` (testes).

## Exemplo: adicionar Postmark ou Amazon SES

Postmark e SES **não estão implementados** neste template; o roteiro abaixo é a forma
de acrescentá-los sem tocar em `sendEmail`, nos templates nem na fila.

1. Crie `providers/postmark.ts` (ou `ses.ts`) com uma função
   `createPostmarkProvider(options): EmailProvider` que devolve:
   - `id` (acrescente-o a `EmailProviderId` em `../types.ts` e ao enum
     `EMAIL_PROVIDER` em `src/lib/env.ts`);
   - `send(message)` → `{ providerMessageId }` (o id que o provedor devolve e que depois
     vem nos webhooks); lance erro em qualquer falha, para o job tentar de novo;
   - `verifyWebhook(request)` → `boolean`, conferindo a assinatura no corpo bruto
     (`request.clone().text()`); sem segredo configurado, recuse;
   - `parseWebhook(body)` → `EmailEvent[]` (`delivered`, `bounced` com
     `permanent: true` só em hard bounce, `complained`). O SES entrega por SNS: o
     `verifyWebhook` valida a assinatura da mensagem SNS e confirma a assinatura da
     inscrição.
2. Registre o provedor em `createEmailProvider` (`../send.ts`) e as variáveis novas em
   `src/lib/env.ts` e `.env.example`.
3. Teste `parseWebhook` com fixtures em `tests/fixtures/webhooks/<provedor>/`, como em
   `resend.test.ts`.
4. A rota `POST /api/webhooks/email/:provider` já serve qualquer provedor que tenha
   `verifyWebhook` e `parseWebhook`; a supressão por hard bounce e reclamação é automática.
