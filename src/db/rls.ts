import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export type Tx = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

/**
 * Toda query de tenant roda aqui. `set_config(..., true)` vale só para esta transação:
 * nada vaza para a próxima requisição que pegar a mesma conexão, inclusive em pooler no
 * modo transaction. Quem esquece recebe vazio do RLS, não dados de outro tenant.
 */
export function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Atravessa tenants, para jobs, rotas `/api/admin/*` e eventos sem tenant. `reason` fica
 * em `app.bypass_reason`, ao alcance de um gatilho ou do log do Postgres.
 */
export function withPlatformScope<T>(reason: string, fn: (tx: Tx) => Promise<T>) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_tenant', 'on', true)`);
    await tx.execute(sql`select set_config('app.bypass_reason', ${reason}, true)`);
    return fn(tx);
  });
}
