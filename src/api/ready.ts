import { sql } from "drizzle-orm";
import { logError } from "@/api/log";
import { getDb } from "@/db";
import { getBoss } from "@/jobs/boss";
import { QUEUE } from "@/jobs/queues";

export const READY_TIMEOUT_MS = 2000;

export type ReadyChecks = {
  db: () => Promise<unknown>;
  jobs: () => Promise<unknown>;
};

/** `SELECT 1` no Postgres e a fila `email.send` existente no pg-boss. */
export const defaultReadyChecks: ReadyChecks = {
  db: () => getDb().execute(sql`select 1`),
  jobs: async () => {
    const boss = await getBoss();
    if (!(await boss.getQueue(QUEUE.emailSend))) {
      throw new Error("fila email.send não existe; rode npm run jobs:install");
    }
  },
};

function withTimeout(task: () => Promise<unknown>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });

  return Promise.race([task(), timeout])
    .then(
      () => true,
      (error) => {
        logError("Verificação de prontidão falhou", error);
        return false;
      },
    )
    .finally(() => clearTimeout(timer));
}

/**
 * Prontidão para tráfego (`GET /api/ready`): banco e fila respondem em até 2 s.
 * Nunca devolve o motivo da falha: o detalhe vai para o log, não para o cliente.
 */
export async function checkReady(
  checks: ReadyChecks = defaultReadyChecks,
  timeoutMs = READY_TIMEOUT_MS,
) {
  const [db, jobs] = await Promise.all([
    withTimeout(checks.db, timeoutMs),
    withTimeout(checks.jobs, timeoutMs),
  ]);

  return { ok: db && jobs, db, jobs };
}
