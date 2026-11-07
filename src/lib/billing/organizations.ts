import { and, eq, ne } from "drizzle-orm";
import { withPlatformScope } from "@/db/rls";
import { member, organization, plan, subscription } from "@/db/schema";
import type { SubscriptionStatus } from "@/db/schema/billing";
import type { TenantStatus } from "@/db/schema/tenant";
import { isOwner } from "@/lib/auth/permissions";
import { LIMIT_LABELS } from "@/lib/billing/constants";
import { TenantRuleError } from "@/lib/tenant/errors";

/**
 * Quantas organizações o dono pode ter (`plan.limits.organizations`). Não é limite de um
 * tenant, e sim da pessoa: conta as organizações em que ela é owner e vale o maior limite
 * entre elas. Só assinatura paga (`active` ou `past_due`, tenant ativo) libera o limite do
 * plano: em trial, vencida, cancelada, suspensa ou sem assinatura, a organização vale 1.
 */

/** Limite de quem ainda não paga: trial, gratuito sem a chave, vencida ou sem assinatura. */
export const UNPAID_ORGANIZATIONS_LIMIT = 1;

export type OwnedOrganization = {
  tenantStatus: TenantStatus;
  subscriptionStatus: SubscriptionStatus | null;
  /** `plan.limits.organizations`. Ausente ou `null`: ilimitado. */
  planLimit: number | null | undefined;
};

export type OrganizationAllowance = {
  /** `null`: sem limite. */
  limit: number | null;
  used: number;
  /** Cabe mais uma? */
  allowed: boolean;
};

/**
 * O que uma organização libera: o limite do plano só com a assinatura em dia (gratuito ativo
 * conta, com o limite do próprio plano). Chave ausente no plano: ilimitado, como nos demais.
 */
export function organizationLimitOf(owned: OwnedOrganization): number | null {
  const paid =
    owned.tenantStatus === "active" &&
    (owned.subscriptionStatus === "active" || owned.subscriptionStatus === "past_due");

  if (!paid) return UNPAID_ORGANIZATIONS_LIMIT;
  return owned.planLimit ?? null;
}

/** Decisão pura. Sem organização nenhuma, a primeira sempre passa. */
export function organizationAllowance(owned: OwnedOrganization[]): OrganizationAllowance {
  const used = owned.length;
  if (used === 0) return { limit: null, used, allowed: true };

  let limit: number | null = 0;
  for (const item of owned) {
    const value = organizationLimitOf(item);
    if (value === null) {
      limit = null;
      break;
    }
    limit = Math.max(limit, value);
  }

  return { limit, used, allowed: limit === null || used < limit };
}

/** Organizações (não excluídas) em que a pessoa é owner, com plano e assinatura. */
async function listOwnedOrganizations(userId: string): Promise<OwnedOrganization[]> {
  // `subscription` tem RLS por tenant e aqui a leitura cruza os tenants da pessoa.
  const rows = await withPlatformScope("organizations: limite do dono", (tx) =>
    tx
      .select({
        role: member.role,
        tenantStatus: organization.status,
        subscriptionStatus: subscription.status,
        limits: plan.limits,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .leftJoin(subscription, eq(subscription.tenantId, organization.id))
      .leftJoin(plan, eq(subscription.planId, plan.id))
      .where(and(eq(member.userId, userId), ne(organization.status, "deleted"))),
  );

  return rows
    .filter(({ role }) => isOwner(role))
    .map(({ tenantStatus, subscriptionStatus, limits }) => ({
      tenantStatus,
      subscriptionStatus,
      planLimit: limits?.organizations,
    }));
}

export async function checkOrganizationLimit(userId: string) {
  return organizationAllowance(await listOwnedOrganizations(userId));
}

/** Para o `organizationLimit` do plugin: `true` = atingiu. */
export async function organizationLimitReached(userId: string) {
  return !(await checkOrganizationLimit(userId)).allowed;
}

/** Lança 403 `PLAN_LIMIT_REACHED` antes de criar mais uma organização. */
export async function assertCanCreateOrganization(userId: string) {
  const check = await checkOrganizationLimit(userId);

  if (!check.allowed) {
    throw new TenantRuleError(
      403,
      "PLAN_LIMIT_REACHED",
      `Seu plano permite até ${check.limit} ${LIMIT_LABELS.organizations}. Mude de plano para criar outra.`,
    );
  }

  return check;
}
