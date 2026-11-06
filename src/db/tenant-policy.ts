import { type SQL, sql } from "drizzle-orm";
import { pgPolicy } from "drizzle-orm/pg-core";

/**
 * Só o que o schema precisa para declarar RLS. Fica fora de `src/db/rls.ts` porque o
 * Drizzle Kit carrega o schema sem o alias `@/` nem as variáveis de ambiente.
 *
 * Sem `set_config`, `current_setting` devolve vazio e nenhuma linha passa: a query
 * esquecida retorna vazio em vez de vazar.
 */
const tenantMatches: SQL = sql`current_setting('app.bypass_tenant', true) = 'on' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`;

/**
 * Política padrão de tabela com `tenant_id`. Vale também para `bizu_owner`: com `FORCE
 * ROW LEVEL SECURITY`, o dono sem política não leria nem gravaria nada, e o seed usa
 * esse papel. Ele também precisa de `app.bypass_tenant`.
 */
export function tenantPolicy() {
  return pgPolicy("tenant_isolation", {
    as: "permissive",
    for: "all",
    to: ["bizu_app", "bizu_owner"],
    using: tenantMatches,
    withCheck: tenantMatches,
  });
}
