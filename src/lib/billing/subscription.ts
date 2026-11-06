import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { type Tx, withTenant } from "@/db/rls";
import {
  organization,
  plan,
  subscription,
  subscriptionEvent,
} from "@/db/schema";
import type {
  SubscriptionEventSource,
  SubscriptionStatus,
} from "@/db/schema/billing";
import { initialSubscription } from "@/lib/billing/trial";
import { loadSettings } from "@/lib/billing/settings";
import { TenantRuleError } from "@/lib/tenant/errors";

export type TenantPlan = {
  subscription: typeof subscription.$inferSelect;
  plan: typeof plan.$inferSelect;
};

/** Assinatura e plano do tenant, ou `null` se ele ainda não tem (anterior à fase 5). */
export async function loadTenantPlan(tenantId: string): Promise<TenantPlan | null> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({ subscription, plan })
      .from(subscription)
      .innerJoin(plan, eq(subscription.planId, plan.id))
      .where(eq(subscription.tenantId, tenantId)),
  );

  return row ?? null;
}

/** Toda mudança de `subscription.status` grava uma linha (`spec-billing.md`). */
export async function recordSubscriptionEvent(
  tx: Tx,
  input: {
    tenantId: string;
    subscriptionId: string;
    from: SubscriptionStatus | null;
    to: SubscriptionStatus;
    reason: string;
    source: SubscriptionEventSource;
    paymentEventId?: string;
    occurredAt?: Date;
  },
) {
  await tx.insert(subscriptionEvent).values({
    tenantId: input.tenantId,
    subscriptionId: input.subscriptionId,
    fromStatus: input.from,
    toStatus: input.to,
    reason: input.reason,
    source: input.source,
    paymentEventId: input.paymentEventId,
    occurredAt: input.occurredAt,
  });
}

/** Planos ativos, do mais barato (ordem do admin) ao mais caro. */
export function listActivePlans() {
  return getDb()
    .select()
    .from(plan)
    .where(eq(plan.active, true))
    .orderBy(asc(plan.sortOrder), asc(plan.name));
}

/** Para onde vai quem cancela, se a plataforma tiver um plano gratuito ativo. */
export async function findFreePlanId() {
  const plans = await listActivePlans();

  return plans.find(({ isFree }) => isFree)?.id ?? null;
}

/**
 * Aplica ao tenant recém-criado o plano e o trial da configuração vigente. Mudar a
 * configuração depois não altera tenants já criados. Idempotente: tenant que já tem
 * assinatura não é tocado. Sem plano utilizável, o tenant fica sem assinatura (sem
 * limites) em vez de travar o onboarding.
 */
export async function startTrial(tenantId: string, now = new Date()) {
  const settings = await loadSettings();
  const plans = await listActivePlans();

  const chosen =
    plans.find(({ id }) => id === settings.trialPlanId) ?? null;
  const fallback = plans.find(({ isFree }) => isFree) ?? null;
  const initial = initialSubscription({
    // Sem plano configurado (ou desativado), vale o gratuito.
    plan: chosen ?? fallback,
    trialDays: settings.trialDays,
    fallback,
    now,
  });

  if (!initial) return null;

  return withTenant(tenantId, async (tx) => {
    const [created] = await tx
      .insert(subscription)
      .values({
        tenantId,
        planId: initial.planId,
        status: initial.status,
        trialEndsAt: initial.trialEndsAt,
      })
      .onConflictDoNothing({ target: subscription.tenantId })
      .returning();

    if (!created) return null;

    await tx
      .update(organization)
      .set({ trialEndsAt: initial.trialEndsAt })
      .where(eq(organization.id, tenantId));
    await recordSubscriptionEvent(tx, {
      tenantId,
      subscriptionId: created.id,
      from: null,
      to: created.status,
      reason: initial.status === "trialing" ? "trial_started" : "free_plan",
      source: "system",
    });

    return created;
  });
}

/**
 * Troca o plano de um tenant (proprietário, em `/admin`). Plano gratuito encerra o
 * trial, devolve o acesso total e larga o vínculo com o provedor, como `endSubscription`:
 * sem isso, a reconciliação e o fim de período desfariam a troca. Plano pago mantém o
 * estado e o trial como estavam. Quem tem assinatura viva no provedor (`unpaid` ainda é
 * viva) precisa ser cancelado antes: trocar só aqui deixaria a cobrança correndo por um
 * plano que o tenant não tem mais.
 */
export async function changeTenantPlan(
  tenantId: string,
  planId: string,
  reason = "admin_plan_change",
) {
  const [target] = await getDb().select().from(plan).where(eq(plan.id, planId));
  if (!target) return null;

  return withTenant(tenantId, async (tx) => {
    const [current] = await tx
      .select()
      .from(subscription)
      .where(eq(subscription.tenantId, tenantId))
      .for("update");

    if (!current) {
      const [created] = await tx
        .insert(subscription)
        .values({
          tenantId,
          planId,
          status: "active",
        })
        .returning();
      if (!created) return null;

      await recordSubscriptionEvent(tx, {
        tenantId,
        subscriptionId: created.id,
        from: null,
        to: "active",
        reason,
        source: "admin",
      });
      return created;
    }

    if (
      current.providerSubscriptionRef &&
      ["active", "past_due", "unpaid", "trialing", "paused"].includes(current.status)
    ) {
      throw new TenantRuleError(
        409,
        "PROVIDER_SUBSCRIPTION_ACTIVE",
        "Cancele a assinatura no provedor antes de trocar o plano.",
      );
    }

    const toFree = target.isFree;
    const next: SubscriptionStatus = toFree ? "active" : current.status;
    const [updated] = await tx
      .update(subscription)
      .set({
        planId,
        planPriceId: null,
        status: next,
        trialEndsAt: toFree ? null : current.trialEndsAt,
        ...(toFree
          ? {
              providerSubscriptionRef: null,
              cancelAtPeriodEnd: false,
              graceUntil: null,
              pendingPlanId: null,
            }
          : {}),
      })
      .where(eq(subscription.id, current.id))
      .returning();

    if (toFree) {
      await tx
        .update(organization)
        .set({ trialEndsAt: null })
        .where(eq(organization.id, tenantId));
      // Só destrava o `read_only` do trial vencido; a suspensão (`locked`) continua.
      await tx
        .update(organization)
        .set({ accessMode: "full" })
        .where(
          and(
            eq(organization.id, tenantId),
            eq(organization.accessMode, "read_only"),
          ),
        );
    }

    if (next !== current.status) {
      await recordSubscriptionEvent(tx, {
        tenantId,
        subscriptionId: current.id,
        from: current.status,
        to: next,
        reason,
        source: "admin",
      });
    }

    return updated ?? null;
  });
}
