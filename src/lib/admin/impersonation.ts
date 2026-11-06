import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { withPlatformScope } from "@/db/rls";
import { auditLog, impersonationGrant, organization, session } from "@/db/schema";
import { audit } from "@/lib/audit";
import { runInBackground } from "@/lib/auth/background";
import { appLink } from "@/lib/auth/links";
import type { ImpersonationPolicy } from "@/lib/billing/constants";
import { listTenantOwners } from "@/lib/billing/notify";
import { loadSettings } from "@/lib/billing/settings";
import { sendEmail } from "@/lib/email/send";
import { impersonationRequestedTemplate } from "@/lib/email/templates/impersonation-requested";
import { impersonationStartedTemplate } from "@/lib/email/templates/impersonation-started";

/** O nome de quem atende não vai ao cliente: quem responde é a equipe. */
const SUPPORT_NAME = "Equipe de suporte";
const DEFAULT_REASON = "Atendimento de suporte.";

/** Prazo escrito no e-mail do pedido. */
const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
/** Repetir o pedido dentro desta janela não manda outro e-mail ao owner. */
const REQUEST_THROTTLE_MS = 60 * 60 * 1000;

export type ImpersonationAccess = {
  policy: ImpersonationPolicy;
  grant: { id: string; expiresAt: Date } | null;
  allowed: boolean;
};

export async function impersonationAccess(
  tenantId: string,
  now = new Date(),
): Promise<ImpersonationAccess> {
  const { impersonationPolicy: policy } = await loadSettings();

  const [grant] = await withPlatformScope("admin: consentimento do tenant", (tx) =>
    tx
      .select({
        id: impersonationGrant.id,
        expiresAt: impersonationGrant.expiresAt,
      })
      .from(impersonationGrant)
      .where(
        and(
          eq(impersonationGrant.tenantId, tenantId),
          isNull(impersonationGrant.revokedAt),
          gt(impersonationGrant.expiresAt, now),
        ),
      )
      .orderBy(desc(impersonationGrant.expiresAt))
      .limit(1),
  );

  return {
    policy,
    grant: grant ?? null,
    allowed: Boolean(grant) || policy === "allow_without_consent",
  };
}

/**
 * Prende a sessão ao tenant do consentimento, sem tocar em `last_tenant_id`, que é do
 * usuário. Se o grant acaba antes da 1 h padrão, a sessão acaba com ele. Quem garante o
 * prazo é `impersonation_expires_at`, conferida a cada requisição em `resolveSession`.
 */
export async function bindImpersonation(
  sessionId: string,
  tenantId: string,
  sessionExpiresAt: Date,
  grantExpiresAt?: Date,
) {
  const expiresAt =
    grantExpiresAt && grantExpiresAt < sessionExpiresAt
      ? grantExpiresAt
      : sessionExpiresAt;

  await getDb()
    .update(session)
    .set({
      activeOrganizationId: tenantId,
      expiresAt,
      impersonationExpiresAt: expiresAt,
    })
    .where(eq(session.id, sessionId));

  return expiresAt;
}

export function recordGrantUse(grantId: string, usedBy: string) {
  return withPlatformScope("admin: uso do consentimento", (tx) =>
    tx
      .update(impersonationGrant)
      .set({ usedBy })
      .where(eq(impersonationGrant.id, grantId)),
  );
}

async function requestedRecently(tenantId: string, now: Date) {
  const [row] = await withPlatformScope("admin: pedido de acesso recente", (tx) =>
    tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenantId, tenantId),
          eq(auditLog.action, "platform.impersonation_requested"),
          gt(auditLog.createdAt, new Date(now.getTime() - REQUEST_THROTTLE_MS)),
        ),
      )
      .limit(1),
  );

  return Boolean(row);
}

async function emailOwnersOfRequest(
  tenantId: string,
  reason: string,
  now: Date,
) {
  const [tenant] = await getDb()
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, tenantId));
  if (!tenant) return;

  for (const owner of await listTenantOwners(tenantId)) {
    await sendEmail({
      to: owner.email,
      ...impersonationRequestedTemplate({
        ownerName: owner.name,
        tenantName: tenant.name,
        supportName: SUPPORT_NAME,
        reason,
        expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
        url: appLink("/app/configuracoes/suporte"),
      }),
      tags: { template: "impersonation-requested" },
    });
  }
}

/** Sem consentimento: registra o pedido e avisa os owners, no máximo uma vez por hora. */
export async function requestSupportAccess({
  tenantId,
  targetUserId,
  actorId,
  reason,
  ip,
  now = new Date(),
}: {
  tenantId: string;
  targetUserId: string;
  actorId: string;
  reason?: string;
  ip: string;
  now?: Date;
}) {
  const throttled = await requestedRecently(tenantId, now);

  await audit("platform.impersonation_requested", {
    actor: { type: "platform", id: actorId },
    impersonatorId: actorId,
    tenantId,
    target: { type: "user", id: targetUserId },
    metadata: { email_sent: !throttled },
    ip,
  });

  if (!throttled) {
    runInBackground(
      emailOwnersOfRequest(tenantId, reason ?? DEFAULT_REASON, now),
    );
  }
}

export async function notifyImpersonationStarted(
  tenantId: string,
  endsAt: Date,
  now = new Date(),
) {
  const [tenant] = await getDb()
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, tenantId));
  if (!tenant) return;

  for (const owner of await listTenantOwners(tenantId)) {
    await sendEmail({
      to: owner.email,
      ...impersonationStartedTemplate({
        ownerName: owner.name,
        tenantName: tenant.name,
        supportName: SUPPORT_NAME,
        startedAt: now,
        endsAt,
      }),
      tags: { template: "impersonation-started" },
    });
  }
}
