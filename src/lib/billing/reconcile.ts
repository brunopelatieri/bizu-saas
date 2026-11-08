import { type Tx, withPlatformScope } from "@/db/rls";
import type { SubscriptionEventSource } from "@/db/schema/billing";
import type { AuditEntry } from "@/lib/audit";
import {
  applyDecision,
  findPriceByRef,
  lockSubscription,
  planDivergence,
  type SubscriptionRow,
  setAlert,
  snapshotOf,
} from "@/lib/billing/apply";
import { loadSettings } from "@/lib/billing/settings";
import { type AppliedDecision, transition } from "@/lib/billing/state-machine";
import { findFreePlanId } from "@/lib/billing/subscription";
import { getProvider, platformContext } from "@/lib/payments/registry";
import type { RemoteSubscription } from "@/lib/payments/types";

export type ReconcileTarget = {
  id: string;
  provider: string;
  providerSubscriptionRef: string;
};

type SyncOptions = {
  source: SubscriptionEventSource;
  actor?: AuditEntry["actor"];
};

type ApplyRemoteOptions = SyncOptions & {
  /**
   * Divergência é o padrão da reconciliação. A edição do admin (`admin-edit.ts`) pede a
   * mudança ao provedor e aplica a resposta: o que mudou foi pedido, não é alerta.
   */
  expected?: boolean;
  /** Motivo do `subscription_event` no lugar do da máquina de estados. */
  eventReason?: string;
  /** Roda na mesma transação, com a linha travada, quando a resposta vale para ela. */
  onApplied?: (tx: Tx, row: SubscriptionRow, applied: boolean) => Promise<void>;
};

/**
 * Compara a assinatura com o provedor e corrige o que divergiu, deixando alerta. É o
 * mesmo caminho do job diário e de "Buscar do provedor" em `/admin`. `skipped`: o módulo
 * do provedor não está ativo aqui.
 */
export async function syncSubscription(
  target: ReconcileTarget,
  now: Date,
  options: SyncOptions,
) {
  const provider = getProvider(target.provider);
  if (!provider) return { skipped: true, diverged: false };

  // Rede fora da transação: a linha não fica travada esperando o provedor.
  const remote = await provider.fetchSubscription(
    platformContext(),
    target.providerSubscriptionRef,
  );

  // A resposta de "Buscar do provedor" segue a mesma: `applied` é da edição do admin.
  const { skipped, diverged } = await applyRemoteSubscription(target, remote, now, options);
  return { skipped, diverged };
}

/**
 * Aplica o que o provedor diz da assinatura (`fetchSubscription` ou a resposta de uma
 * escrita, como `updateSubscriptionSchedule`). `applied`: gravou algo na assinatura.
 */
export async function applyRemoteSubscription(
  target: ReconcileTarget,
  remote: RemoteSubscription,
  now: Date,
  options: ApplyRemoteOptions,
) {
  const { graceDays } = await loadSettings();
  const freePlanId = await findFreePlanId();

  return withPlatformScope("billing.reconcile", async (tx) => {
    const row = await lockSubscription(tx, target.id);

    // A assinatura trocou de referência enquanto a resposta vinha: o dado é velho.
    if (!row || row.providerSubscriptionRef !== target.providerSubscriptionRef) {
      return { skipped: true, diverged: false, applied: false };
    }

    const decision = transition(
      snapshotOf(row),
      {
        type: "provider.synced",
        status: remote.status,
        cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
        periodStart: remote.currentPeriodStart,
        periodEnd: remote.currentPeriodEnd,
        graceDays,
        freePlanId,
      },
      now,
    );

    const detail = `local=${row.status} remoto=${remote.status}`;
    const plan = planDivergence(
      row,
      await findPriceByRef(tx, row.provider, remote.priceRef),
    );
    const noChange = decision.outcome === "ignored" && decision.reason === "no_change";

    if (decision.outcome === "ignored" && !(noChange && plan)) {
      // Encerrada aqui e viva lá não se corrige sozinha: precisa de alguém olhando.
      if (decision.reason === "subscription_ended" && remote.status !== "canceled") {
        await setAlert(tx, row, { kind: "divergence", at: now.toISOString(), detail });
        return { skipped: false, diverged: true, applied: false };
      }

      // Conferido e igual: o alerta antigo perde o sentido.
      if (row.metadata.alert?.kind === "divergence") await setAlert(tx, row, null);
      await options.onApplied?.(tx, row, false);

      return { skipped: false, diverged: false, applied: false };
    }

    const applied: AppliedDecision =
      decision.outcome === "applied"
        ? decision
        : {
            outcome: "applied",
            status: row.status,
            reason: "reconciled_plan",
            patch: {},
          };
    const updated = await applyDecision(tx, row, applied, {
      source: options.source,
      reason: options.eventReason,
      actor: options.actor ?? { type: "system", id: null },
      // Encerrada ou migrada para o gratuito, o plano do provedor não vale mais.
      extra:
        applied.patch.planId || applied.status === "canceled"
          ? undefined
          : (plan ?? undefined),
    });
    // Só o pedido mudou (datas): sem alerta. Status diferente é algo que o provedor sabia e
    // aqui não: continua divergência, mesmo na edição do admin.
    if (options.expected && updated.status === row.status) {
      if (row.metadata.alert?.kind === "divergence") await setAlert(tx, updated, null);
      await options.onApplied?.(tx, updated, true);
      return { skipped: false, diverged: false, applied: true };
    }

    await setAlert(tx, updated, {
      kind: "divergence",
      at: now.toISOString(),
      detail: plan ? `${detail} plano` : detail,
    });
    await options.onApplied?.(tx, updated, true);

    return { skipped: false, diverged: true, applied: true };
  });
}
