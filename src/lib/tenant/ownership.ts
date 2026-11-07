import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { member, organization } from "@/db/schema";

/** `member.role` guarda papéis separados por vírgula; owner é o que tem `owner` na lista. */
const isOwnerRole = sql`${member.role} ~ '(^|,)owner(,|$)'`;

/**
 * Organizações ativas ou suspensas de que a pessoa é a única proprietária. Excluir a conta (ou removê-la)
 * deixaria a organização sem dono: antes é preciso transferir a propriedade ou excluir a
 * organização. Organização já em exclusão não conta.
 */
export async function soleOwnerTenants(userId: string) {
  const owned = await getDb()
    .select({ id: organization.id, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.userId, userId),
        isOwnerRole,
        inArray(organization.status, ["active", "suspended"]),
      ),
    );

  const sole: Array<{ id: string; name: string }> = [];

  for (const tenant of owned) {
    const [other] = await getDb()
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, tenant.id),
          ne(member.userId, userId),
          isOwnerRole,
        ),
      )
      .limit(1);

    if (!other) sole.push(tenant);
  }

  return sole;
}
