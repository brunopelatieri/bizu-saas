import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { member, organization, session, user } from "@/db/schema";
import type { TenantAccessMode, TenantStatus } from "@/db/schema/tenant";

/**
 * `member` e `organization` não têm RLS e estas leituras atravessam tenants por natureza:
 * partem sempre do usuário da sessão, nunca de um id vindo do cliente sem esse filtro.
 */

export type Membership = {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  accessMode: TenantAccessMode;
  memberId: string;
  role: string;
};

const membershipColumns = {
  id: organization.id,
  slug: organization.slug,
  name: organization.name,
  status: organization.status,
  accessMode: organization.accessMode,
  memberId: member.id,
  role: member.role,
};

export function listMemberships(userId: string): Promise<Membership[]> {
  return getDb()
    .select(membershipColumns)
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
}

export async function findMembership(
  userId: string,
  tenantId: string,
): Promise<Membership | null> {
  const [row] = await getDb()
    .select(membershipColumns)
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(member.organizationId, tenantId)))
    .limit(1);

  return row ?? null;
}

/** O tenant usado por último, se a pessoa ainda for membro; senão, o mais antigo. */
export async function preferredTenantId(userId: string) {
  const [row] = await getDb()
    .select({ id: member.organizationId })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.userId, userId))
    .orderBy(
      desc(sql`${member.organizationId} = ${user.lastTenantId}`),
      asc(member.createdAt),
    )
    .limit(1);

  return row?.id ?? null;
}

/** A sessão passa a este tenant, que também vira o da próxima sessão. */
export async function activateTenant(
  sessionId: string,
  userId: string,
  tenantId: string | null,
) {
  await getDb()
    .update(session)
    .set({ activeOrganizationId: tenantId })
    .where(eq(session.id, sessionId));

  if (tenantId) {
    await getDb()
      .update(user)
      .set({ lastTenantId: tenantId })
      .where(eq(user.id, userId));
  }
}
