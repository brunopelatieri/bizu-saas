import { config } from "dotenv";
import { EnvError, getEnv } from "@/lib/env";

/**
 * `npm run jobs:install`: primeiro `start()` do pg-boss com `DIRECT_URL` (bizu_owner),
 * que cria as tabelas do schema `pgboss`, e cria as filas e os crons. Rode depois de
 * `npm run db:migrate` (a migration cria o schema e os GRANTs do runtime) e de novo a
 * cada atualização do pg-boss ou nova fila. É idempotente.
 */

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  try {
    getEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  // Imports depois do dotenv: os módulos leem o ambiente ao rodar, não ao carregar.
  const { createBoss } = await import("@/jobs/boss");
  const { registerQueues, registerSchedules } = await import("@/jobs");

  const boss = createBoss("installer");
  try {
    await boss.start();
    await registerQueues(boss);
    await registerSchedules(boss);
    const version = await boss.schemaVersion();
    console.log(`pg-boss instalado no schema pgboss (versão ${version}).`);
  } finally {
    await boss.stop({ graceful: true, timeout: 10_000 });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `Falha ao instalar o pg-boss: ${message}\nConfira DIRECT_URL e se \`npm run db:migrate\` já rodou.`,
  );
  process.exit(1);
});
