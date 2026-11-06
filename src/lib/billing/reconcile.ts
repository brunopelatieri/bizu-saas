import { withPlatformScope } from "@/db/rls";
import type { SubscriptionEventSource } from "@/db/schema/billing";
import type { AuditEntry } from "@/lib/audit";
import {
  applyDecision,
  lockSubscription,
  setAlert,
  snapshotOf,
} from "@/lib/billing/apply";
import { loadSettings } from "@/lib/billing/settings";
import { transition } from "@/lib/billing/state-machine";
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

    if (decision.outcome === "ignored") {
      // Encerrada aqui e viva lá não se corrige sozinha: precisa de alguém olhando.
      if (decision.reason === "subscription_ended" && remote.status !== "canceled") {
        await setAlert(tx, row, {
          kind: "divergence",
          at: now.toISOString(),
          detail: `local=${row.status} remoto=${remote.status}`,
        });
        return { skipped: false, diverged: true };
      }

      // Conferido e igual: o alerta antigo perde o sentido.
      if (row.metadata.alert?.kind === "divergence") await setAlert(tx, row, null);

      return { skipped: false, diverged: false };
    }

    const updated = await applyDecision(tx, row, decision, {
      source: options.source,
      actor: options.actor ?? { type: "system", id: null },
    });
    await setAlert(tx, updated, {
      kind: "divergence",
      at: now.toISOString(),
      detail: `local=${row.status} remoto=${remote.status}`,
    });

    return { skipped: false, diverged: true };
  });
}
