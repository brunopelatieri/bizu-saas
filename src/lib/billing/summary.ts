import { type BillingState, billingState } from "@/lib/billing/state";
import { loadTenantPlan } from "@/lib/billing/subscription";
import { daysLeft } from "@/lib/billing/trial";
import type { TenantAccessMode, TenantStatus } from "@/db/schema/tenant";

/** O que a interface precisa saber da cobrança do tenant ativo (`GET /api/me`). */
export type BillingSummary = {
  state: BillingState;
  plan: { slug: string; name: string; isFree: boolean } | null;
  /** ISO 8601; só em `trialing`. */
  trialEndsAt: string | null;
  /** Dias inteiros até o fim do trial; só em `trialing`. */
  trialDaysLeft: number | null;
  /** Fim da carência (ISO 8601); só em `past_due`. */
  graceUntil: string | null;
};

export type TenantBilling = {
  billing: BillingSummary;
  /** Features do plano. */
  features: string[];
  /** Só os limites definidos; chave ausente = ilimitado. */
  limits: Record<string, number>;
};

export async function loadTenantBilling(
  tenant: { id: string; status: TenantStatus; accessMode: TenantAccessMode },
  now = new Date(),
): Promise<TenantBilling> {
  const current = await loadTenantPlan(tenant.id);
  const state = billingState({
    status: tenant.status,
    accessMode: tenant.accessMode,
    subscriptionStatus: current?.subscription.status ?? null,
  });
  const trialEndsAt =
    state === "trialing" ? (current?.subscription.trialEndsAt ?? null) : null;

  const limits = Object.fromEntries(
    Object.entries(current?.plan.limits ?? {}).flatMap(([metric, value]) =>
      typeof value === "number" ? [[metric, value]] : [],
    ),
  );

  return {
    billing: {
      state,
      plan: current && {
        slug: current.plan.slug,
        name: current.plan.name,
        isFree: current.plan.isFree,
      },
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      trialDaysLeft: trialEndsAt ? daysLeft(now, trialEndsAt) : null,
      graceUntil:
        state === "past_due"
          ? (current?.subscription.graceUntil?.toISOString() ?? null)
          : null,
    },
    features: state === "locked" ? [] : (current?.plan.features ?? []),
    limits: state === "locked" ? {} : limits,
  };
}
