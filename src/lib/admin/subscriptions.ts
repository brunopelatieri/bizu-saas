import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { withPlatformScope } from "@/db/rls";
import { organization, plan, subscription } from "@/db/schema";
import type { SubscriptionStatus } from "@/db/schema/billing";
import { escapeLike } from "@/lib/admin/tenants";
import { isProviderManaged } from "@/lib/billing/state-machine";
import { PAGE_SIZE } from "@/lib/schemas/admin";

/** `/admin/assinaturas`: quem precisa de atenção, sem referências do provedor. */
export async function listSubscriptions(input: {
  status?: SubscriptionStatus;
  q?: string;
  page: number;
}) {
  const term = input.q ? `%${escapeLike(input.q)}%` : null;
  const filters: SQL[] = [];

  if (input.status) filters.push(eq(subscription.status, input.status));
  if (term) {
    filters.push(
      or(ilike(organization.name, term), ilike(organization.slug, term)) as SQL,
    );
  }

  const where = filters.length ? and(...filters) : undefined;

  return withPlatformScope("admin: lista assinaturas", async (tx) => {
    const [total] = await tx
      .select({ total: count() })
      .from(subscription)
      .innerJoin(organization, eq(subscription.tenantId, organization.id))
      .where(where);

    const rows = await tx
      .select({
        id: subscription.id,
        tenantId: subscription.tenantId,
        tenantName: organization.name,
        status: subscription.status,
        provider: subscription.provider,
        planName: plan.name,
        planIsFree: plan.isFree,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        graceUntil: subscription.graceUntil,
        // admin-crud B: o que o menu da linha precisa para editar.
        planId: subscription.planId,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodStart: subscription.currentPeriodStart,
        metadata: subscription.metadata,
        linked: subscription.providerSubscriptionRef,
      })
      .from(subscription)
      .innerJoin(organization, eq(subscription.tenantId, organization.id))
      .innerJoin(plan, eq(subscription.planId, plan.id))
      .where(where)
      .orderBy(desc(subscription.updatedAt))
      .limit(PAGE_SIZE)
      .offset((input.page - 1) * PAGE_SIZE);

    return {
      items: rows.map(({ metadata, linked, ...row }) => ({
        ...row,
        linked: linked !== null,
        // `provider`: cobrada pelo módulo (`isProviderManaged`); `manual`: marcada aqui.
        billingMode: isProviderManaged({ status: row.status, providerSubscriptionRef: linked })
          ? ("provider" as const)
          : ("manual" as const),
        alert: metadata.alert ?? null,
      })),
      total: total?.total ?? 0,
      pageSize: PAGE_SIZE,
    };
  });
}
