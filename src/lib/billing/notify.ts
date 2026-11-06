import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { member, user } from "@/db/schema";

export type TenantOwner = { id: string; email: string; name: string };

/** Quem recebe os avisos de cobrança do tenant: seus proprietários, sem banidos. */
export function listTenantOwners(tenantId: string): Promise<TenantOwner[]> {
  return getDb()
    .select({ id: user.id, email: user.email, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(
      sql`${member.organizationId} = ${tenantId}
        and ${user.banned} = false
        and 'owner' = any(string_to_array(${member.role}, ','))`,
    );
}
