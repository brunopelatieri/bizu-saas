import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import journal from "../../drizzle/meta/_journal.json";

/**
 * O banco tem as migrations que este build espera?
 *
 * Migrations rodam em etapa separada, nunca na subida (`tech/14-deploy.md`). Sem esta conferência,
 * esquecer a etapa não derruba nada: `/api/health` não toca no banco, o Caddy sobe e o site vai ao
 * ar com o login e o cadastro quebrados. A comparação é a do próprio migrator do Drizzle: o
 * `created_at` mais recente contra o `when` do journal, que entra no bundle porque a imagem de
 * runtime não leva `drizzle/`. Banco à frente do build é normal: as migrations vêm antes da imagem.
 */

const EXPECTED_MIGRATION = Math.max(...journal.entries.map(({ when }) => when));

/** Banco novo: o migrator ainda não criou o schema `drizzle` ou a tabela dele. */
const NEVER_MIGRATED_CODES = new Set(["3F000", "42P01"]);

export const SCHEMA_BEHIND_MESSAGE = `O banco não tem as migrations desta versão: o schema não existe ou está desatualizado.
Rode as migrations e suba o app de novo:
  docker compose --env-file docker/.env.prod -f docker/compose.prod.yml --profile tools run --rm migrate
Fora do compose: npm run db:migrate && npm run jobs:install, com DIRECT_URL no papel dono das tabelas.`;

function postgresCode(error: unknown) {
  const { code, cause } = (error ?? {}) as { code?: unknown; cause?: { code?: unknown } };
  return code ?? cause?.code;
}

async function readLastMigration() {
  const [row] = await getDb().execute<{ last: string | null }>(
    sql`select max(created_at) as last from drizzle.__drizzle_migrations`,
  );

  return row?.last ? Number(row.last) : null;
}

/**
 * `true` se faltam migrations. Lança quando não dá para afirmar nada (banco fora, sem permissão):
 * quem chama decide, e na subida isso não pode impedir um sistema que talvez esteja certo.
 */
export async function schemaIsBehind(
  read: () => Promise<number | null> = readLastMigration,
  expected: number = EXPECTED_MIGRATION,
) {
  try {
    const last = await read();
    return last === null || last < expected;
  } catch (error) {
    if (NEVER_MIGRATED_CODES.has(postgresCode(error) as string)) return true;
    throw error;
  }
}
