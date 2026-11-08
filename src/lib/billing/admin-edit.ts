import { eq, sql } from "drizzle-orm";
import { logError } from "@/api/log";
import { type Tx, withPlatformScope } from "@/db/rls";
import { organization, plan, subscription } from "@/db/schema";
import { type AuditEntry, auditInTransaction } from "@/lib/audit";
import {
  applyDecision,
  lockSubscription,
  type SubscriptionRow,
  snapshotOf,
} from "@/lib/billing/apply";
import {
  type AdminEditPlan,
  adminStatusChange,
  keptTrialNotices,
} from "@/lib/billing/admin-edit-rules";
import { applyRemoteSubscription } from "@/lib/billing/reconcile";
import { loadSettings } from "@/lib/billing/settings";
import {
  type AppliedDecision,
  type BillingEvent,
  isProviderManaged,
  transition,
} from "@/lib/billing/state-machine";
import { recordSubscriptionEvent } from "@/lib/billing/subscription";
import { getProvider, platformContext } from "@/lib/payments/registry";
import type { PaymentProvider } from "@/lib/payments/types";
import type { UpdateSubscriptionInput } from "@/lib/schemas/admin";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";

/**
 * Edição de datas e status da assinatura pelo proprietário da plataforma
 * (`docs/specs/admin-crud/spec.md`, seção 5). As regras ficam em `admin-edit-rules.ts`
 * (puras); aqui elas são gravadas pelas mesmas peças das outras transições
 * (`applyDecision`, `subscription_event` com `source = admin`, auditoria). Com provedor, a
 * mudança vai primeiro a ele e a resposta entra pela reconciliação.
 */

type Actor = { userId: string; ip?: string | null };

const auditActor = (actor: Actor): AuditEntry["actor"] => ({
  type: "platform",
  id: actor.userId,
});

/** O motivo do admin vai para o histórico da assinatura, que só o `/admin` lê. */
const eventReason = (reason: string) => `admin_edit: ${reason}`;

const REFUSED = {
  unsupported: new TenantRuleError(
    409,
    "PROVIDER_UNSUPPORTED",
    "O provedor desta assinatura não permite esta mudança por aqui.",
  ),
  changed: new TenantRuleError(
    409,
    "SUBSCRIPTION_CHANGED",
    "A assinatura mudou enquanto você editava. Recarregue e tente de novo.",
  ),
} as const;

async function loadWithPlan(tx: Tx, subscriptionId: string, lock: boolean) {
  const row = lock
    ? await lockSubscription(tx, subscriptionId)
    : ((
        await tx.select().from(subscription).where(eq(subscription.id, subscriptionId))
      )[0] ?? null);
  if (!row) throw notFound("Assinatura não encontrada.");

  const [current] = await tx
    .select({ isFree: plan.isFree })
    .from(plan)
    .where(eq(plan.id, row.planId));

  return { row, planIsFree: current?.isFree ?? false };
}

function decide(
  row: SubscriptionRow,
  planIsFree: boolean,
  input: UpdateSubscriptionInput,
  context: { now: Date; graceDays: number },
): AdminEditPlan {
  const paidThrough = row.metadata.paidThrough;
  const result = adminStatusChange(
    {
      status: row.status,
      trialEndsAt: row.trialEndsAt,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      graceUntil: row.graceUntil,
      providerManaged: isProviderManaged(row),
      planIsFree,
      paidThrough: paidThrough ? new Date(paidThrough) : null,
    },
    {
      status: input.status,
      trialEndsAt: input.trialEndsAt,
      currentPeriodEnd: input.currentPeriodEnd,
      graceUntil: input.graceUntil,
    },
    context,
  );

  if (!result.ok) {
    throw new TenantRuleError(result.error.status, result.error.code, result.error.message);
  }

  return result.plan;
}

/** Edita a assinatura. Devolve a linha como ficou. */
export async function editSubscription(
  subscriptionId: string,
  input: UpdateSubscriptionInput,
  actor: Actor,
  now = new Date(),
) {
  const { graceDays } = await loadSettings();
  const context = { now, graceDays };

  const loaded = await withPlatformScope("admin: carrega assinatura", (tx) =>
    loadWithPlan(tx, subscriptionId, false),
  );
  const first = decide(loaded.row, loaded.planIsFree, input, context);

  if (first.provider && first.provider.kind !== "local") {
    return editWithProvider(loaded.row, first, input.reason, actor, now);
  }

  return withPlatformScope("admin: edita assinatura", async (tx) => {
    // De novo com a linha travada: o job ou o webhook podem ter mudado algo no meio.
    const { row, planIsFree } = await loadWithPlan(tx, subscriptionId, true);
    const plan = decide(row, planIsFree, input, context);
    if (plan.provider && plan.provider.kind !== "local") throw REFUSED.changed;

    const decision: AppliedDecision = {
      outcome: "applied",
      status: plan.to,
      reason: "admin_edit",
      patch: {
        graceUntil: plan.patch.graceUntil,
        currentPeriodStart: plan.patch.currentPeriodStart,
        currentPeriodEnd: plan.patch.currentPeriodEnd,
        canceledAt: plan.patch.canceledAt,
        cancelAtPeriodEnd: plan.patch.cancelAtPeriodEnd,
        providerSubscriptionRef: plan.patch.providerSubscriptionRef,
      },
      accessMode: plan.accessMode,
      clearDunningNotices: plan.clearDunningNotices,
    };
    const updated = await applyDecision(tx, row, decision, {
      source: "admin",
      reason: eventReason(input.reason),
      actor: auditActor(actor),
      ip: actor.ip,
      extra: {
        ...(plan.patch.trialEndsAt ? { trialEndsAt: plan.patch.trialEndsAt } : {}),
        ...(plan.patch.provider === null ? { provider: null } : {}),
      },
    });

    await applySideEffects(tx, row, plan, { now, graceDays });
    // Carência de assinatura do provedor é regra nossa: grava aqui, mas o modo é dela.
    await auditEdit(tx, row, plan, actor, plan.provider ? "provider" : "manual");

    return reload(tx, row.id, updated);
  });
}

/** Avisos de trial, `paidThrough` e o fim do trial no tenant. */
async function applySideEffects(
  tx: Tx,
  row: SubscriptionRow,
  plan: AdminEditPlan,
  { now, graceDays }: { now: Date; graceDays: number },
) {
  if (plan.trialNotices === "reset") {
    await tx
      .update(subscription)
      .set({ metadata: sql`${subscription.metadata} - 'trialNotices'` })
      .where(eq(subscription.id, row.id));
  }

  if (plan.trialNotices === "reopen" && plan.patch.trialEndsAt) {
    const kept = keptTrialNotices(row.metadata.trialNotices, {
      now,
      trialEndsAt: plan.patch.trialEndsAt,
      graceDays,
    });
    await tx
      .update(subscription)
      .set({
        metadata: sql`jsonb_set(${subscription.metadata}, '{trialNotices}', ${JSON.stringify(kept)}::jsonb, true)`,
      })
      .where(eq(subscription.id, row.id));
  }

  if (plan.paidThrough) {
    await tx
      .update(subscription)
      .set({
        metadata: sql`jsonb_set(${subscription.metadata}, '{paidThrough}', to_jsonb(${plan.paidThrough.toISOString()}::text), true)`,
      })
      .where(eq(subscription.id, row.id));
  }

  if (plan.organizationTrialEndsAt) {
    await tx
      .update(organization)
      .set({ trialEndsAt: plan.organizationTrialEndsAt })
      .where(eq(organization.id, row.tenantId));
  }
}

function auditEdit(
  tx: Tx,
  row: SubscriptionRow,
  plan: AdminEditPlan,
  actor: Actor,
  mode: "manual" | "provider",
) {
  // Só enums e nomes de campos: o motivo (texto livre) fica no `subscription_event`.
  return auditInTransaction(tx, "admin.subscription_updated", {
    actor: auditActor(actor),
    tenantId: row.tenantId,
    ip: actor.ip,
    target: { type: "subscription", id: row.id },
    metadata: { from: plan.from, to: plan.to, fields: plan.fields.join(","), mode },
  });
}

async function reload(tx: Tx, id: string, fallback: SubscriptionRow) {
  const [row] = await tx.select().from(subscription).where(eq(subscription.id, id));
  return row ?? fallback;
}

/** Falha do provedor: nada muda aqui. O erro real fica no log, sem dado pessoal. */
async function callProvider<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    logError("Falha no provedor ao editar assinatura", error);
    throw new TenantRuleError(
      409,
      "PROVIDER_UPDATE_FAILED",
      "O provedor de pagamento recusou a mudança. Nada foi alterado.",
    );
  }
}

/**
 * Assinatura viva no provedor: ele é a fonte da verdade. A mudança vai primeiro a ele (fora
 * da transação); só depois de aceita grava aqui. Datas: a resposta de
 * `updateSubscriptionSchedule` entra pela reconciliação. Pausa e retomada: os métodos que o
 * owner já usa, com a mesma transição.
 */
async function editWithProvider(
  row: SubscriptionRow,
  plan: AdminEditPlan,
  reason: string,
  actor: Actor,
  now: Date,
) {
  const provider = row.provider ? getProvider(row.provider) : null;
  const ref = row.providerSubscriptionRef;
  const action = plan.provider;
  if (!provider || !ref || !action) throw REFUSED.unsupported;

  if (action.kind === "schedule") {
    const schedule = provider.updateSubscriptionSchedule;
    if (!schedule) throw REFUSED.unsupported;

    const remote = await callProvider(() =>
      schedule(platformContext(), ref, {
        trialEnd: action.trialEnd,
        nextBillingAt: action.nextBillingAt,
      }),
    );

    let saved = null as SubscriptionRow | null;
    const result = await applyRemoteSubscription(
      { id: row.id, provider: provider.id, providerSubscriptionRef: ref },
      remote,
      now,
      {
        source: "admin",
        actor: auditActor(actor),
        expected: true,
        eventReason: eventReason(reason),
        onApplied: async (tx, current, applied) => {
          // O status vem do provedor; o fim do trial nativo também.
          if (current.status === "trialing" && remote.trialEnd) {
            await tx
              .update(subscription)
              .set({ trialEndsAt: remote.trialEnd })
              .where(eq(subscription.id, current.id));
            await tx
              .update(organization)
              .set({ trialEndsAt: remote.trialEnd })
              .where(eq(organization.id, current.tenantId));
          }
          // Pausada: a data nova é até quando está pago. Sem isso, retomar cobraria antes.
          if (current.status === "paused" && remote.currentPeriodEnd) {
            await tx
              .update(subscription)
              .set({
                metadata: sql`jsonb_set(${subscription.metadata}, '{paidThrough}', to_jsonb(${remote.currentPeriodEnd.toISOString()}::text), true)`,
              })
              .where(eq(subscription.id, current.id));
          }
          // Mesmo sem diferença a registrar, a edição fica no histórico com o motivo.
          if (!applied) {
            await recordSubscriptionEvent(tx, {
              tenantId: current.tenantId,
              subscriptionId: current.id,
              from: current.status,
              to: current.status,
              reason: eventReason(reason),
              source: "admin",
            });
          }
          await auditEdit(tx, current, plan, actor, "provider");
          saved = await reload(tx, current.id, current);
        },
      },
    );

    // A referência mudou enquanto o provedor respondia: a mudança valeu lá, e o webhook e a
    // reconciliação trazem o resto. Quem editou precisa saber que não foi "nada mudou".
    if (result.skipped || !saved) {
      throw new TenantRuleError(
        409,
        "SUBSCRIPTION_CHANGED",
        "O provedor aceitou, mas a assinatura mudou aqui no meio. Recarregue: o webhook acerta o estado.",
      );
    }

    return saved;
  }

  if (action.kind === "pause") {
    const pause = provider.pauseSubscription;
    if (!pause || !provider.capabilities.pause) throw REFUSED.unsupported;

    await callProvider(() => pause(platformContext(), ref));

    return applyProviderEvent(row, plan, { type: "pause.requested", supported: true }, {
      reason,
      actor,
      now,
    });
  }

  if (action.kind === "resume") {
    const resume: PaymentProvider["resumeSubscription"] = provider.resumeSubscription;
    if (!resume) throw REFUSED.unsupported;

    await callProvider(() =>
      resume(platformContext(), ref, { chargeNow: action.chargeNow }),
    );

    return applyProviderEvent(row, plan, { type: "resume.requested" }, { reason, actor, now });
  }

  throw REFUSED.unsupported;
}

async function applyProviderEvent(
  loaded: SubscriptionRow,
  plan: AdminEditPlan,
  event: BillingEvent,
  { reason, actor, now }: { reason: string; actor: Actor; now: Date },
) {
  return withPlatformScope("admin: edita assinatura no provedor", async (tx) => {
    const row = await lockSubscription(tx, loaded.id);
    if (!row) throw notFound("Assinatura não encontrada.");

    const decision = transition(snapshotOf(row), event, now);
    // Já aplicada (o webhook chegou antes): o provedor confirmou; o motivo fica no histórico.
    const updated =
      decision.outcome === "applied"
        ? await applyDecision(tx, row, decision, {
            source: "admin",
            reason: eventReason(reason),
            actor: auditActor(actor),
            ip: actor.ip,
          })
        : row;
    if (decision.outcome !== "applied") {
      await recordSubscriptionEvent(tx, {
        tenantId: row.tenantId,
        subscriptionId: row.id,
        from: row.status,
        to: row.status,
        reason: eventReason(reason),
        source: "admin",
      });
    }

    await auditEdit(tx, row, plan, actor, "provider");

    return updated;
  });
}
