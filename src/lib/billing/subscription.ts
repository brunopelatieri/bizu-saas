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
import { voidOpenManualInvoices } from "@/lib/billing/manual";
import { initialSubscription } from "@/lib/billing/trial";
import { loadSettings } from "@/lib/billing/settings";
import { isProviderManaged } from "@/lib/billing/state-machine";
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
 * trial, devolve o acesso total, limpa o período e larga o vínculo com o provedor, como
 * `endSubscription`: sem isso, a reconciliação e o fim de período desfariam a troca. Plano
 * pago mantém o estado e o trial como estavam; saindo do gratuito (`active` sem período), a
 * cobrança manual vence **agora**: o job abre a fatura e a carência começa. Faturas manuais em
 * aberto são anuladas, porque o valor era do plano antigo. Quem tem assinatura viva no
 * provedor (`unpaid` ainda é viva) precisa ser cancelado antes: trocar só aqui deixaria a
 * cobrança correndo por um plano que o tenant não tem mais.
 */
export async function changeTenantPlan(
  tenantId: string,
  planId: string,
  reason = "admin_plan_change",
  now = new Date(),
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
          // Plano pago sem provedor: vence agora, como quem sai do gratuito.
          ...(target.isFree ? {} : { currentPeriodStart: now, currentPeriodEnd: now }),
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

    if (isProviderManaged(current)) {
      throw new TenantRuleError(
        409,
        "PROVIDER_SUBSCRIPTION_ACTIVE",
        "Cancele a assinatura no provedor antes de trocar o plano.",
      );
    }

    const toFree = target.isFree;
    const next: SubscriptionStatus = toFree ? "active" : current.status;
    // Do gratuito (ativo, sem período) para o pago: a cobrança manual vence agora.
    const startsBilling =
      !toFree && current.status === "active" && current.currentPeriodEnd === null;
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
              currentPeriodStart: null,
              currentPeriodEnd: null,
            }
          : {}),
        ...(startsBilling ? { currentPeriodStart: now, currentPeriodEnd: now } : {}),
      })
      .where(eq(subscription.id, current.id))
      .returning();

    if (planId !== current.planId) await voidOpenManualInvoices(tx, current.id);

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
