import type { Queue } from "pg-boss";
import type { EmailMessage } from "@/lib/email/types";

/**
 * Definição das filas. Só dados, sem imports de runtime, para que `sendEmail` e os
 * testes possam usá-la sem puxar o pg-boss. Filas de billing e LGPD entram nas
 * fases 6 e 10: acrescente aqui, com o handler em `src/jobs/index.ts`.
 */

export const QUEUE = {
  emailSend: "email.send",
  emailSendDead: "email.send.dead",
  maintenancePrune: "maintenance.prune",
} as const;

/** Payload de `email.send`: o id da `email_message` e a mensagem já renderizada. */
export type EmailSendJob = {
  emailMessageId: string;
  message: EmailMessage;
};

export const EMAIL_RETRY_LIMIT = 5;

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
];

export type ScheduleDefinition = { queue: string; cron: string };

/** Crons (UTC): domingo 04:00. */
export const scheduleDefinitions: ScheduleDefinition[] = [
  { queue: QUEUE.maintenancePrune, cron: "0 4 * * 0" },
];
