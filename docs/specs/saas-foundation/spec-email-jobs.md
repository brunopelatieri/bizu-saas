# SPEC: E-mail transacional e jobs em segundo plano

- **Parte de:** `docs/specs/saas-foundation/spec.md`
- **Paths previstos:** `src/lib/email/` (`types.ts`, `send.ts`, `providers/smtp.ts`,
  `providers/resend.ts`, `templates/*.ts`), `src/jobs/` (`boss.ts`, `email.ts`,
  `webhooks.ts`, `billing.ts`, `lgpd.ts`, `maintenance.ts`), `src/api/webhooks-email.ts`

## E-mail

### Interface

```ts
export type EmailMessage = {
  to: string; subject: string; html: string; text: string;
  replyTo?: string; headers?: Record<string, string>; tags?: Record<string, string>;
};
export interface EmailProvider {
  id: "smtp" | "resend" | "postmark" | "ses";
  send(msg: EmailMessage): Promise<{ providerMessageId: string }>;
  verifyWebhook?(req): Promise<boolean>;
  parseWebhook?(body): EmailEvent[];   // delivered | bounced | complained
}
```

- `EMAIL_PROVIDER=smtp|resend` escolhe em `src/lib/email/send.ts`. `smtp` usa
  `nodemailer` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`);
  `resend` usa o SDK com `RESEND_API_KEY`. Postmark e SES ficam como pastas de
  exemplo documentadas, não implementadas nesta entrega.
- `sendEmail(template, data)` nunca envia direto: cria `email_message` (`queued`) e
  enfileira `email.send`. O job renderiza, checa `email_suppression`, chama o
  provedor, atualiza `status`. Falha → retry 5x com backoff; esgotado → `failed` e
  alerta em `/admin/jobs`.
- Remetente: `EMAIL_FROM="Bizu SaaS <no-reply@seudominio.com.br>"`,
  `EMAIL_REPLY_TO` opcional. E-mails por tenant (ex.: convite de cliente) usam o
  nome do tenant no assunto e `Reply-To` do owner, mas o `From` continua da
  plataforma (SPF/DKIM do domínio da plataforma).
- Templates em TypeScript puro (`templates/verify-email.ts` devolve `{ subject,
  html, text }` a partir de um layout base com logo e rodapé). Lista:
  `verify-email`, `existing-user-signup`, `reset-password`, `password-changed`,
  `change-email-confirm`, `change-email-done`, `invite-member`, `portal-invite`,
  `portal-magic-link`, `trial-ending`, `trial-expired`, `invoice-created`,
  `payment-failed`, `payment-received`, `subscription-canceled`,
  `impersonation-requested`, `impersonation-started`, `data-export-ready`,
  `deletion-scheduled`, `tenant-suspended`.
- Links de e-mail sempre absolutos com `APP_URL`; tokens só no path/query de páginas
  que não consomem no GET (`spec-auth.md`).

### Entrega e reputação

- Domínio de envio com SPF (`include:` do provedor), DKIM (chave do provedor) e DMARC
  (`p=quarantine` após validação, `rua=` para relatórios). O README traz os
  registros de exemplo; valores reais são do provedor e devem ser conferidos nas
  páginas oficiais (marcado como não verificado em `spec.md`).
- Transacional não precisa de `List-Unsubscribe`; marketing (fora do escopo) precisa.
- Bounces e reclamações: `POST /api/webhooks/email/:provider` (Resend) →
  `verifyWebhook` → `email_message.status` atualizado por `provider_message_id` →
  hard bounce ou reclamação cria `email_suppression`. Envio a endereço suprimido
  falha com `status = failed`, `error = suppressed`, visível em `/admin/jobs`.
- SMTP sem webhook: bounces chegam à caixa do remetente; documentado como limitação.

### Desenvolvimento

- `docker-compose.yml` ganha `mailpit` (`axllent/mailpit`, SMTP `1025`, UI `8025`,
  `MP_SMTP_AUTH_ACCEPT_ANY=1`, `MP_SMTP_AUTH_ALLOW_INSECURE=1`). `.env.example`
  aponta `EMAIL_PROVIDER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`.
- `EMAIL_PROVIDER=memory` para testes: provedor em memória com `sent[]` inspecionável
  (`src/lib/email/providers/memory.ts`), usado por `npm test`.
- `npm run email:preview` renderiza todos os templates com dados fake em
  `.tmp/emails/*.html` para revisão visual.

## Jobs (pg-boss 12.x)

- `src/jobs/boss.ts` cria `new PgBoss({ connectionString: DATABASE_URL, schema: "pgboss" })`.
  O schema `pgboss` é criado por migration customizada com `bizu_owner` e
  `GRANT` para `bizu_app` (pg-boss cria tabelas no primeiro `start()`; rodar o
  primeiro start com `DIRECT_URL` no job de migrate: `npm run jobs:install`).
- `JOBS_MODE=inline` (padrão): `start()` no mesmo processo em `src/server.ts`, workers
  registrados. `JOBS_MODE=worker`: `node build/server/index.js --worker` só roda
  workers, sem HTTP (serviço `worker` no compose de produção para escalar à
  parte). `JOBS_MODE=off`: só enfileira (testes e processos auxiliares).
- Filas e políticas:

| Fila | Gatilho | Retry | Observação |
|---|---|---|---|
| `email.send` | `sendEmail` | 5x, backoff exponencial | `singletonKey = email_message.id` |
| `webhook.process` | `/api/webhooks/payments/*` | 5x | `singletonKey = payment_event.id` |
| `billing.trial` | cron diário 03:00 | 3x | expira trials, envia T-3/T-1/T0 |
| `billing.dunning` | cron diário 03:10 | 3x | carência → `unpaid`, e-mails |
| `billing.period_end` | cron horário | 3x | aplica downgrade/cancelamento agendado |
| `billing.reconcile` | cron diário 04:00 | 3x | compara com provedor |
| `billing.usage` | cron diário 02:00 | 1x | recalcula `usage_counter` |
| `lgpd.export` | pedido do usuário | 3x | gera zip em `StorageProvider`, 7 dias |
| `lgpd.delete` | cron diário 05:00 | 3x | executa `deletion_request` vencidas |
| `maintenance.prune` | cron semanal | 1x | apaga `payment_event` > 90 d processados, `email_message` > 180 d, sessões expiradas, `rate_limit` velho |

- Dead letter: cada fila tem `deadLetter = "<fila>.dead"`; `/admin/jobs` lista
  falhas (via `@pg-boss/dashboard` opcional ou consulta direta ao schema `pgboss`)
  com botão "Reexecutar".
- Idempotência dos handlers: todo job recebe ids, nunca payloads completos, e
  recarrega o estado do banco antes de agir.
- Health: `GET /api/ready` verifica `SELECT 1` e `boss.getQueueSize` com timeout de
  2 s; `/api/health` continua liveness simples.

## Decisões específicas

| Decisão | Motivo | Alternativa descartada |
|---|---|---|
| Fila para todo e-mail | Retry, supressão, auditoria, não trava a requisição | Envio síncrono no handler |
| Templates em TS, sem react-email | Zero dependência extra, fácil de trocar | react-email (mais pesado, opcional depois) |
| pg-boss no mesmo processo por padrão | Um container para começar; `worker` para crescer | Serviço separado obrigatório |
| `memory` provider nos testes | Fluxos de e-mail testáveis sem SMTP | Mock do nodemailer |
