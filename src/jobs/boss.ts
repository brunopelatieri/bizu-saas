import { PgBoss } from "pg-boss";
import { logError } from "@/api/log";
import { consumerInstanceName, type JobConsumer } from "@/jobs/consumers";
import { getEnv } from "@/lib/env";

/**
 * Instância única do pg-boss, schema `pgboss`.
 *
 * Papéis (ver `docs/context/tech/20-jobs.md`):
 * - `installer`: `DIRECT_URL` (bizu_owner). Cria/migra as tabelas do pg-boss.
 *   Só `npm run jobs:install`.
 * - `worker`: `DATABASE_URL` (bizu_app). Processa filas e roda a manutenção e os crons.
 * - `producer`: `DATABASE_URL`. Só enfileira (processo web com `JOBS_MODE=worker|off`).
 */
export type BossRole = "installer" | "worker" | "producer";

export const BOSS_SCHEMA = "pgboss";

type Holder = { role: BossRole; boss: PgBoss; started: Promise<PgBoss> };

// Em dev o módulo recarrega (HMR): a instância fica em `globalThis` para não duplicar.
const globals = globalThis as typeof globalThis & { __bizuBoss?: Holder };

export function createBoss(role: BossRole, consumer?: JobConsumer): PgBoss {
  const env = getEnv();
  const boss = new PgBoss({
    connectionString: role === "installer" ? env.DIRECT_URL : env.DATABASE_URL,
    schema: BOSS_SCHEMA,
    application_name: `bizu-jobs-${role}`,
    // Nome no registro de instâncias do pg-boss: é o que distingue app e worker (`consumers.ts`).
    instanceName: consumer && consumerInstanceName(consumer),
    max: role === "worker" ? 10 : 4,
    // O schema vem da migration (com os GRANTs do runtime); só o instalador mexe nas tabelas.
    createSchema: false,
    migrate: role === "installer",
    supervise: role === "worker",
    schedule: role === "worker",
  });

  boss.on("error", (error) => logError("Erro no pg-boss", error));
  return boss;
}

/** Inicia (uma vez) e devolve a instância do papel pedido. */
export function startBoss(role: BossRole, consumer?: JobConsumer): Promise<PgBoss> {
  const current = globals.__bizuBoss;
  if (current) {
    if (current.role === role || role === "producer") return current.started;
    throw new Error(
      `pg-boss já iniciado como ${current.role}; pare-o antes de iniciar como ${role}.`,
    );
  }

  const boss = createBoss(role, consumer);
  const started = boss.start().then(() => boss);
  globals.__bizuBoss = { role, boss, started };
  // Falha de conexão não deve deixar a promessa "presa": a próxima chamada tenta de novo.
  started.catch(() => {
    if (globals.__bizuBoss?.boss === boss) globals.__bizuBoss = undefined;
  });
  return started;
}

/** Instância para enfileirar: reaproveita a que existir, senão inicia um `producer`. */
export function getBoss(): Promise<PgBoss> {
  return startBoss("producer");
}

export async function stopBoss() {
  const current = globals.__bizuBoss;
  if (!current) return;
  globals.__bizuBoss = undefined;
  await current.boss.stop({ graceful: true, timeout: 10_000 });
}
