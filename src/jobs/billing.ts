import { and, desc, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { logError } from "@/api/log";
import { withPlatformScope, withTenant } from "@/db/rls";
import { organization, subscription } from "@/db/schema";
import { auditInTransaction } from "@/lib/audit";
import { appLink } from "@/lib/auth/links";
import {
  applyDecision,
  lockSubscription,
  snapshotOf,
} from "@/lib/billing/apply";
import { dueDunningNotice, type DunningNotice } from "@/lib/billing/dunning";
import { requeueStuckEvents } from "@/lib/billing/inbox";
import { latestUnpaidInvoice } from "@/lib/billing/invoices";
import { applyManualDue, dueManualSubscriptions } from "@/lib/billing/manual";
import { claimNotice, releaseNotice, reserveNotice } from "@/lib/billing/notices";
import { listTenantOwners, notifyOwners } from "@/lib/billing/notify";
import { type ReconcileTarget, syncSubscription } from "@/lib/billing/reconcile";
import { loadSettings } from "@/lib/billing/settings";
import { transition } from "@/lib/billing/state-machine";
import { findFreePlanId } from "@/lib/billing/subscription";
import { DAY_MS, dueTrialNotice, type TrialNotice } from "@/lib/billing/trial";
import { sendEmail } from "@/lib/email/send";
import { paymentFailedTemplate } from "@/lib/email/templates/payment-failed";
import { trialEndingTemplate } from "@/lib/email/templates/trial-ending";
import { trialExpiredTemplate } from "@/lib/email/templates/trial-expired";

/** Janela em que o primeiro aviso (T-3) já pode estar devido. */
const LOOKAHEAD_DAYS = 3;

export type TrialJobResult = {
  expired: number;
  notices: Record<TrialNotice, number>;
};

type Candidate = {
  subscriptionId: string;
  tenantId: string;
  tenantName: string;
  trialEndsAt: Date;
};

async function sendNotice(candidate: Candidate, notice: TrialNotice) {
  const owners = await listTenantOwners(candidate.tenantId);
  const url = appLink("/app/assinatura");

  for (const owner of owners) {
    const base = { name: owner.name, tenantName: candidate.tenantName, url };
    const content =
      notice === "expired"
        ? trialExpiredTemplate(base)
        : trialEndingTemplate({
            ...base,
            daysLeft: notice === "t3" ? 3 : notice === "t1" ? 1 : 0,
            endsAt: candidate.trialEndsAt,
          });

    await sendEmail({
      to: owner.email,
      ...content,
      tags: {
        template: notice === "expired" ? "trial-expired" : "trial-ending",
      },
    });
  }
}

/**
 * Passa o trial vencido para `expired`, o tenant para `read_only` e avisa, tudo na mesma
 * transação: depois de `expired` a assinatura sai da lista do job, então um aviso que
 * falhasse fora daqui não voltaria nunca. Se o envio falha, a transição volta junto e a
 * próxima tentativa refaz os dois. `null`: o trial não estava mais para expirar.
 */
async function expireTrial(candidate: Candidate, now: Date) {
  return withTenant(candidate.tenantId, async (tx) => {
    const row = await lockSubscription(tx, candidate.subscriptionId);
    if (!row) return null;

    const decision = transition(snapshotOf(row), { type: "trial.expired" }, now);
    if (decision.outcome === "ignored") return null;

    await applyDecision(tx, row, decision, { source: "job" });
    await auditInTransaction(tx, "billing.trial_expired", {
      actor: { type: "system", id: null },
      tenantId: candidate.tenantId,
      target: { type: "subscription", id: candidate.subscriptionId },
    });

    const notified = await reserveNotice(
      tx,
      candidate.subscriptionId,
      "trialNotices",
      "expired",
      now,
    );
    if (notified) await sendNotice(candidate, "expired");

    return { notified };
  });
}

/**
 * `billing.trial` (cron diário). Para cada trial em curso: avisa em T-3, T-1 e T0 e,
 * passada a carência (`grace_days`), expira para `read_only` e avisa. Cada aviso é
 * marcado em `subscription.metadata` e sai uma vez só: rodar duas vezes não repete
 * e-mail. Um tenant com falha não impede os outros; o erro sobe no fim para o pg-boss
 * tentar de novo.
 */
export async function runBillingTrial(
  now = new Date(),
  /** Restringe a execução a estes tenants (testes e reprocessamento pontual). */
  options: { tenantIds?: string[] } = {},
): Promise<TrialJobResult> {
  const { graceDays } = await loadSettings();
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS);

  const rows = await withPlatformScope("billing.trial: lista trials", (tx) =>
    tx
      .select({
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        tenantName: organization.name,
        trialEndsAt: subscription.trialEndsAt,
      })
      .from(subscription)
      .innerJoin(organization, eq(subscription.tenantId, organization.id))
      .where(
        and(
          eq(subscription.status, "trialing"),
          isNotNull(subscription.trialEndsAt),
          lte(subscription.trialEndsAt, horizon),
          // Trial nativo: quem cobra e encerra é o provedor, com `invoice.paid` ou falha.
          isNull(subscription.providerSubscriptionRef),
          eq(organization.status, "active"),
          options.tenantIds
            ? inArray(subscription.tenantId, options.tenantIds)
            : undefined,
        ),
      ),
  );

  const candidates = rows.flatMap(({ trialEndsAt, ...rest }) =>
    trialEndsAt ? [{ ...rest, trialEndsAt }] : [],
  );

  const result: TrialJobResult = {
    expired: 0,
    notices: { t3: 0, t1: 0, t0: 0, expired: 0 },
  };
  const failures: unknown[] = [];

  for (const candidate of candidates) {
    const notice = dueTrialNotice({
      now,
      trialEndsAt: candidate.trialEndsAt,
      graceDays,
    });
    if (!notice) continue;

    try {
      if (notice === "expired") {
        const expired = await expireTrial(candidate, now);

        if (expired) {
          result.expired += 1;
          if (expired.notified) result.notices.expired += 1;
        }
        continue;
      }

      if (!(await claimNotice(candidate, "trialNotices", notice, now))) continue;

      try {
        await sendNotice(candidate, notice);
        result.notices[notice] += 1;
      } catch (error) {
        await releaseNotice(candidate, "trialNotices", notice);
        throw error;
      }
    } catch (error) {
      logError("Falha ao processar trial", error);
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new Error(`billing.trial: ${failures.length} tenant(s) com falha`);
  }

  return result;
}

export async function handleBillingTrial() {
  await runBillingTrial();
}

type BillingJobOptions = {
  /** Restringe a execução a estes tenants (testes e reprocessamento pontual). */
  tenantIds?: string[];
};

export type DunningJobResult = {
  unpaid: number;
  notices: Record<DunningNotice, number>;
};

type DunningCandidate = {
  subscriptionId: string;
  tenantId: string;
  graceUntil: Date;
};

/** `past_due` vencido vira `unpaid` e o tenant, `read_only`. */
async function closeGrace(candidate: DunningCandidate, now: Date) {
  return withTenant(candidate.tenantId, async (tx) => {
    const row = await lockSubscription(tx, candidate.subscriptionId);
    if (!row) return false;

    const decision = transition(snapshotOf(row), { type: "dunning.expired" }, now);
    if (decision.outcome === "ignored") return false;

    await applyDecision(tx, row, decision, {
      source: "job",
      actor: { type: "system", id: null },
    });

    return true;
  });
}

async function sendDunningNotice(
  candidate: DunningCandidate,
  notice: DunningNotice,
) {
  const unpaid = await withTenant(candidate.tenantId, (tx) =>
    latestUnpaidInvoice(tx, candidate.subscriptionId),
  );

  await notifyOwners(candidate.tenantId, "payment-failed", (owner) =>
    paymentFailedTemplate({
      ...owner,
      amountCents: unpaid?.amountCents ?? 0,
      currency: unpaid?.currency,
      graceEndsAt: notice === "unpaid" ? undefined : candidate.graceUntil,
    }),
  );
}

/**
 * `billing.dunning` (cron diário). Avisa em T-3 e T0 da carência e, vencida, passa a
 * `unpaid` + `read_only`. Mesma idempotência de `billing.trial`, em
 * `subscription.metadata.dunningNotices`, limpa quando o pagamento volta.
 */
export async function runBillingDunning(
  now = new Date(),
  options: BillingJobOptions = {},
): Promise<DunningJobResult> {
  const rows = await withPlatformScope("billing.dunning: lista carências", (tx) =>
    tx
      .select({
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        graceUntil: subscription.graceUntil,
      })
      .from(subscription)
      .innerJoin(organization, eq(subscription.tenantId, organization.id))
      .where(
        and(
          eq(subscription.status, "past_due"),
          isNotNull(subscription.graceUntil),
          eq(organization.status, "active"),
          options.tenantIds
            ? inArray(subscription.tenantId, options.tenantIds)
            : undefined,
        ),
      ),
  );

  const result: DunningJobResult = {
    unpaid: 0,
    notices: { t3: 0, t0: 0, unpaid: 0 },
  };
  const failures: unknown[] = [];

  for (const { graceUntil, ...rest } of rows) {
    if (!graceUntil) continue;

    const candidate = { ...rest, graceUntil };
    const notice = dueDunningNotice({ now, graceUntil });
    if (!notice) continue;

    try {
      if (notice === "unpaid" && (await closeGrace(candidate, now))) {
        result.unpaid += 1;
      }

      if (!(await claimNotice(candidate, "dunningNotices", notice, now))) continue;

      try {
        await sendDunningNotice(candidate, notice);
        result.notices[notice] += 1;
      } catch (error) {
        await releaseNotice(candidate, "dunningNotices", notice);
        throw error;
      }
    } catch (error) {
      logError("Falha ao processar carência", error);
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new Error(`billing.dunning: ${failures.length} tenant(s) com falha`);
  }

  return result;
}

export async function handleBillingDunning() {
  await runBillingDunning();
}

export type PeriodEndJobResult = {
  canceled: number;
  downgraded: number;
  /** Assinaturas manuais que venceram sem pagamento e foram a `past_due`. */
  manualDue: number;
};

/**
 * `billing.period_end` (cron horário). Encerra cancelamentos e aplica downgrades cujo
 * `current_period_end` já passou. O provedor costuma avisar antes, por webhook: a
 * transição repetida é ignorada, e este job cobre o aviso que não chegou. Depois, vence as
 * assinaturas manuais (`runManualDue`).
 */
export async function runBillingPeriodEnd(
  now = new Date(),
  options: BillingJobOptions = {},
): Promise<PeriodEndJobResult> {
  const freePlanId = await findFreePlanId();
  const rows = await withPlatformScope("billing.period_end: lista", (tx) =>
    tx
      .select({ id: subscription.id, tenantId: subscription.tenantId })
      .from(subscription)
      .where(
        and(
          lte(subscription.currentPeriodEnd, now),
          or(
            eq(subscription.cancelAtPeriodEnd, true),
            isNotNull(subscription.pendingPlanId),
          ),
          inArray(subscription.status, ["active", "past_due", "paused", "trialing"]),
          options.tenantIds
            ? inArray(subscription.tenantId, options.tenantIds)
            : undefined,
        ),
      ),
  );

  const result: PeriodEndJobResult = { canceled: 0, downgraded: 0, manualDue: 0 };
  const failures: unknown[] = [];

  for (const { id, tenantId } of rows) {
    try {
      await withTenant(tenantId, async (tx) => {
        const row = await lockSubscription(tx, id);
        if (!row) return;

        const decision = transition(
          snapshotOf(row),
          row.cancelAtPeriodEnd
            ? { type: "period.ended", freePlanId }
            : { type: "downgrade.due" },
          now,
        );
        if (decision.outcome === "ignored") return;

        await applyDecision(tx, row, decision, {
          source: "job",
          actor: { type: "system", id: null },
        });
        if (row.cancelAtPeriodEnd) result.canceled += 1;
        else result.downgraded += 1;
      });
    } catch (error) {
      logError("Falha ao encerrar período", error);
      failures.push(error);
    }
  }

  // Depois do downgrade: a fatura do período novo sai com o preço do plano novo.
  result.manualDue = await runManualDue(now, options, failures);

  if (failures.length > 0) {
    throw new Error(`billing.period_end: ${failures.length} tenant(s) com falha`);
  }

  return result;
}

/**
 * Cobrança manual: período vencido sem pagamento abre a fatura do período seguinte e passa a
 * `past_due`, com a carência contada do vencimento. Daí em diante é o `billing.dunning` (avisos
 * T-3/T0 e `unpaid` + `read_only`). O admin registra o pagamento em `/admin/tenants/:id`.
 */
async function runManualDue(
  now: Date,
  options: BillingJobOptions,
  failures: unknown[],
) {
  const { graceDays } = await loadSettings();
  const rows = await withPlatformScope("billing.period_end: vencimentos manuais", (tx) =>
    dueManualSubscriptions(tx, now, options.tenantIds),
  );
  let due = 0;

  for (const { id, tenantId } of rows) {
    try {
      await withTenant(tenantId, async (tx) => {
        const row = await lockSubscription(tx, id);
        if (!row) return;

        const outcome = await applyManualDue(tx, row, { graceDays, now });
        if (!outcome.applied) return;

        due += 1;
        if (outcome.missingPrice) {
          logError(
            "Assinatura manual venceu sem preço manual no plano",
            new Error(`subscription ${id}`),
          );
        }
      });
    } catch (error) {
      logError("Falha ao vencer assinatura manual", error);
      failures.push(error);
    }
  }

  return due;
}

export async function handleBillingPeriodEnd() {
  await runBillingPeriodEnd();
}

export type ReconcileJobResult = {
  checked: number;
  diverged: number;
  requeuedEvents: number;
};

/**
 * `billing.reconcile` (cron diário). Compara cada assinatura viva com o provedor; a
 * divergência é corrigida com `subscription_event` de `source = job` e fica em alerta no
 * `/admin`. Falha de um provedor não impede os demais. Devolve à fila os eventos parados.
 */
export async function runBillingReconcile(
  now = new Date(),
  options: BillingJobOptions = {},
): Promise<ReconcileJobResult> {
  const rows = await withPlatformScope("billing.reconcile: lista", (tx) =>
    tx
      .select({
        id: subscription.id,
        tenantId: subscription.tenantId,
        provider: subscription.provider,
        providerSubscriptionRef: subscription.providerSubscriptionRef,
      })
      .from(subscription)
      .where(
        and(
          inArray(subscription.status, ["trialing", "active", "past_due", "paused"]),
          isNotNull(subscription.provider),
          isNotNull(subscription.providerSubscriptionRef),
          options.tenantIds
            ? inArray(subscription.tenantId, options.tenantIds)
            : undefined,
        ),
      )
      .orderBy(desc(subscription.updatedAt)),
  );

  const result: ReconcileJobResult = { checked: 0, diverged: 0, requeuedEvents: 0 };
  const failures: unknown[] = [];

  for (const row of rows) {
    try {
      const synced = await syncSubscription(row as ReconcileTarget, now, {
        source: "job",
      });
      if (synced.skipped) continue;

      result.checked += 1;
      if (synced.diverged) result.diverged += 1;
    } catch (error) {
      logError("Falha ao reconciliar assinatura", error);
      failures.push(error);
    }
  }

  if (!options.tenantIds) result.requeuedEvents = await requeueStuckEvents(now);

  if (failures.length > 0) {
    throw new Error(`billing.reconcile: ${failures.length} assinatura(s) com falha`);
  }

  return result;
}

export async function handleBillingReconcile() {
  await runBillingReconcile();
}
