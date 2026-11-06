import { withPlatformScope } from "@/db/rls";
import type { SubscriptionEventSource } from "@/db/schema/billing";
import type { AuditEntry } from "@/lib/audit";
import {
  applyDecision,
  findPriceByRef,
  lockSubscription,
  planDivergence,
  setAlert,
  snapshotOf,
} from "@/lib/billing/apply";
import { loadSettings } from "@/lib/billing/settings";
import { type AppliedDecision, transition } from "@/lib/billing/state-machine";
import { findFreePlanId } from "@/lib/billing/subscription";
import { getProvider, platformContext } from "@/lib/payments/registry";

export type ReconcileTarget = {
  id: string;
  provider: string;
  providerSubscriptionRef: string;
};

type SyncOptions = {
  source: SubscriptionEventSource;
  actor?: AuditEntry["actor"];
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
  const { graceDays } = await loadSettings();
  const freePlanId = await findFreePlanId();

  return withPlatformScope("billing.reconcile", async (tx) => {
    const row = await lockSubscription(tx, target.id);

    // A assinatura trocou de referência enquanto a resposta vinha: o dado é velho.
    if (!row || row.providerSubscriptionRef !== target.providerSubscriptionRef) {
      return { skipped: true, diverged: false };
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
        return { skipped: false, diverged: true };
      }

      // Conferido e igual: o alerta antigo perde o sentido.
      if (row.metadata.alert?.kind === "divergence") await setAlert(tx, row, null);

      return { skipped: false, diverged: false };
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
      actor: options.actor ?? { type: "system", id: null },
      // Encerrada ou migrada para o gratuito, o plano do provedor não vale mais.
      extra:
        applied.patch.planId || applied.status === "canceled"
          ? undefined
          : (plan ?? undefined),
    });
    await setAlert(tx, updated, {
      kind: "divergence",
      at: now.toISOString(),
      detail: plan ? `${detail} plano` : detail,
    });

    return { skipped: false, diverged: true };
  });
}
