import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { organization } from "@/db/schema";

/**
 * `organization` não tem RLS. `requireTenant` lê `require_2fa` a cada requisição, e o
 * `jsonb_set` preserva o restante de `settings`, como `portal_self_signup`.
 */
export async function setRequire2fa(tenantId: string, required: boolean) {
  await getDb()
    .update(organization)
    .set({
      settings: sql`jsonb_set(${organization.settings}, '{require_2fa}', ${JSON.stringify(required)}::jsonb)`,
    })
    .where(eq(organization.id, tenantId));
}
