# Jobs em segundo plano (pg-boss)

- **Escopo:** Fila no Postgres com pg-boss 12: instalação, modos de execução, filas, retry, dead letter, manutenção e prontidão.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-email-jobs.md`
- **Paths do código:** `src/jobs/` (`boss.ts`, `queues.ts`, `index.ts`, `email.ts`, `billing.ts`, `webhooks.ts`, `maintenance.ts`, `install.ts`), `src/server.ts`, `src/api/ready.ts`, `drizzle/0005_email_jobs.sql`

## Instalação

1. `npm run db:migrate` cria o schema `pgboss` (migration `0005_email_jobs`) e dá
   `USAGE` + privilégios padrão ao `bizu_app` sobre tudo que `bizu_owner` criar nele.
2. `npm run jobs:install` roda o primeiro `start()` do pg-boss com `DIRECT_URL`
   (`bizu_owner`): cria as tabelas do schema `pgboss`, as filas e os crons. É
   idempotente; rode de novo ao atualizar o pg-boss ou ao acrescentar uma fila.
3. O runtime (`bizu_app`) nunca migra nem cria tabelas: `migrate: false`,
   `createSchema: false` em `boss.ts`.

Sem o passo 2, `sendEmail` falha (fila inexistente), o `email_message` fica `failed` e
`/api/ready` devolve 503 com `jobs: false`.

## Modos (`JOBS_MODE`)

| Modo | O que o processo faz |
|---|---|
| `inline` (padrão) | `src/server.ts` sobe os workers no mesmo processo do HTTP |
| `worker` | `node build/server/index.js --worker`: só workers e crons, sem HTTP (serviço à parte) |
| `off` | só enfileira (processo web quando há worker separado, scripts, testes) |

- Com `worker`, o processo web roda com `JOBS_MODE=off` (ou `worker`, que no HTTP
  equivale a `off`): ele enfileira, o serviço `--worker` entrega.
- Em dev: `npx tsx --tsconfig tsconfig.app.json src/server.ts --worker` também funciona.
- Papéis do `boss.ts`: `installer` (DIRECT_URL, migra), `worker` (DATABASE_URL, supervisiona
  e agenda crons), `producer` (DATABASE_URL, só `send`). A instância fica em `globalThis`
  (HMR do dev não duplica).
- Scripts que usam `sendEmail` fora do servidor devem chamar `stopBoss()` e encerrar o
  cliente do Drizzle antes de sair, senão o processo não termina.
- PgBouncer em modo transaction quebra o LISTEN/NOTIFY do pg-boss; aponte a conexão da
  fila para o Postgres direto ou use pooler em modo session.

## Filas (`queues.ts`)

| Fila | Gatilho | Retry | Observação |
|---|---|---|---|
| `email.send` | `sendEmail` | 5x, backoff exponencial (30 s a 1 h) | `singletonKey = email_message.id`; dead letter `email.send.dead` (7 dias) |
| `maintenance.prune` | cron dom 04:00 UTC | 1x | apaga `email_message` > 180 dias (`pruneOldData`) |
| `billing.trial` | cron diário 03:00 UTC | 3x, 5 min com backoff | avisos T-3, T-1 e T0, expira o trial vencido para `read_only` após a carência; idempotente (`runBillingTrial`, `tech/23-billing-planos.md`); dead letter `billing.trial.dead` (14 dias) |
| `webhook.process` | `POST /api/webhooks/payments/:provider` | 5x, backoff de 30 s a 1 h | política `exclusive`, `singletonKey = payment_event.id`: no máximo um job vivo por evento; dead letter `webhook.process.dead` (14 dias) |
| `billing.dunning` | cron diário 03:10 UTC | 3x, 5 min com backoff | avisos T-3 e T0 da carência, `past_due` → `unpaid` + `read_only`; idempotente (`runBillingDunning`) |
| `billing.period_end` | cron de hora em hora | 3x, 5 min com backoff | encerra cancelamentos e aplica downgrades vencidos (`runBillingPeriodEnd`) |
| `billing.reconcile` | cron diário 04:00 UTC | 3x, 5 min com backoff | compara com o provedor, corrige e alerta; devolve à fila eventos `pending` há mais de 10 min (`runBillingReconcile`) |

Detalhes das filas de cobrança em `tech/24-billing-cobranca.md`. As de LGPD entram na fase 10: acrescente em `queueDefinitions` (a
dead letter `<fila>.dead` antes da fila), em `scheduleDefinitions` se tiver cron, e o
handler em `registerWorkers` (`index.ts`); depois `npm run jobs:install`.

### Regras dos handlers

- Idempotentes: recarregam o estado do banco e agem só se faltar fazer
  (`deliverEmail` só envia `email_message` `queued`).
- Falha → relança o erro (o pg-boss agenda o retry). Na última tentativa
  (`retryCount === retryLimit`) o handler grava o estado final (`failed`) antes de relançar;
  o job vai para a dead letter.
- Erro gravado em coluna passa por `sanitizeError` (sem e-mails, 500 caracteres).
- Payload de job: ids sempre que possível. `email.send` é a exceção documentada
  (mensagem renderizada, retenção curta).

## Prontidão

`GET /api/ready` → `{ db, jobs }`, 200 se ambos `true`, 503 caso contrário; cada checagem
tem timeout de 2 s (`src/api/ready.ts`). `db` é `SELECT 1`; `jobs` confirma que o
pg-boss conecta e a fila `email.send` existe. `/api/health` continua liveness simples.

## Testes

`tests/db/email-queue.test.ts` (`npm run test:db`, exige `db:migrate` + `jobs:install`):
enfileirar → worker → `sent`, supressão, retries esgotados → `failed` + `email.send.dead`,
`maintenance.prune` e `checkReady`. `tests/db/billing.test.ts` chama `runBillingTrial(now, { tenantIds })`
diretamente, com relógio e tenants controlados, como `billing-lifecycle.test.ts` nos outros jobs de
cobrança; `billing-queue.test.ts` confere filas, crons e a política `exclusive` no pg-boss real. Unitários sem banco: `src/jobs/email.test.ts`,
`src/api/ready.test.ts`.
