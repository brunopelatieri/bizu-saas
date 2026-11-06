import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/rls";
import { organization, planPrice, subscription } from "@/db/schema";
import type {
  SubscriptionAlert,
  SubscriptionEventSource,
  SubscriptionMetadata,
} from "@/db/schema/billing";
import { type AuditEntry, auditInTransaction } from "@/lib/audit";
import { recordSubscriptionEvent } from "@/lib/billing/subscription";
import type {
  AppliedDecision,
  SubscriptionSnapshot,
} from "@/lib/billing/state-machine";

/** Grava o que a máquina de estados decidiu, sempre com a linha travada por quem chama. */

export type SubscriptionRow = typeof subscription.$inferSelect;

export function snapshotOf(row: SubscriptionRow): SubscriptionSnapshot {
  const last = row.metadata.lastProviderEventAt;

  return {
    status: row.status,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    graceUntil: row.graceUntil,
    pendingPlanId: row.pendingPlanId,
    providerSubscriptionRef: row.providerSubscriptionRef,
    lastProviderEventAt: last ? new Date(last) : null,
  };
}

export type PlanTarget = { planId: string; planPriceId: string };

/** O plano por trás da referência de preço do provedor. */
export async function findPriceByRef(
  tx: Tx,
  provider: SubscriptionRow["provider"],
  ref: string | undefined,
): Promise<PlanTarget | null> {
  if (!provider || !ref) return null;

  const [row] = await tx
    .select({ planId: planPrice.planId, planPriceId: planPrice.id })
    .from(planPrice)
    .where(and(eq(planPrice.provider, provider), eq(planPrice.providerPriceRef, ref)));

  return row ?? null;
}

/**
 * O provedor cobra um preço diferente do local? Downgrade agendado já está lá e só entra no
 * fim do período; em trial, quem define o plano é o primeiro pagamento.
 */
export function planDivergence(row: SubscriptionRow, price: PlanTarget | null) {
  if (!price || row.status === "trialing") return null;
  if (price.planPriceId === row.planPriceId) return null;
  if (price.planPriceId === row.metadata.pendingPlanPriceId) return null;

  return price;
}

/** `SELECT ... FOR UPDATE`: webhook, job e owner não se atropelam na mesma assinatura. */
export async function lockSubscription(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(subscription)
    .where(eq(subscription.id, id))
    .for("update");

  return row ?? null;
}

/**
 * `locked` (suspensão) sempre vence: só `full` vira `read_only` e só `read_only` volta a
 * `full`.
 */
export async function setAccessMode(
  tx: Tx,
  tenantId: string,
  mode: "full" | "read_only",
) {
  await tx
    .update(organization)
    .set({ accessMode: mode })
    .where(
      and(
        eq(organization.id, tenantId),
        eq(organization.accessMode, mode === "full" ? "read_only" : "full"),
      ),
    );
}

type ApplyContext = {
  source: SubscriptionEventSource;
  paymentEventId?: string;
  occurredAt?: Date;
  /** Com ator, a mudança entra na auditoria. */
  actor?: AuditEntry["actor"];
  ip?: string | null;
  /** Campos além da decisão, como o plano ativado pelo primeiro pagamento. */
  extra?: Partial<Pick<SubscriptionRow, "planId" | "planPriceId">>;
};

function nextMetadata(
  row: SubscriptionRow,
  decision: AppliedDecision,
  occurredAt: Date | undefined,
) {
  const { pendingPlanPriceId, dunningNotices, ...rest } = row.metadata;
  const metadata: SubscriptionMetadata = { ...rest };

  if (pendingPlanPriceId && decision.patch.pendingPlanId === undefined) {
    metadata.pendingPlanPriceId = pendingPlanPriceId;
  }
  if (dunningNotices && !decision.clearDunningNotices) {
    metadata.dunningNotices = dunningNotices;
  }
  if (occurredAt) metadata.lastProviderEventAt = occurredAt.toISOString();

  return metadata;
}

/** Atualiza a assinatura e o tenant e grava `subscription_event`. Devolve a linha nova. */
export async function applyDecision(
  tx: Tx,
  row: SubscriptionRow,
  decision: AppliedDecision,
  context: ApplyContext,
) {
  const { pendingPlanId, ...patch } = decision.patch;
  const [updated] = await tx
    .update(subscription)
    .set({
      ...patch,
      ...context.extra,
      ...(pendingPlanId === null ? { pendingPlanId: null } : {}),
      ...(decision.applyPendingPrice
        ? { planPriceId: row.metadata.pendingPlanPriceId ?? null }
        : {}),
      status: decision.status,
      metadata: nextMetadata(row, decision, context.occurredAt),
    })
    .where(eq(subscription.id, row.id))
    .returning();

  if (decision.accessMode) {
    await setAccessMode(tx, row.tenantId, decision.accessMode);
  }

  await recordSubscriptionEvent(tx, {
    tenantId: row.tenantId,
    subscriptionId: row.id,
    from: row.status,
    to: decision.status,
    reason: decision.reason,
    source: context.source,
    paymentEventId: context.paymentEventId,
    occurredAt: context.occurredAt,
  });

  if (context.actor) {
    await auditInTransaction(tx, "billing.subscription_changed", {
      actor: context.actor,
      tenantId: row.tenantId,
      ip: context.ip,
      target: { type: "subscription", id: row.id },
      metadata: {
        from: row.status,
        to: decision.status,
        reason: decision.reason,
      },
    });
  }

  return updated ?? row;
}

/**
 * Evento do provedor sem efeito na assinatura ainda conta para a ordem dos próximos. Em
 * SQL, como `setAlert`: não sobrescreve o que outra escrita da transação pôs em `metadata`.
 */
export async function touchProviderClock(
  tx: Tx,
  row: SubscriptionRow,
  occurredAt: Date | undefined,
) {
  const last = row.metadata.lastProviderEventAt;
  if (!occurredAt || (last && new Date(last) >= occurredAt)) return;

  await tx
    .update(subscription)
    .set({
      metadata: sql`jsonb_set(${subscription.metadata}, '{lastProviderEventAt}', to_jsonb(${occurredAt.toISOString()}::text), true)`,
    })
    .where(eq(subscription.id, row.id));
}

export async function setAlert(
  tx: Tx,
  row: SubscriptionRow,
  alert: SubscriptionAlert | null,
) {
  await tx
    .update(subscription)
    .set({
      metadata: alert
        ? sql`jsonb_set(${subscription.metadata}, '{alert}', ${JSON.stringify(alert)}::jsonb, true)`
        : sql`${subscription.metadata} - 'alert'`,
    })
    .where(eq(subscription.id, row.id));
}
