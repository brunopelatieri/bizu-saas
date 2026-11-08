import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { withTenant } from "@/db/rls";
import { customer } from "@/db/schema";
import { isUniqueViolation } from "@/db/errors";
import { escapeLike } from "@/lib/admin/tenants";
import { auditInTransaction } from "@/lib/audit";
import { getPortalAuth } from "@/lib/auth/portal";
import type { PortalLinkContext } from "@/lib/auth/portal-emails";
import { assertWithinLimit } from "@/lib/billing/limits";
import {
  dropOrphanPortalUser,
  ensurePortalUser,
  leavePortalTenant,
} from "@/lib/portal/access";
import {
  CUSTOMER_PAGE_SIZE,
  type CustomerInput,
  type CustomersQuery,
  type UpdateCustomerInput,
} from "@/lib/schemas/customer";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";

/** Quem age e de onde, para a auditoria. */
export type CustomerActor = { userId: string; ip?: string };

type CustomerRow = typeof customer.$inferSelect;

const NOT_FOUND = "Cliente não encontrado.";
const EMAIL_TAKEN = new TenantRuleError(
  409,
  "CUSTOMER_EMAIL_TAKEN",
  "Já existe um cliente com este e-mail.",
);

/** `emailVerified` e os demais dados de `portal_user` são globais e não saem daqui. */
function toCustomer({ portalUserId, tenantId: _tenantId, ...row }: CustomerRow) {
  return { ...row, hasPortalAccess: portalUserId !== null };
}

function byId(tenantId: string, customerId: string) {
  return and(eq(customer.id, customerId), eq(customer.tenantId, tenantId));
}

export function listCustomers(tenantId: string, query: CustomersQuery) {
  const term = query.q ? `%${escapeLike(query.q)}%` : null;
  const filters: (SQL | undefined)[] = [eq(customer.tenantId, tenantId)];

  if (query.status) filters.push(eq(customer.status, query.status));
  if (term) {
    filters.push(
      or(
        ilike(customer.name, term),
        ilike(customer.email, term),
        ilike(customer.document, term),
      ),
    );
  }

  const where = and(...filters);

  return withTenant(tenantId, async (tx) => {
    const [total] = await tx.select({ total: count() }).from(customer).where(where);
    const rows = await tx
      .select()
      .from(customer)
      .where(where)
      .orderBy(desc(customer.createdAt), desc(customer.id))
      .limit(CUSTOMER_PAGE_SIZE)
      .offset((query.page - 1) * CUSTOMER_PAGE_SIZE);

    return {
      items: rows.map(toCustomer),
      total: total?.total ?? 0,
      pageSize: CUSTOMER_PAGE_SIZE,
    };
  });
}

export async function getCustomer(tenantId: string, customerId: string) {
  const [row] = await withTenant(tenantId, (tx) =>
    tx.select().from(customer).where(byId(tenantId, customerId)),
  );

  if (!row) throw notFound(NOT_FOUND);

  return toCustomer(row);
}

export async function createCustomer(
  tenantId: string,
  input: CustomerInput,
  actor: CustomerActor,
) {
  await assertWithinLimit(tenantId, "customers");

  try {
    return await withTenant(tenantId, async (tx) => {
      const [created] = await tx
        .insert(customer)
        .values({ ...input, tenantId })
        .returning();
      if (!created) throw new Error("cliente não criado");

      await auditInTransaction(tx, "customer.created", {
        actor: { id: actor.userId },
        tenantId,
        target: { type: "customer", id: created.id },
        metadata: { status: created.status },
        ip: actor.ip,
      });

      return toCustomer(created);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw EMAIL_TAKEN;
    throw error;
  }
}

/**
 * Trocar o e-mail desfaz o vínculo com o portal: o endereço antigo perde o acesso, e o novo
 * só entra depois de um convite. Sair de `active` corta o acesso na hora.
 */
export async function updateCustomer(
  tenantId: string,
  customerId: string,
  patch: UpdateCustomerInput,
  actor: CustomerActor,
) {
  let unlinkedUserId: string | null = null;

  try {
    const updated = await withTenant(tenantId, async (tx) => {
      const [current] = await tx
        .select()
        .from(customer)
        .where(byId(tenantId, customerId))
        .for("update");
      if (!current) throw notFound(NOT_FOUND);

      const emailChanged =
        patch.email !== undefined && patch.email !== current.email;
      const fallbackStatus =
        current.status === "blocked" ? ("blocked" as const) : ("lead" as const);
      const status =
        patch.status ?? (emailChanged ? fallbackStatus : current.status);

      const [row] = await tx
        .update(customer)
        .set({
          ...patch,
          status,
          ...(emailChanged
            ? { portalUserId: null, invitedAt: null, lastLoginAt: null }
            : {}),
        })
        .where(byId(tenantId, customerId))
        .returning();
      if (!row) throw notFound(NOT_FOUND);

      if (current.portalUserId && (emailChanged || status !== "active")) {
        await leavePortalTenant(tx, current.portalUserId, tenantId);
      }
      if (emailChanged) unlinkedUserId = current.portalUserId;

      await auditInTransaction(tx, "customer.updated", {
        actor: { id: actor.userId },
        tenantId,
        target: { type: "customer", id: customerId },
        metadata: { status, emailChanged },
        ip: actor.ip,
      });

      return toCustomer(row);
    });

    if (unlinkedUserId) await dropOrphanPortalUser(unlinkedUserId);

    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) throw EMAIL_TAKEN;
    throw error;
  }
}

export async function deleteCustomer(
  tenantId: string,
  customerId: string,
  actor: CustomerActor,
) {
  const portalUserId = await withTenant(tenantId, async (tx) => {
    const [removed] = await tx
      .delete(customer)
      .where(byId(tenantId, customerId))
      .returning({ portalUserId: customer.portalUserId });
    if (!removed) throw notFound(NOT_FOUND);

    if (removed.portalUserId) {
      await leavePortalTenant(tx, removed.portalUserId, tenantId);
    }

    await auditInTransaction(tx, "customer.deleted", {
      actor: { id: actor.userId },
      tenantId,
      target: { type: "customer", id: customerId },
      ip: actor.ip,
    });

    return removed.portalUserId;
  });

  if (portalUserId) await dropOrphanPortalUser(portalUserId);
}

/**
 * "Enviar acesso": decisão do owner, e por isso `lead` passa a `active`. A posse do e-mail
 * só é provada no clique: até lá, `portal_user` fica sem senha e sem verificação. Quem já
 * tem conta em outro tenant recebe o mesmo convite, e a resposta não muda: este tenant não
 * fica sabendo. Cliente bloqueado é desbloqueado de propósito, por `status`.
 */
export async function inviteCustomer(
  tenant: { id: string; slug: string; name: string },
  customerId: string,
  actor: CustomerActor,
) {
  const [current] = await withTenant(tenant.id, (tx) =>
    tx.select().from(customer).where(byId(tenant.id, customerId)),
  );

  if (!current) throw notFound(NOT_FOUND);
  if (current.status === "blocked") {
    throw new TenantRuleError(
      409,
      "CUSTOMER_BLOCKED",
      "Desbloqueie o cliente antes de enviar o acesso.",
    );
  }

  const portalUserId =
    current.portalUserId ??
    (await ensurePortalUser(current.email, current.name));

  await withTenant(tenant.id, async (tx) => {
    await tx
      .update(customer)
      .set({ portalUserId, status: "active", invitedAt: new Date() })
      .where(byId(tenant.id, customerId));
    await auditInTransaction(tx, "customer.invited", {
      actor: { id: actor.userId },
      tenantId: tenant.id,
      target: { type: "customer", id: customerId },
      ip: actor.ip,
    });
  });

  await getPortalAuth().api.signInMagicLink({
    headers: new Headers(),
    body: {
      email: current.email,
      metadata: {
        kind: "invite",
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        customerName: current.name,
      } satisfies PortalLinkContext,
    },
  });
}
