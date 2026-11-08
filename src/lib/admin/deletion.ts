import { eq } from "drizzle-orm";
import { logError } from "@/api/log";
import { withPlatformScope } from "@/db/rls";
import { organization, portalSession, session, user } from "@/db/schema";
import type { DeletionSubjectType } from "@/db/schema/lgpd";
import { assertManageableUser, loadPortalPerson, sessionsOf } from "@/lib/admin/people";
import { type AuditAction, audit, auditInTransaction } from "@/lib/audit";
import { appLink } from "@/lib/auth/links";
import { cancelSubscriptionForDeletion } from "@/lib/billing/checkout";
import { listTenantOwners } from "@/lib/billing/notify";
import { normalizeEmail } from "@/lib/email/address";
import { sendEmail } from "@/lib/email/send";
import { deletionExecutedTemplate } from "@/lib/email/templates/deletion-executed";
import {
  anticipateDeletion,
  cancelDeletion,
  deletionPending,
  executeDeletion,
  findPendingDeletion,
  graceEnd,
  PLATFORM_BAN_REASON,
  type ScheduledRequest,
  scheduleTenantDeletion,
  schedulePortalDeletion,
  scheduleUserDeletion,
} from "@/lib/lgpd/deletion";
import type { DeleteInput, DeleteUserInput, DeletionMode } from "@/lib/schemas/admin";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";
import { soleOwnerTenants } from "@/lib/tenant/ownership";

/**
 * Exclusões pelo `/admin` (`docs/specs/admin-crud/spec.md`, seção 1): agendada (30 dias,
 * reversível, `origin = platform`) ou imediata. A imediata grava o mesmo pedido vencendo agora
 * e chama `executeDeletion`, a mesma anonimização do job; se falhar no meio, o pedido fica
 * `pending` vencido e o job `lgpd.delete` termina.
 */

export type AdminActor = { id: string; ip?: string | null };

type Subject = { type: DeletionSubjectType; id: string };

const REQUESTED: Record<DeletionSubjectType, AuditAction> = {
  tenant: "admin.tenant_deletion_requested",
  user: "admin.user_deletion_requested",
  portal_user: "admin.portal_user_deletion_requested",
};

const EXECUTED: Record<DeletionSubjectType, AuditAction> = {
  tenant: "admin.tenant_deletion_executed",
  user: "admin.user_deletion_executed",
  portal_user: "admin.portal_user_deletion_executed",
};

/** Protege do clique errado e da chamada forjada com o id trocado. */
function assertConfirmation(expected: string, typed: string) {
  if (normalizeEmail(expected) !== normalizeEmail(typed)) {
    throw new TenantRuleError(
      400,
      "CONFIRMATION_MISMATCH",
      "A confirmação não confere. Digite exatamente o que a tela pede.",
    );
  }
}

/**
 * Só ids e enums vão para a auditoria (`AuditEntry.metadata`): o motivo, texto livre, fica no
 * `deletion_request.metadata`, junto do pedido.
 */
function auditEntry(subject: Subject, actor: AdminActor, mode: DeletionMode, tenantId?: string) {
  return {
    actor: { type: "platform" as const, id: actor.id },
    tenantId: tenantId ?? (subject.type === "tenant" ? subject.id : null),
    target: { type: subject.type, id: subject.id },
    metadata: { mode },
    ip: actor.ip,
  };
}

/**
 * A exclusão imediata: antecipa o pedido em aberto (de qualquer origem) ou cria um vencendo
 * agora, e executa. O que não executou (pedido cancelado na corrida, dono único que surgiu)
 * vira 409, sem fingir sucesso.
 */
async function executeNow(
  subject: Subject,
  schedule: (now: Date) => Promise<ScheduledRequest>,
): Promise<Date> {
  const now = new Date();
  const pending = await findPendingDeletion(subject);
  let requestId: string | null = pending?.id ?? null;

  if (requestId) {
    await anticipateDeletion(requestId, now);
  } else {
    requestId = (await schedule(now)).id;
  }

  if (!requestId) throw deletionPending();

  const outcome = await executeDeletion(requestId, now);

  if (outcome !== "executed") {
    throw new TenantRuleError(
      409,
      "DELETION_NOT_EXECUTED",
      "A exclusão não pôde ser executada agora. Confira o estado e tente de novo.",
    );
  }

  return now;
}

function notifyExecuted(to: { email: string; name: string }, subjectLabel: string) {
  return sendEmail({
    to: to.email,
    ...deletionExecutedTemplate({ name: to.name, subjectLabel, url: appLink("/contato") }),
    tags: { template: "deletion-executed" },
  }).catch((error) => logError("Falha ao avisar a exclusão executada", error));
}

/** O provedor recusou o cancelamento: nada foi agendado. */
function providerCancelFailed(error: unknown): never {
  if (error instanceof TenantRuleError && error.code === "PROVIDER_ERROR") {
    throw new TenantRuleError(
      409,
      "PROVIDER_CANCEL_FAILED",
      "O provedor de pagamento não confirmou o cancelamento da assinatura. Nada foi excluído.",
    );
  }
  throw error;
}

type TenantRow = { id: string; name: string; slug: string; status: string };

async function loadTenant(tenantId: string): Promise<TenantRow> {
  const [row] = await withPlatformScope("admin: carrega organização", (tx) =>
    tx
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
      })
      .from(organization)
      .where(eq(organization.id, tenantId)),
  );

  if (!row || row.status === "deleted") throw notFound("Organização não encontrada.");

  return row;
}

/** Encerra a assinatura no provedor antes de qualquer outra coisa. */
async function cancelProviderFirst(tenantId: string, actor: AdminActor) {
  await cancelSubscriptionForDeletion(tenantId, {
    userId: actor.id,
    ip: actor.ip,
    platform: true,
  }).catch(providerCancelFailed);
}

/** O núcleo da seção 2, sem a confirmação (que a rota da organização confere). */
async function deleteTenantAs(
  tenant: { id: string; name: string },
  mode: DeletionMode,
  reason: string | undefined,
  actor: AdminActor,
) {
  const subject: Subject = { type: "tenant", id: tenant.id };

  if (mode === "scheduled") {
    const result = await scheduleTenantDeletion(tenant, {
      origin: "platform",
      actorId: actor.id,
      scheduledFor: graceEnd(new Date()),
      metadata: reason ? { reason } : {},
      ip: actor.ip,
      onCreated: (tx) => auditInTransaction(tx, REQUESTED.tenant, auditEntry(subject, actor, mode)),
    }).catch(providerCancelFailed);

    return result.scheduledFor;
  }

  // Os owners saem junto com a organização: a lista é lida antes.
  const owners = await listTenantOwners(tenant.id);
  const executedAt = await executeNow(subject, (now) =>
    scheduleTenantDeletion(tenant, {
      origin: "platform",
      actorId: actor.id,
      scheduledFor: now,
      metadata: reason ? { reason } : {},
      ip: actor.ip,
      now,
      notify: false,
    }).catch(providerCancelFailed),
  );

  await audit(EXECUTED.tenant, auditEntry(subject, actor, mode));
  for (const owner of owners) {
    await notifyExecuted(owner, `a organização ${tenant.name}`);
  }

  return executedAt;
}

/** `DELETE /api/admin/tenants/:id`. Vale também para organização suspensa pela plataforma. */
export async function adminDeleteTenant(tenantId: string, input: DeleteInput, actor: AdminActor) {
  const tenant = await loadTenant(tenantId);
  assertConfirmation(tenant.slug, input.confirm);

  if (input.mode === "scheduled" && (await findPendingDeletion({ type: "tenant", id: tenantId }))) {
    throw deletionPending("Esta organização já tem a exclusão agendada.");
  }

  const scheduledFor = await deleteTenantAs(tenant, input.mode, input.reason, actor);

  return { mode: input.mode, scheduledFor };
}

export function adminCancelTenantDeletion(tenantId: string, actor: AdminActor) {
  return cancelDeletion({ type: "tenant", id: tenantId }, { type: "platform", id: actor.id }, actor.ip);
}

/**
 * `DELETE /api/admin/users/:id`. Organizações de que a pessoa é a única owner caem no mesmo
 * `mode` só com `deleteSoleOrganizations`; o provedor de todas é encerrado antes de qualquer
 * outra coisa, e a falha de um aborta antes de tocar no usuário. Agendar bane a conta (o que
 * encerra as sessões e barra o login na carência) na mesma transação do pedido.
 */
export async function adminDeleteUser(targetId: string, input: DeleteUserInput, actor: AdminActor) {
  const target = await assertManageableUser(targetId, actor.id);
  assertConfirmation(target.email, input.confirm);

  const subject: Subject = { type: "user", id: target.id };

  if (input.mode === "scheduled" && (await findPendingDeletion(subject))) throw deletionPending();

  const sole = await soleOwnerTenants(target.id);

  if (sole.length > 0 && !input.deleteSoleOrganizations) {
    throw new TenantRuleError(
      409,
      "LAST_OWNER",
      `Esta pessoa é a única proprietária de ${sole.map(({ name }) => name).join(", ")}.`,
      { tenants: sole },
    );
  }

  for (const tenant of sole) await cancelProviderFirst(tenant.id, actor);
  for (const tenant of sole) await deleteTenantAs(tenant, input.mode, input.reason, actor);

  const person = { id: target.id, name: target.name, email: target.email, platformRole: target.role };
  const metadata = { wasBanned: target.banned, ...(input.reason ? { reason: input.reason } : {}) };

  if (input.mode === "scheduled") {
    const result = await scheduleUserDeletion(person, {
      origin: "platform",
      actorId: actor.id,
      scheduledFor: graceEnd(new Date()),
      metadata,
      onCreated: async (tx) => {
        // Já banida: o motivo original fica, e o cancelamento não a desbane.
        if (!target.banned) {
          await tx
            .update(user)
            .set({ banned: true, banReason: PLATFORM_BAN_REASON, banExpires: null })
            .where(eq(user.id, target.id));
        }
        await tx.delete(session).where(sessionsOf(target.id));
        await auditInTransaction(tx, REQUESTED.user, auditEntry(subject, actor, input.mode));
      },
    });

    return { mode: input.mode, scheduledFor: result.scheduledFor, tenants: sole };
  }

  const executedAt = await executeNow(subject, (now) =>
    scheduleUserDeletion(person, {
      origin: "platform",
      actorId: actor.id,
      scheduledFor: now,
      metadata,
      notify: false,
    }),
  );

  await audit(EXECUTED.user, auditEntry(subject, actor, input.mode));
  await notifyExecuted(target, "sua conta");

  return { mode: input.mode, scheduledFor: executedAt, tenants: sole };
}

export function adminCancelUserDeletion(targetId: string, actor: AdminActor) {
  return cancelDeletion({ type: "user", id: targetId }, { type: "platform", id: actor.id }, actor.ip);
}

/**
 * `DELETE /api/admin/portal-users/:id`. Agendar encerra as sessões; na carência, o pedido da
 * plataforma barra o acesso (`portalAccessBarred`). `customer.status` não é tocado, para o
 * cancelamento não perder o estado.
 */
export async function adminDeletePortalUser(personId: string, input: DeleteInput, actor: AdminActor) {
  const person = await loadPortalPerson(personId);
  assertConfirmation(person.email, input.confirm);

  const subject: Subject = { type: "portal_user", id: person.id };
  const metadata = input.reason ? { reason: input.reason } : {};

  if (input.mode === "scheduled") {
    if (await findPendingDeletion(subject)) throw deletionPending();

    const result = await schedulePortalDeletion(person, {
      origin: "platform",
      actorId: actor.id,
      scheduledFor: graceEnd(new Date()),
      metadata,
      onCreated: async (tx) => {
        await tx.delete(portalSession).where(eq(portalSession.userId, person.id));
        await auditInTransaction(tx, REQUESTED.portal_user, auditEntry(subject, actor, input.mode));
      },
    });

    return { mode: input.mode, scheduledFor: result.scheduledFor };
  }

  const executedAt = await executeNow(subject, (now) =>
    schedulePortalDeletion(person, {
      origin: "platform",
      actorId: actor.id,
      scheduledFor: now,
      metadata,
      notify: false,
    }),
  );

  await audit(EXECUTED.portal_user, auditEntry(subject, actor, input.mode));
  await notifyExecuted(person, "sua conta no portal");

  return { mode: input.mode, scheduledFor: executedAt };
}

export async function adminCancelPortalUserDeletion(personId: string, actor: AdminActor) {
  await cancelDeletion(
    { type: "portal_user", id: personId },
    { type: "platform", id: actor.id },
    actor.ip,
  );
}
