import type { Queue } from "pg-boss";
import type { EmailMessage } from "@/lib/email/types";

/**
 * Definição das filas. Só dados, sem imports de runtime, para que `sendEmail` e os
 * testes possam usá-la sem puxar o pg-boss. As de LGPD entram na fase 10: acrescente aqui,
 * com o handler em `src/jobs/index.ts`.
 */

export const QUEUE = {
  emailSend: "email.send",
  emailSendDead: "email.send.dead",
  maintenancePrune: "maintenance.prune",
  billingTrial: "billing.trial",
  billingTrialDead: "billing.trial.dead",
  webhookProcess: "webhook.process",
  webhookProcessDead: "webhook.process.dead",
  billingDunning: "billing.dunning",
  billingDunningDead: "billing.dunning.dead",
  billingPeriodEnd: "billing.period_end",
  billingPeriodEndDead: "billing.period_end.dead",
  billingReconcile: "billing.reconcile",
  billingReconcileDead: "billing.reconcile.dead",
} as const;

/** Payload de `email.send`: o id da `email_message` e a mensagem já renderizada. */
export type EmailSendJob = {
  emailMessageId: string;
  message: EmailMessage;
};

/** Payload de `webhook.process`: o evento fica em `payment_event`, não na fila. */
export type WebhookProcessJob = { paymentEventId: string };

export const EMAIL_RETRY_LIMIT = 5;
export const WEBHOOK_RETRY_LIMIT = 5;

const DEAD_LETTER_OPTIONS = {
  retentionSeconds: 14 * 24 * 3600,
  deleteAfterSeconds: 14 * 24 * 3600,
};

/** Job idempotente e diário ou horário: repetir não duplica e-mail nem transição. */
const billingJobOptions = (deadLetter: string) => ({
  retryLimit: 3,
  retryDelay: 300,
  retryBackoff: true,
  deleteAfterSeconds: 7 * 24 * 3600,
  deadLetter,
});

export type QueueDefinition = {
  name: string;
  options: Omit<Queue, "name">;
};

/**
 * Cada fila de trabalho tem uma dead letter `<fila>.dead`; as dead letters são
 * criadas antes (o pg-boss exige que a fila de destino já exista).
 */
export const queueDefinitions: QueueDefinition[] = [
  {
    name: QUEUE.emailSendDead,
    options: { retentionSeconds: 7 * 24 * 3600, deleteAfterSeconds: 7 * 24 * 3600 },
  },
  {
    name: QUEUE.billingTrialDead,
    options: DEAD_LETTER_OPTIONS,
  },
  { name: QUEUE.webhookProcessDead, options: DEAD_LETTER_OPTIONS },
  { name: QUEUE.billingDunningDead, options: DEAD_LETTER_OPTIONS },
  { name: QUEUE.billingPeriodEndDead, options: DEAD_LETTER_OPTIONS },
  { name: QUEUE.billingReconcileDead, options: DEAD_LETTER_OPTIONS },
  {
    name: QUEUE.emailSend,
    options: {
      retryLimit: EMAIL_RETRY_LIMIT,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 3600,
      expireInSeconds: 120,
      // O job carrega a mensagem renderizada (com links de token): some logo após o envio.
      deleteAfterSeconds: 3600,
      retentionSeconds: 24 * 3600,
      deadLetter: QUEUE.emailSendDead,
    },
  },
  {
    name: QUEUE.maintenancePrune,
    options: { retryLimit: 1, retryDelay: 300, deleteAfterSeconds: 7 * 24 * 3600 },
  },
  {
    name: QUEUE.billingTrial,
    options: billingJobOptions(QUEUE.billingTrialDead),
  },
  {
    // `exclusive`: no máximo um job vivo por `singletonKey` (= `payment_event.id`). O estado
    // fica em `payment_event`; repetir o job só repete o que falhou.
    name: QUEUE.webhookProcess,
    options: {
      policy: "exclusive",
      retryLimit: WEBHOOK_RETRY_LIMIT,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 3600,
      expireInSeconds: 120,
      deleteAfterSeconds: 7 * 24 * 3600,
      deadLetter: QUEUE.webhookProcessDead,
    },
  },
  {
    name: QUEUE.billingDunning,
    options: billingJobOptions(QUEUE.billingDunningDead),
  },
  {
    name: QUEUE.billingPeriodEnd,
    options: billingJobOptions(QUEUE.billingPeriodEndDead),
  },
  {
    name: QUEUE.billingReconcile,
    options: billingJobOptions(QUEUE.billingReconcileDead),
  },
];

export type ScheduleDefinition = { queue: string; cron: string };

/** Crons (UTC), como em `spec-email-jobs.md`. */
export const scheduleDefinitions: ScheduleDefinition[] = [
  { queue: QUEUE.billingTrial, cron: "0 3 * * *" },
  { queue: QUEUE.billingDunning, cron: "10 3 * * *" },
  { queue: QUEUE.billingPeriodEnd, cron: "0 * * * *" },
  { queue: QUEUE.billingReconcile, cron: "0 4 * * *" },
  { queue: QUEUE.maintenancePrune, cron: "30 4 * * *" },
];
