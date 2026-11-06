import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { withTenant } from "@/db/rls";
import { impersonationGrant, session } from "@/db/schema";
import { auditInTransaction } from "@/lib/audit";
import { notFound } from "@/lib/tenant/errors";

/** Consentimento do owner para o acesso do suporte (`/app/configuracoes/suporte`). */

type GrantActor = { userId: string; ip?: string };

const HOUR = 60 * 60 * 1000;
const NOT_FOUND = "Autorização não encontrada.";
const LIST_LIMIT = 20;

export function listSupportGrants(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: impersonationGrant.id,
        expiresAt: impersonationGrant.expiresAt,
        revokedAt: impersonationGrant.revokedAt,
        usedBy: impersonationGrant.usedBy,
        createdAt: impersonationGrant.createdAt,
      })
      .from(impersonationGrant)
      .where(eq(impersonationGrant.tenantId, tenantId))
      .orderBy(desc(impersonationGrant.createdAt))
      .limit(LIST_LIMIT),
  );
}

export async function createSupportGrant(
  tenantId: string,
  hours: number,
  actor: GrantActor,
  now = new Date(),
) {
  return withTenant(tenantId, async (tx) => {
    const [grant] = await tx
      .insert(impersonationGrant)
      .values({
        tenantId,
        grantedBy: actor.userId,
        expiresAt: new Date(now.getTime() + hours * HOUR),
      })
      .returning({
        id: impersonationGrant.id,
        expiresAt: impersonationGrant.expiresAt,
      });

    if (!grant) throw new Error("Autorização não gravada.");

    await auditInTransaction(tx, "support.grant_created", {
      actor: { id: actor.userId },
      tenantId,
      target: { type: "impersonation_grant", id: grant.id },
      metadata: { hours },
      ip: actor.ip,
    });

    return grant;
  });
}

/**
 * Revogar encerra na hora quem está dentro: sem isso, o suporte ficaria até o fim da sessão.
 * `session` não tem RLS, mas o filtro é do tenant do owner que pediu.
 */
export async function revokeSupportGrant(
  tenantId: string,
  grantId: string,
  actor: GrantActor,
  now = new Date(),
) {
  await withTenant(tenantId, async (tx) => {
    const [grant] = await tx
      .update(impersonationGrant)
      .set({ revokedAt: now })
      .where(
        and(
          eq(impersonationGrant.id, grantId),
          eq(impersonationGrant.tenantId, tenantId),
          isNull(impersonationGrant.revokedAt),
          gt(impersonationGrant.expiresAt, now),
        ),
      )
      .returning({ id: impersonationGrant.id });

    if (!grant) throw notFound(NOT_FOUND);

    await auditInTransaction(tx, "support.grant_revoked", {
      actor: { id: actor.userId },
      tenantId,
      target: { type: "impersonation_grant", id: grant.id },
      ip: actor.ip,
    });
  });

  await getDb()
    .delete(session)
    .where(
      and(
        isNotNull(session.impersonatedBy),
        eq(session.activeOrganizationId, tenantId),
      ),
    );
}
