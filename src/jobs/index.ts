import type { PgBoss } from "pg-boss";
import { startBoss, stopBoss } from "@/jobs/boss";
import { handleEmailSend } from "@/jobs/email";
import { handleMaintenancePrune } from "@/jobs/maintenance";
import {
  queueDefinitions,
  QUEUE,
  scheduleDefinitions,
} from "@/jobs/queues";

/**
 * Registro das filas. Uma fila nova entra em três lugares: `queueDefinitions` e
 * `scheduleDefinitions` (`queues.ts`) e o handler em `registerWorkers`.
 */

/** Cria as filas (idempotente). As dead letters vêm primeiro em `queueDefinitions`. */
export async function registerQueues(boss: PgBoss) {
  for (const { name, options } of queueDefinitions) {
    await boss.createQueue(name, options);
  }
}

export async function registerSchedules(boss: PgBoss) {
  for (const { queue, cron } of scheduleDefinitions) {
    await boss.schedule(queue, cron);
  }
}

export async function registerWorkers(
  boss: PgBoss,
  options: { pollingIntervalSeconds?: number } = {},
) {
  // `offWork` antes: recarga de módulo em dev não duplica workers.
  await boss.offWork(QUEUE.emailSend);
  await boss.offWork(QUEUE.maintenancePrune);
  await boss.work(
    QUEUE.emailSend,
    { includeMetadata: true, batchSize: 1, localConcurrency: 4, ...options },
    handleEmailSend,
  );
  await boss.work(QUEUE.maintenancePrune, options, handleMaintenancePrune);
}

/**
 * Sobe os workers neste processo: `JOBS_MODE=inline` (dentro do servidor HTTP) ou
 * `--worker` (`JOBS_MODE=worker`, sem HTTP). Devolve a função que para tudo.
 */
export async function startJobs(options: { pollingIntervalSeconds?: number } = {}) {
  const boss = await startBoss("worker");
  await registerQueues(boss);
  await registerSchedules(boss);
  await registerWorkers(boss, options);

  return { boss, stop: stopBoss };
}
