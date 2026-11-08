import { eq, inArray, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";
import { customer, member, organization, subscription } from "@/db/schema";

/**
 * Organizações citadas nas listagens do `/admin`: as primeiras `ORG_PREVIEW` por nome, e o
 * resto como `more`. Uma consulta por página (função de janela), sem N+1. Lê tabelas com RLS:
 * quem chama passa o `tx` de `withPlatformScope`. admin-crud A.
 */
export const ORG_PREVIEW = 3;

export type OrgLink<Extra extends object = Record<never, never>> = {
  id: string;
  name: string;
} & Extra;

export type OrgLinks<Extra extends object = Record<never, never>> = {
  organizations: OrgLink<Extra>[];
  more: number;
};

type Ranked = { key: string | null; id: string; name: string; label: string | null; total: number };

const rank = (partition: ReturnType<typeof sql>) =>
  sql<number>`row_number() over (partition by ${partition} order by ${organization.name}, ${organization.id})`.as(
    "rn",
  );
const total = (partition: ReturnType<typeof sql>) =>
  sql<number>`(count(*) over (partition by ${partition}))::int`.as("total");

/** Agrupa as linhas já cortadas em `ORG_PREVIEW` por chave. */
function group<Extra extends object>(
  keys: string[],
  rows: Ranked[],
  extra: (row: Ranked) => Extra,
): Map<string, OrgLinks<Extra>> {
  const result = new Map<string, OrgLinks<Extra>>(
    keys.map((key) => [key, { organizations: [], more: 0 }]),
  );

  for (const row of rows) {
    if (!row.key) continue;

    const entry = result.get(row.key);
    if (!entry) continue;

    entry.organizations.push({ id: row.id, name: row.name, ...extra(row) });
    entry.more = Math.max(0, row.total - ORG_PREVIEW);
  }

  return result;
}

/** Equipe: organizações de cada usuário, com o papel. */
export async function teamOrganizations(tx: Tx, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, OrgLinks<{ role: string }>>();

  const key = sql`${member.userId}`;
  const ranked = tx
    .select({
      key: member.userId,
      id: organization.id,
      name: organization.name,
      label: member.role,
      rn: rank(key),
      total: total(key),
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(inArray(member.userId, userIds))
    .as("ranked");
  const rows = await tx.select().from(ranked).where(lte(ranked.rn, ORG_PREVIEW));

  return group(userIds, rows, (row) => ({ role: row.label ?? "" }));
}

/** Portal: organizações de cada pessoa, com o status do vínculo (`customer.status`). */
export async function portalOrganizations(tx: Tx, portalUserIds: string[]) {
  if (portalUserIds.length === 0) {
    return new Map<string, OrgLinks<{ status: string }>>();
  }

  const key = sql`${customer.portalUserId}`;
  const ranked = tx
    .select({
      key: customer.portalUserId,
      id: organization.id,
      name: organization.name,
      label: customer.status,
      rn: rank(key),
      total: total(key),
    })
    .from(customer)
    .innerJoin(organization, eq(customer.tenantId, organization.id))
    .where(inArray(customer.portalUserId, portalUserIds))
    .as("ranked");
  const rows = await tx.select().from(ranked).where(lte(ranked.rn, ORG_PREVIEW));

  return group(portalUserIds, rows, (row) => ({ status: row.label ?? "" }));
}

/** Planos: organizações que o usam (qualquer status de assinatura). */
export async function planOrganizations(tx: Tx, planIds: string[]) {
  if (planIds.length === 0) return new Map<string, OrgLinks>();

  const key = sql`${subscription.planId}`;
  const ranked = tx
    .select({
      key: subscription.planId,
      id: organization.id,
      name: organization.name,
      label: sql<string | null>`null`.as("label"),
      rn: rank(key),
      total: total(key),
    })
    .from(subscription)
    .innerJoin(organization, eq(subscription.tenantId, organization.id))
    .where(inArray(subscription.planId, planIds))
    .as("ranked");
  const rows = await tx.select().from(ranked).where(lte(ranked.rn, ORG_PREVIEW));

  return group(planIds, rows, () => ({}));
}
