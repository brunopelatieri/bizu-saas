import type { PgBoss } from "pg-boss";
import { logError } from "@/api/log";
import { getLogger } from "@/lib/logger";

/**
 * Quem consome a fila: o app (`JOBS_MODE=inline`) ou o serviço `--worker`. Réplicas do mesmo
 * tipo são normais; os dois tipos juntos, não. O compose não consegue impedir a combinação, e
 * ela é silenciosa porque o pg-boss entrega cada job a um só consumidor: nada roda em dobro,
 * mas os jobs continuam no processo web que o worker deveria aliviar.
 *
 * A detecção usa o registro de instâncias do próprio pg-boss (`getInstances`): cada instância
 * se anuncia ao subir, renova a linha sozinha e sai dela no `stop()`. Sem tabela nem timer nossos.
 */
export type JobConsumer = "inline" | "worker";

export type JobConsumers = Record<JobConsumer, number>;

const INSTANCE_NAMES: Record<JobConsumer, string> = {
  inline: "bizu-jobs-inline",
  worker: "bizu-jobs-worker",
};

export const consumerInstanceName = (consumer: JobConsumer) => INSTANCE_NAMES[consumer];

/** A lista vem da mais antiga para a nova, com as mortas: o limite padrão esconderia as novas. */
const INSTANCES_LIMIT = 100_000;

/** Instâncias vivas por tipo. */
export async function countJobConsumers(boss: PgBoss): Promise<JobConsumers> {
  const counts: JobConsumers = { inline: 0, worker: 0 };

  for (const { live, name } of await boss.getInstances({ limit: INSTANCES_LIMIT })) {
    if (!live) continue;
    if (name === INSTANCE_NAMES.inline) counts.inline += 1;
    if (name === INSTANCE_NAMES.worker) counts.worker += 1;
  }

  return counts;
}

export const hasMixedConsumers = ({ inline, worker }: JobConsumers) => inline > 0 && worker > 0;

/**
 * Roda depois que este processo já está no registro. Quem sobe por último enxerga o outro, em
 * qualquer ordem de subida. Falha aqui nunca impede os jobs de rodar.
 */
export async function warnIfMixedConsumers(boss: PgBoss) {
  try {
    const consumers = await countJobConsumers(boss);
    if (!hasMixedConsumers(consumers)) return;

    getLogger().warn(
      { consumers },
      "App em JOBS_MODE=inline e worker dedicado consomem a mesma fila. Nenhum job roda em dobro, mas o processo web continua com a carga. Com o perfil worker, defina APP_JOBS_MODE=off no app. Trocando de modo agora? Confira em /admin: a instância encerrada some do registro.",
    );
  } catch (error) {
    logError("Falha ao verificar os consumidores da fila", error);
  }
}
