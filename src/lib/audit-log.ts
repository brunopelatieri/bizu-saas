import { and, count, desc, eq, like, type SQL } from "drizzle-orm";
import { withPlatformScope, withTenant, type Tx } from "@/db/rls";
import { auditLog, organization, user } from "@/db/schema";
import { escapeLike } from "@/lib/admin/tenants";
import {
  AUDIT_PAGE_SIZE,
  type AdminAuditQuery,
  type AuditQuery,
} from "@/lib/schemas/security";

/** Leitura de `audit_log`. `ip_hash` não sai daqui: só a investigação direta no banco o usa. */

function filtersOf({ actor, action }: AuditQuery): (SQL | undefined)[] {
  return [
    actor ? eq(auditLog.actorId, actor) : undefined,
    action ? like(auditLog.action, `${escapeLike(action)}%`) : undefined,
  ];
}

async function readPage(tx: Tx, where: SQL | undefined, page: number) {
  const items = await tx
    .select({
      id: auditLog.id,
      tenantId: auditLog.tenantId,
      tenantName: organization.name,
      action: auditLog.action,
      actorType: auditLog.actorType,
      actorId: auditLog.actorId,
      actorName: user.name,
      impersonatorId: auditLog.impersonatorId,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorId, user.id))
    .leftJoin(organization, eq(auditLog.tenantId, organization.id))
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset((page - 1) * AUDIT_PAGE_SIZE);

  const [total] = await tx.select({ value: count() }).from(auditLog).where(where);

  return { items, total: total?.value ?? 0, page, pageSize: AUDIT_PAGE_SIZE };
}

/**
 * Log do próprio tenant. Quem do suporte agiu fica de fora: o tenant vê que foi o suporte,
 * e a plataforma, em `/admin/auditoria`, vê quem.
 */
export async function listTenantAudit(tenantId: string, query: AuditQuery) {
  const result = await withTenant(tenantId, (tx) =>
    readPage(
      tx,
      and(eq(auditLog.tenantId, tenantId), ...filtersOf(query)),
      query.page,
    ),
  );

  return {
    ...result,
    items: result.items.map(
      ({ tenantId: _tenant, tenantName: _name, impersonatorId, ...item }) => {
        const support = item.actorType === "platform" || impersonatorId !== null;

        return {
          ...item,
          support,
          actorId: item.actorType === "platform" ? null : item.actorId,
          actorName: item.actorType === "platform" ? null : item.actorName,
        };
      },
    ),
  };
}

/** Atravessa tenants. `tenant_id` nulo são os eventos de conta, como 2FA e sessões. */
export function listPlatformAudit(query: AdminAuditQuery) {
  return withPlatformScope("admin: log de auditoria", (tx) =>
    readPage(
      tx,
      and(
        query.tenant ? eq(auditLog.tenantId, query.tenant) : undefined,
        ...filtersOf(query),
      ),
      query.page,
    ),
  );
}
