import type { SubscriptionStatus } from "@/db/schema/billing";
import { DAY_MS } from "@/lib/billing/trial";
import type { InvoiceStatus } from "@/lib/billing/constants";
import type { RemoteSubscriptionStatus } from "@/lib/payments/types";

/**
 * Máquina de estados da assinatura (`spec-billing.md`). Função pura: recebe o estado
 * atual e um evento e devolve o que deve mudar. Quem grava é `applyDecision`.
 */

export type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
  pendingPlanId: string | null;
  providerSubscriptionRef: string | null;
  /** Maior `occurred_at` já aplicado de um evento do provedor. */
  lastProviderEventAt: Date | null;
};

type Period = { periodStart?: Date; periodEnd?: Date };

export type BillingEvent =
  // Do provedor. `occurredAt` ordena: evento mais antigo que o último aplicado é ignorado.
  | ({
      type: "invoice.paid";
      occurredAt?: Date;
      subscriptionRef?: string;
    } & Period)
  | { type: "invoice.payment_failed"; occurredAt?: Date; graceDays: number }
  | ({
      type: "subscription.updated";
      occurredAt?: Date;
      subscriptionRef: string;
      status: RemoteSubscriptionStatus;
      cancelAtPeriodEnd?: boolean;
      graceDays: number;
      freePlanId: string | null;
    } & Period)
  | {
      type: "subscription.canceled";
      occurredAt?: Date;
      subscriptionRef: string;
      freePlanId: string | null;
    }
  // Dos jobs.
  | { type: "trial.expired" }
  | { type: "dunning.expired" }
  | { type: "period.ended"; freePlanId: string | null }
  | { type: "downgrade.due" }
  // Do owner e do admin.
  | { type: "cancel.requested" }
  | { type: "resume.requested" }
  | { type: "pause.requested"; supported: boolean }
  | { type: "admin.canceled" }
  // Reconciliação: o provedor é a referência do que aconteceu com a cobrança.
  | ({
      type: "provider.synced";
      status: RemoteSubscriptionStatus;
      cancelAtPeriodEnd: boolean;
      graceDays: number;
      freePlanId: string | null;
    } & Period);

export type SubscriptionPatch = {
  graceUntil?: Date | null;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  providerSubscriptionRef?: string | null;
  /** Fim do período com downgrade agendado, ou migração para o plano gratuito. */
  planId?: string;
  /** Plano gratuito não tem preço; o downgrade usa o preço agendado. */
  planPriceId?: string | null;
  pendingPlanId?: null;
};

export type AppliedDecision = {
  outcome: "applied";
  status: SubscriptionStatus;
  reason: string;
  patch: SubscriptionPatch;
  accessMode?: "full" | "read_only";
  /** Aplicar o preço guardado em `metadata.pendingPlanPriceId`. */
  applyPendingPrice?: boolean;
  /** Ao sair de `past_due`, os avisos voltam a valer para a próxima falha. */
  clearDunningNotices?: boolean;
};

export type Decision = { outcome: "ignored"; reason: string } | AppliedDecision;

const ignored = (reason: string): Decision => ({ outcome: "ignored", reason });

/** Há cobrança viva no provedor? `canceled`, `unpaid` e `expired` só voltam por checkout. */
export function isLiveStatus(status: SubscriptionStatus) {
  return ["active", "trialing", "past_due", "paused"].includes(status);
}

/**
 * Pode iniciar um checkout? Só sem cobrança viva no provedor: quem já paga troca de
 * plano, quem está em `past_due` paga a fatura aberta.
 */
export function canStartCheckout(input: {
  status: SubscriptionStatus;
  providerSubscriptionRef: string | null;
  planIsFree: boolean;
}) {
  switch (input.status) {
    case "expired":
    case "canceled":
    case "unpaid":
      return true;
    case "active":
      return input.planIsFree;
    case "trialing":
      return input.providerSubscriptionRef === null;
    case "past_due":
    case "paused":
      return false;
  }
}

const sameTime = (a: Date | null, b: Date) => a?.getTime() === b.getTime();

/**
 * Fatura repetida do provedor não volta o espelho de um estado mais novo: `paid` e
 * `refunded` só andam para a frente. `void` encerra uma fatura que não foi paga.
 */
export function nextInvoiceStatus(
  current: InvoiceStatus,
  incoming: InvoiceStatus,
): InvoiceStatus {
  if (current === "refunded") return current;
  if (current === "paid") return incoming === "refunded" ? incoming : current;
  if (current === "void") return incoming === "paid" ? incoming : current;

  return incoming;
}

/** Só o que mudou no período e, se ele avançou, o downgrade agendado entra em vigor. */
function periodPatch(
  current: SubscriptionSnapshot,
  { periodStart, periodEnd }: Period,
): Pick<AppliedDecision, "patch" | "applyPendingPrice"> {
  const patch: SubscriptionPatch = {};
  if (periodStart && !sameTime(current.currentPeriodStart, periodStart)) {
    patch.currentPeriodStart = periodStart;
  }
  if (periodEnd && !sameTime(current.currentPeriodEnd, periodEnd)) {
    patch.currentPeriodEnd = periodEnd;
  }

  const advanced =
    periodEnd !== undefined &&
    current.currentPeriodEnd !== null &&
    periodEnd.getTime() > current.currentPeriodEnd.getTime();

  if (advanced && current.pendingPlanId) {
    patch.planId = current.pendingPlanId;
    patch.pendingPlanId = null;
    return { patch, applyPendingPrice: true };
  }

  return { patch };
}

/**
 * Fim da assinatura: com plano gratuito o tenant segue nele, senão fica só leitura. Em
 * `canceled` a referência fica: é ela que reconhece uma fatura antiga paga depois.
 */
function endSubscription(
  freePlanId: string | null,
  reason: string,
  now: Date,
): Decision {
  const closed: SubscriptionPatch = {
    cancelAtPeriodEnd: false,
    canceledAt: now,
    graceUntil: null,
    pendingPlanId: null,
  };

  if (freePlanId) {
    return {
      outcome: "applied",
      status: "active",
      reason: `${reason}_to_free`,
      patch: {
        ...closed,
        planId: freePlanId,
        planPriceId: null,
        providerSubscriptionRef: null,
      },
      accessMode: "full",
      clearDunningNotices: true,
    };
  }

  return {
    outcome: "applied",
    status: "canceled",
    reason,
    patch: closed,
    accessMode: "read_only",
    clearDunningNotices: true,
  };
}

function toPastDue(graceDays: number, now: Date): AppliedDecision {
  return {
    outcome: "applied",
    status: "past_due",
    reason: "payment_failed",
    patch: { graceUntil: new Date(now.getTime() + graceDays * DAY_MS) },
  };
}

function toActive(reason: string): AppliedDecision {
  return {
    outcome: "applied",
    status: "active",
    reason,
    patch: { graceUntil: null, canceledAt: null },
    accessMode: "full",
    clearDunningNotices: true,
  };
}

function invoicePaid(
  current: SubscriptionSnapshot,
  event: Extract<BillingEvent, { type: "invoice.paid" }>,
): Decision {
  const known = current.providerSubscriptionRef;
  const sameSubscription =
    event.subscriptionRef !== undefined && event.subscriptionRef === known;
  const otherSubscription =
    known !== null &&
    event.subscriptionRef !== undefined &&
    event.subscriptionRef !== known;

  // Fatura antiga paga depois do cancelamento: não ressuscita a assinatura encerrada.
  if (current.status === "canceled" && sameSubscription) {
    return ignored("late_invoice_after_cancel");
  }

  // Um segundo checkout pago: a assinatura viva não é substituída em silêncio.
  if (
    otherSubscription &&
    ["active", "past_due", "trialing", "paused"].includes(current.status)
  ) {
    return ignored("duplicate_subscription");
  }

  const period = periodPatch(current, event);
  const ref = event.subscriptionRef
    ? { providerSubscriptionRef: event.subscriptionRef }
    : {};

  if (current.status === "active") {
    return {
      outcome: "applied",
      status: "active",
      reason: "renewed",
      patch: { ...period.patch, ...ref },
      applyPendingPrice: period.applyPendingPrice,
    };
  }

  const reactivation = ["unpaid", "expired", "canceled"].includes(current.status);
  const base = toActive(
    current.status === "trialing"
      ? "activated"
      : reactivation
        ? "reactivated"
        : "payment_recovered",
  );

  return {
    ...base,
    patch: {
      ...base.patch,
      ...period.patch,
      ...ref,
      ...(reactivation ? { cancelAtPeriodEnd: false } : {}),
    },
    applyPendingPrice: period.applyPendingPrice,
  };
}

function subscriptionUpdated(
  current: SubscriptionSnapshot,
  event: Extract<BillingEvent, { type: "subscription.updated" }>,
  now: Date,
): Decision {
  // Trial nativo: a assinatura nasce no provedor antes de qualquer pagamento.
  const attachesTrial =
    current.providerSubscriptionRef === null &&
    current.status === "trialing" &&
    event.status === "trialing";

  // Evento de outra assinatura (a substituída numa reativação, por exemplo) não mexe nesta.
  if (current.providerSubscriptionRef !== event.subscriptionRef && !attachesTrial) {
    return ignored("other_subscription");
  }

  // Encerrada aqui: só um pagamento novo reabre (`invoice.paid`).
  if (["canceled", "expired"].includes(current.status)) {
    return ignored("subscription_ended");
  }

  if (event.status === "canceled") {
    return endSubscription(event.freePlanId, "provider_canceled", now);
  }

  const period = periodPatch(current, event);
  const patch: SubscriptionPatch = { ...period.patch };

  if (attachesTrial) patch.providerSubscriptionRef = event.subscriptionRef;

  if (
    event.cancelAtPeriodEnd !== undefined &&
    event.cancelAtPeriodEnd !== current.cancelAtPeriodEnd
  ) {
    patch.cancelAtPeriodEnd = event.cancelAtPeriodEnd;
  }

  if (event.status === "past_due" && current.status === "active") {
    const failed = toPastDue(event.graceDays, now);
    return {
      ...failed,
      patch: { ...patch, ...failed.patch },
      applyPendingPrice: period.applyPendingPrice,
    };
  }

  if (event.status === "paused" && current.status === "active") {
    return {
      outcome: "applied",
      status: "paused",
      reason: "provider_paused",
      patch,
      accessMode: "read_only",
      applyPendingPrice: period.applyPendingPrice,
    };
  }

  if (event.status === "active" && current.status === "paused") {
    const resumed = toActive("provider_resumed");
    return {
      ...resumed,
      patch: { ...resumed.patch, ...patch },
      applyPendingPrice: period.applyPendingPrice,
    };
  }

  // `trialing → active` e `past_due → active` dependem do pagamento, não deste evento.
  if (Object.keys(patch).length === 0) return ignored("no_change");

  return {
    outcome: "applied",
    status: current.status,
    reason: "provider_updated",
    patch,
    applyPendingPrice: period.applyPendingPrice,
  };
}

function providerSynced(
  current: SubscriptionSnapshot,
  event: Extract<BillingEvent, { type: "provider.synced" }>,
  now: Date,
): Decision {
  const period = periodPatch(current, event);
  const flag =
    event.cancelAtPeriodEnd !== current.cancelAtPeriodEnd
      ? { cancelAtPeriodEnd: event.cancelAtPeriodEnd }
      : {};
  const patch: SubscriptionPatch = { ...period.patch, ...flag };
  const remote = event.status;
  const local = current.status;

  // Encerrada aqui e viva lá é decisão de pessoa: fica o alerta, sem reabrir sozinha.
  if (["canceled", "expired"].includes(local)) {
    return ignored("subscription_ended");
  }

  if (remote === "canceled") {
    return endSubscription(event.freePlanId, "provider_canceled", now);
  }

  if (remote === "active" && local !== "active") {
    const synced = toActive("reconciled_active");
    return {
      ...synced,
      patch: { ...synced.patch, ...patch },
      applyPendingPrice: period.applyPendingPrice,
    };
  }

  if ((remote === "past_due" || remote === "unpaid") && local === "active") {
    const failed = toPastDue(event.graceDays, now);
    return {
      ...failed,
      reason: "reconciled_past_due",
      patch: { ...patch, ...failed.patch },
      applyPendingPrice: period.applyPendingPrice,
    };
  }

  if (remote === "paused" && local === "active") {
    return {
      outcome: "applied",
      status: "paused",
      reason: "reconciled_paused",
      patch,
      accessMode: "read_only",
      applyPendingPrice: period.applyPendingPrice,
    };
  }

  if (Object.keys(patch).length === 0) return ignored("no_change");

  return {
    outcome: "applied",
    status: local,
    reason: "reconciled_period",
    patch,
    applyPendingPrice: period.applyPendingPrice,
  };
}

/**
 * Aplica um evento. `ignored` significa: nada a gravar na assinatura (repetido, fora de
 * ordem ou sem sentido no estado atual).
 */
export function transition(
  current: SubscriptionSnapshot,
  event: BillingEvent,
  now: Date,
): Decision {
  if (
    "occurredAt" in event &&
    event.occurredAt &&
    current.lastProviderEventAt &&
    event.occurredAt.getTime() < current.lastProviderEventAt.getTime()
  ) {
    return ignored("out_of_order");
  }

  switch (event.type) {
    case "invoice.paid":
      return invoicePaid(current, event);

    case "invoice.payment_failed":
      if (current.status === "active") return toPastDue(event.graceDays, now);
      // Em trial, só quem já tem assinatura no provedor foi cobrado de verdade.
      if (current.status === "trialing" && current.providerSubscriptionRef) {
        return toPastDue(event.graceDays, now);
      }
      return ignored(
        current.status === "past_due" ? "already_past_due" : "not_applicable",
      );

    case "subscription.updated":
      return subscriptionUpdated(current, event, now);

    case "subscription.canceled":
      if (current.providerSubscriptionRef !== event.subscriptionRef) {
        return ignored("other_subscription");
      }
      return ["canceled", "expired"].includes(current.status)
        ? ignored("already_ended")
        : endSubscription(event.freePlanId, "provider_canceled", now);

    case "trial.expired":
      if (current.status !== "trialing") return ignored("not_trialing");
      return {
        outcome: "applied",
        status: "expired",
        reason: "trial_expired",
        patch: {},
        accessMode: "read_only",
      };

    case "dunning.expired":
      if (current.status !== "past_due") return ignored("not_past_due");
      if (current.graceUntil && current.graceUntil.getTime() > now.getTime()) {
        return ignored("grace_running");
      }
      return {
        outcome: "applied",
        status: "unpaid",
        reason: "grace_expired",
        patch: {},
        accessMode: "read_only",
      };

    case "period.ended":
      if (!current.cancelAtPeriodEnd) return ignored("not_scheduled");
      if (
        current.currentPeriodEnd &&
        current.currentPeriodEnd.getTime() > now.getTime()
      ) {
        return ignored("period_running");
      }
      return ["canceled", "expired"].includes(current.status)
        ? ignored("already_ended")
        : endSubscription(event.freePlanId, "period_end_canceled", now);

    case "downgrade.due":
      if (!current.pendingPlanId) return ignored("not_scheduled");
      if (
        current.currentPeriodEnd &&
        current.currentPeriodEnd.getTime() > now.getTime()
      ) {
        return ignored("period_running");
      }
      return {
        outcome: "applied",
        status: current.status,
        reason: "plan_downgraded",
        patch: { planId: current.pendingPlanId, pendingPlanId: null },
        applyPendingPrice: true,
      };

    case "cancel.requested":
      if (current.cancelAtPeriodEnd) return ignored("already_scheduled");
      if (!isLiveStatus(current.status)) return ignored("not_cancelable");
      return {
        outcome: "applied",
        status: current.status,
        reason: "cancel_scheduled",
        patch: { cancelAtPeriodEnd: true },
      };

    case "resume.requested":
      if (current.status === "paused") {
        const resumed = toActive("resumed");
        return { ...resumed, patch: { ...resumed.patch, cancelAtPeriodEnd: false } };
      }
      if (!current.cancelAtPeriodEnd) return ignored("nothing_to_resume");
      return {
        outcome: "applied",
        status: current.status,
        reason: "cancel_undone",
        patch: { cancelAtPeriodEnd: false },
      };

    case "pause.requested":
      if (!event.supported) return ignored("pause_not_supported");
      if (current.status !== "active") return ignored("not_active");
      // Pausa suspende a cobrança: o provedor anula as faturas. Sem cortar o serviço, seria
      // o plano de graça, e por tempo indeterminado.
      return {
        outcome: "applied",
        status: "paused",
        reason: "paused",
        patch: {},
        accessMode: "read_only",
      };

    case "admin.canceled":
      if (current.status === "canceled") return ignored("already_ended");
      return {
        outcome: "applied",
        status: "canceled",
        reason: "admin_canceled",
        patch: {
          cancelAtPeriodEnd: false,
          canceledAt: now,
          graceUntil: null,
          pendingPlanId: null,
        },
        accessMode: "read_only",
        clearDunningNotices: true,
      };

    case "provider.synced":
      return providerSynced(current, event, now);
  }
}
