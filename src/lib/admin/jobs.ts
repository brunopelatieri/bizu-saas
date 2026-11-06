import { logError } from "@/api/log";
import { getBoss } from "@/jobs/boss";

/**
 * Jobs que esgotaram as tentativas: ficam na fila `<fila>.dead` até alguém olhar. `null` se a
 * fila estiver indisponível: o painel mostra isso, e não um zero que pareceria saúde.
 */
export async function countDeadJobs(): Promise<number | null> {
  try {
    const boss = await getBoss();
    const queues = await boss.getQueues();

    return queues
      .filter(({ name }) => name.endsWith(".dead"))
      .reduce((sum, { queuedCount }) => sum + queuedCount, 0);
  } catch (error) {
    logError("Falha ao contar jobs mortos", error);
    return null;
  }
}
