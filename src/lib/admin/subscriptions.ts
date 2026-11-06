import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { withPlatformScope } from "@/db/rls";
import { organization, plan, subscription } from "@/db/schema";
import type { SubscriptionStatus } from "@/db/schema/billing";
import { escapeLike } from "@/lib/admin/tenants";
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
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        graceUntil: subscription.graceUntil,
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
        alert: metadata.alert ?? null,
      })),
      total: total?.total ?? 0,
      pageSize: PAGE_SIZE,
    };
  });
}
