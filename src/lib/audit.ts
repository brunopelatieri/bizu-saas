import { createHash } from "node:crypto";
import { logError } from "@/api/log";
import { auditLog } from "@/db/schema";
import type { AuditActorType } from "@/db/schema/audit";
import { type Tx, withPlatformScope, withTenant } from "@/db/rls";
import { getEnv } from "@/lib/env";

export type AuditAction =
  | "auth.email_verified"
  | "auth.password_reset"
  | "tenant.created"
  | "tenant.updated"
  | "member.invited"
  | "member.invitation_canceled"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "role.created"
  | "role.updated"
  | "role.deleted";

export type AuditEntry = {
  actor: { type?: AuditActorType; id: string | null };
  /** Sem tenant, o evento só aparece com `withPlatformScope`. */
  tenantId?: string | null;
  target?: { type: string; id: string };
  /** Só ids e enums: nunca e-mail, nome ou texto livre. */
  metadata?: Record<string, string | number | boolean | null>;
  ip?: string | null;
};

/** O IP nunca é gravado em claro. Sem `AUDIT_SALT`, o hash seria reversível por tabela. */
export function hashIp(ip: string) {
  return createHash("sha256")
    .update(ip + getEnv().AUDIT_SALT)
    .digest("hex");
}

function toRow(action: AuditAction, entry: AuditEntry) {
  const ip = entry.ip && entry.ip !== "unknown" ? entry.ip : null;

  return {
    tenantId: entry.tenantId ?? null,
    actorType: entry.actor.type ?? ("user" as const),
    actorId: entry.actor.id,
    action,
    targetType: entry.target?.type,
    targetId: entry.target?.id,
    metadata: entry.metadata ?? {},
    ipHash: ip ? hashIp(ip) : null,
  };
}

/**
 * Grava na transação de quem chama: se a auditoria falhar, a mudança volta junto. Use
 * quando a ação acontece dentro de `withTenant`.
 */
export async function auditInTransaction(
  tx: Tx,
  action: AuditAction,
  entry: AuditEntry,
) {
  await tx.insert(auditLog).values(toRow(action, entry));
}

/**
 * Para ações já concluídas por outra transação, como as do Better Auth. A falha vai
 * para o log e não desfaz nem esconde o que já aconteceu.
 */
export async function audit(action: AuditAction, entry: AuditEntry) {
  const write = (tx: Tx) => auditInTransaction(tx, action, entry);

  try {
    await (entry.tenantId
      ? withTenant(entry.tenantId, write)
      : withPlatformScope("auditoria sem tenant", write));
  } catch (error) {
    logError("Falha ao gravar auditoria", error);
  }
}
