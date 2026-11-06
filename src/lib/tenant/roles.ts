import { and, eq, gt, like } from "drizzle-orm";
import { invitation, member, organizationRole } from "@/db/schema";
import { type Tx, withTenant } from "@/db/rls";
import {
  flattenStatements,
  type RoleCatalog,
  splitRoles,
  staticRoleCatalog,
} from "@/lib/auth/permissions";
import { notFound } from "@/lib/tenant/errors";

export type CustomRole = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
};

function parsePermissions(permission: string) {
  return flattenStatements(JSON.parse(permission) as Record<string, string[]>);
}

function selectRoles(tx: Tx, tenantId: string) {
  return tx
    .select({
      id: organizationRole.id,
      name: organizationRole.role,
      description: organizationRole.description,
      permission: organizationRole.permission,
    })
    .from(organizationRole)
    .where(eq(organizationRole.organizationId, tenantId))
    .orderBy(organizationRole.role);
}

export function listCustomRoles(tenantId: string): Promise<CustomRole[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await selectRoles(tx, tenantId);

    return rows.map(({ permission, ...role }) => ({
      ...role,
      permissions: parsePermissions(permission),
    }));
  });
}

/**
 * Permissões de todos os papéis do tenant. Uma leitura por requisição, em `requireTenant`:
 * `/api/me` e as rotas usam a mesma resposta, e papel alterado vale na hora.
 */
export async function loadRoleCatalog(tenantId: string): Promise<RoleCatalog> {
  const roles = await listCustomRoles(tenantId);

  return {
    ...Object.fromEntries(roles.map((role) => [role.name, role.permissions])),
    ...staticRoleCatalog,
  };
}

export async function findCustomRole(tenantId: string, roleId: string) {
  const roles = await listCustomRoles(tenantId);
  const role = roles.find(({ id }) => id === roleId);
  if (!role) throw notFound("Papel não encontrado.");
  return role;
}

/** Quantos membros e convites pendentes usam o papel. */
export function countRoleUsage(tenantId: string, role: string) {
  return withTenant(tenantId, async (tx) => {
    const members = await tx
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, tenantId),
          like(member.role, `%${role}%`),
        ),
      );

    const invitations = await tx
      .select({ role: invitation.role })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, tenantId),
          eq(invitation.status, "pending"),
          gt(invitation.expiresAt, new Date()),
          like(invitation.role, `%${role}%`),
        ),
      );

    // `like` também acha `recepcao-2` ao procurar `recepcao`.
    return [...members, ...invitations].filter((row) =>
      splitRoles(row.role).includes(role),
    ).length;
  });
}
