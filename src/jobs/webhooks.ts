import type { Job } from "pg-boss";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { logError } from "@/api/log";
import { type Tx, withPlatformScope } from "@/db/rls";
import { invoice, paymentEvent, planPrice, subscription } from "@/db/schema";
import type { WebhookProcessJob } from "@/jobs/queues";
import { auditInTransaction } from "@/lib/audit";
import {
  applyDecision,
  findPriceByRef,
  lockSubscription,
  planDivergence,
  type PlanTarget,
  setAlert,
  snapshotOf,
  type SubscriptionRow,
  touchProviderClock,
} from "@/lib/billing/apply";
import { type InvoiceChange, safeUrl, upsertInvoice } from "@/lib/billing/invoices";
import { notifyCanceled, notifyOwners } from "@/lib/billing/notify";
import { loadSettings } from "@/lib/billing/settings";
import type { PaymentProviderId } from "@/lib/billing/constants";
import { type AppliedDecision, transition } from "@/lib/billing/state-machine";
import { findFreePlanId } from "@/lib/billing/subscription";
import { sanitizeError } from "@/lib/email/store";
import { invoiceCreatedTemplate } from "@/lib/email/templates/invoice-created";
import { paymentFailedTemplate } from "@/lib/email/templates/payment-failed";
import { paymentReceivedTemplate } from "@/lib/email/templates/payment-received";
import { getProvider, platformContext } from "@/lib/payments/registry";
import type {
  NormalizedEvent,
  PaymentContext,
  PaymentProvider,
  RemoteInvoice,
} from "@/lib/payments/types";

/**
 * `webhook.process`: aplica um `payment_event` já verificado. O efeito de todos os eventos
 * do webhook e a marca em `payment_event` caem na mesma transação, com a assinatura
 * travada: repetir o job depois de uma falha não aplica nada duas vezes. E-mail sai só
 * depois do commit; rede com o provedor, só antes dele.
 */

type Settings = { graceDays: number; freePlanId: string | null };

type Applied = {
  applied: boolean;
  tenantId?: string;
  /** Depois do commit: e-mails e o que mais falar com o mundo. */
  after: Array<() => Promise<unknown>>;
};

const ignoredEvent = (reason: string): NormalizedEvent => ({
  type: "ignored",
  reason,
});

/**
 * "Confiar, mas conferir": quem verifica o webhook só por token não prova o corpo. O
 * evento só vale depois que a API do provedor confirma. Com HMAC/ECDSA, a conferência é a
 * reconciliação diária.
 */
async function confirm(
  provider: PaymentProvider,
  ctx: PaymentContext,
  event: NormalizedEvent,
): Promise<NormalizedEvent> {
  const { webhookSignature } = provider.capabilities;
  if (webhookSignature === "hmac" || webhookSignature === "ecdsa") return event;

  // Só a API responde a quem a fatura pertence: o corpo pode citar uma fatura paga de verdade
  // com os metadados de outro tenant.
  const fromApi = ({ subscriptionRef, customerRef, metadata }: RemoteInvoice) => ({
    subscriptionRef,
    customerRef,
    metadata,
  });

  switch (event.type) {
    case "invoice.paid": {
      const remote = await provider.fetchInvoice(ctx, event.invoiceRef);
      return remote.status === "paid"
        ? { ...event, ...fromApi(remote), amountCents: remote.amountCents }
        : ignoredEvent("not_confirmed");
    }
    case "invoice.payment_failed":
    case "invoice.created": {
      const remote = await provider.fetchInvoice(ctx, event.invoiceRef);
      return { ...event, ...fromApi(remote) };
    }
    case "chargeback.opened": {
      await provider.fetchInvoice(ctx, event.invoiceRef);
      return { ...event, customerRef: undefined, metadata: undefined };
    }
    case "refund.completed": {
      const remote = await provider.fetchInvoice(ctx, event.invoiceRef);
      return remote.status === "refunded"
        ? { ...event, customerRef: undefined, metadata: undefined }
        : ignoredEvent("not_confirmed");
    }
    case "subscription.updated": {
      const remote = await provider.fetchSubscription(ctx, event.subscriptionRef);
      return {
        ...event,
        status: remote.status,
        customerRef: undefined,
        metadata: undefined,
      };
    }
    case "subscription.canceled": {
      const remote = await provider.fetchSubscription(ctx, event.subscriptionRef);
      return remote.status === "canceled"
        ? { ...event, customerRef: undefined, metadata: undefined }
        : ignoredEvent("not_confirmed");
    }
    case "ignored":
      return event;
  }
}

const uuid = z.uuid();

async function findByRef(tx: Tx, provider: PaymentProviderId, ref: string) {
  const [row] = await tx
    .select({ id: subscription.id })
    .from(subscription)
    .where(
      and(
        eq(subscription.provider, provider),
        eq(subscription.providerSubscriptionRef, ref),
      ),
    );

  return row?.id;
}

const invoiceTarget = (row: SubscriptionRow) => ({
  id: row.id,
  tenantId: row.tenantId,
  provider: row.provider ?? "",
});

/**
 * Da referência mais forte à mais fraca. Metadados só valem com o mesmo provedor gravado
 * no checkout: um evento não alcança a assinatura de quem nunca iniciou nada nele.
 */
async function resolveSubscription(
  tx: Tx,
  provider: PaymentProviderId,
  event: NormalizedEvent,
): Promise<SubscriptionRow | null> {
  if (event.type === "ignored") return null;

  const subscriptionRef =
    "subscriptionRef" in event ? event.subscriptionRef : undefined;
  const invoiceRef = "invoiceRef" in event ? event.invoiceRef : undefined;

  if (subscriptionRef) {
    const id = await findByRef(tx, provider, subscriptionRef);
    if (id) return lockSubscription(tx, id);
  }

  const metadataId = uuid.safeParse(event.metadata?.subscriptionId);
  if (metadataId.success) {
    const row = await lockSubscription(tx, metadataId.data);
    if (row?.provider === provider) return row;
  }

  if (invoiceRef) {
    const [known] = await tx
      .select({ subscriptionId: invoice.subscriptionId })
      .from(invoice)
      .where(and(eq(invoice.provider, provider), eq(invoice.providerRef, invoiceRef)));
    if (known) return lockSubscription(tx, known.subscriptionId);
  }

  // Fatura de assinatura desconhecida não é deste cliente, ainda que o cliente seja.
  if (event.customerRef && !subscriptionRef) {
    const [row] = await tx
      .select({ id: subscription.id })
      .from(subscription)
      .where(
        and(
          eq(subscription.provider, provider),
          eq(subscription.providerCustomerRef, event.customerRef),
        ),
      );
    if (row) return lockSubscription(tx, row.id);
  }

  return null;
}

/** O preço escolhido no checkout, se for deste provedor. */
async function findPriceById(
  tx: Tx,
  provider: SubscriptionRow["provider"],
  planPriceId: string | undefined,
): Promise<PlanTarget | null> {
  const id = uuid.safeParse(planPriceId);
  if (!provider || !id.success) return null;

  const [row] = await tx
    .select({ planId: planPrice.planId, planPriceId: planPrice.id })
    .from(planPrice)
    .where(and(eq(planPrice.provider, provider), eq(planPrice.id, id.data)));

  return row ?? null;
}

async function applySubscriptionDecision(
  tx: Tx,
  row: SubscriptionRow,
  decision: AppliedDecision,
  context: {
    paymentEventId: string;
    occurredAt?: Date;
    extra?: PlanTarget | null;
  },
) {
  return applyDecision(tx, row, decision, {
    source: "webhook",
    paymentEventId: context.paymentEventId,
    occurredAt: context.occurredAt,
    actor: { type: "system", id: null },
    extra: context.extra ?? undefined,
  });
}

function paidMail(change: InvoiceChange, paidAt: Date) {
  const { tenantId, amountCents, currency } = change.invoice;

  return () =>
    notifyOwners(tenantId, "payment-received", (owner) =>
      paymentReceivedTemplate({ ...owner, amountCents, currency, paidAt }),
    );
}

async function onInvoicePaid(
  tx: Tx,
  row: SubscriptionRow,
  event: Extract<NormalizedEvent, { type: "invoice.paid" }>,
  paymentEventId: string,
  now: Date,
): Promise<Applied> {
  const change = await upsertInvoice(tx, invoiceTarget(row), event.invoiceRef, {
    amountCents: event.amountCents,
    currency: event.currency,
    status: "paid",
    paymentMethod: event.method,
    paidAt: event.paidAt,
    hostedUrl: safeUrl(event.hostedUrl),
  });
  if (!change) return { applied: false, after: [] };

  const newlyPaid = change.previous !== "paid" && change.previous !== "refunded";
  const after: Applied["after"] = newlyPaid ? [paidMail(change, event.paidAt)] : [];
  const decision = transition(
    snapshotOf(row),
    {
      type: "invoice.paid",
      occurredAt: event.occurredAt,
      subscriptionRef: event.subscriptionRef,
      periodStart: event.periodStart,
      periodEnd: event.periodEnd,
    },
    now,
  );

  if (decision.outcome === "ignored") {
    if (decision.reason === "duplicate_subscription") {
      await setAlert(tx, row, {
        kind: "duplicate_subscription",
        at: now.toISOString(),
        detail: `fatura=${change.invoice.id}`,
      });
    }
    if (decision.reason !== "out_of_order") {
      await touchProviderClock(tx, row, event.occurredAt);
    }
    return { applied: newlyPaid, tenantId: row.tenantId, after };
  }

  // Renovação sem novidade: a fatura já estava paga, é o mesmo evento em outra roupa.
  if (!newlyPaid && row.status === "active" && decision.reason === "renewed") {
    await touchProviderClock(tx, row, event.occurredAt);
    return { applied: false, tenantId: row.tenantId, after };
  }

  // Ativação: o plano escolhido no checkout só vale quando o dinheiro entra.
  const activating = row.status !== "active" || row.planPriceId === null;
  const extra = activating
    ? ((await findPriceById(tx, row.provider, event.metadata?.planPriceId)) ??
      (await findPriceByRef(tx, row.provider, event.priceRef)))
    : null;

  await applySubscriptionDecision(tx, row, decision, {
    paymentEventId,
    occurredAt: event.occurredAt,
    extra,
  });

  // Reativação por checkout novo: a assinatura antiga não pode seguir cobrando.
  const replaced = row.providerSubscriptionRef;
  if (replaced && event.subscriptionRef && replaced !== event.subscriptionRef) {
    after.push(() => cancelReplaced(row, replaced, now));
  }

  return { applied: true, tenantId: row.tenantId, after };
}

/** Se falhar, a antiga segue cobrando em silêncio: precisa virar alerta, não só log. */
async function cancelReplaced(row: SubscriptionRow, ref: string, now: Date) {
  try {
    const provider = row.provider ? getProvider(row.provider) : null;
    await provider?.cancelSubscription(platformContext(), ref, { atPeriodEnd: false });
  } catch (error) {
    logError("Falha ao cancelar assinatura substituída", error);
    await withPlatformScope("webhook: alerta de duplicidade", (tx) =>
      setAlert(tx, row, {
        kind: "duplicate_subscription",
        at: now.toISOString(),
        detail: "assinatura_antiga_nao_cancelada",
      }),
    );
  }
}

function failedMail(change: InvoiceChange, graceEndsAt: Date | null) {
  const { tenantId, amountCents, currency } = change.invoice;

  return () =>
    notifyOwners(tenantId, "payment-failed", (owner) =>
      paymentFailedTemplate({
        ...owner,
        amountCents,
        currency,
        graceEndsAt: graceEndsAt ?? undefined,
      }),
    );
}

async function onPaymentFailed(
  tx: Tx,
  row: SubscriptionRow,
  event: Extract<NormalizedEvent, { type: "invoice.payment_failed" }>,
  settings: Settings,
  paymentEventId: string,
  now: Date,
): Promise<Applied> {
  const change = await upsertInvoice(tx, invoiceTarget(row), event.invoiceRef, {
    amountCents: event.amountCents,
    currency: event.currency,
    status: "failed",
    hostedUrl: safeUrl(event.hostedUrl),
    attempt: event.attempt,
  });
  if (!change) return { applied: false, after: [] };

  const decision = transition(
    snapshotOf(row),
    {
      type: "invoice.payment_failed",
      occurredAt: event.occurredAt,
      graceDays: settings.graceDays,
    },
    now,
  );

  if (decision.outcome === "ignored") {
    if (decision.reason !== "out_of_order") {
      await touchProviderClock(tx, row, event.occurredAt);
    }

    // `subscription.updated` pode ter levado a `past_due` antes: a ordem não é garantida,
    // e quem avisa da falha é a fatura. Só a primeira falha dela vira e-mail.
    const firstFailure =
      decision.reason === "already_past_due" && change.previous !== "failed";

    return {
      applied: firstFailure,
      tenantId: row.tenantId,
      after: firstFailure ? [failedMail(change, row.graceUntil)] : [],
    };
  }

  const updated = await applySubscriptionDecision(tx, row, decision, {
    paymentEventId,
    occurredAt: event.occurredAt,
  });

  return {
    applied: true,
    tenantId: row.tenantId,
    after: [failedMail(change, updated.graceUntil)],
  };
}

async function onInvoiceCreated(
  tx: Tx,
  row: SubscriptionRow,
  event: Extract<NormalizedEvent, { type: "invoice.created" }>,
): Promise<Applied> {
  const change = await upsertInvoice(tx, invoiceTarget(row), event.invoiceRef, {
    amountCents: event.amountCents,
    currency: event.currency,
    dueAt: event.dueAt,
    hostedUrl: safeUrl(event.hostedUrl),
    pixPayload: event.pixPayload,
    boletoLine: event.boletoLine,
  });
  if (!change) return { applied: false, after: [] };

  const { tenantId, amountCents, currency, dueAt } = change.invoice;
  const after: Applied["after"] =
    change.created && amountCents > 0
      ? [
          () =>
            notifyOwners(tenantId, "invoice-created", (owner) =>
              invoiceCreatedTemplate({
                ...owner,
                amountCents,
                currency,
                dueDate: dueAt ?? new Date(),
              }),
            ),
        ]
      : [];

  return { applied: true, tenantId, after };
}

async function onSubscriptionUpdated(
  tx: Tx,
  row: SubscriptionRow,
  event: Extract<NormalizedEvent, { type: "subscription.updated" }>,
  settings: Settings,
  paymentEventId: string,
  now: Date,
): Promise<Applied> {
  const decision = transition(
    snapshotOf(row),
    {
      type: "subscription.updated",
      occurredAt: event.occurredAt,
      subscriptionRef: event.subscriptionRef,
      status: event.status,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      periodStart: event.currentPeriodStart,
      periodEnd: event.currentPeriodEnd,
      graceDays: settings.graceDays,
      freePlanId: settings.freePlanId,
    },
    now,
  );

  // Troca de plano feita no portal do provedor.
  const ended =
    decision.outcome === "applied" && decision.status === "canceled";
  const changedPlan =
    !ended && row.providerSubscriptionRef === event.subscriptionRef
      ? planDivergence(row, await findPriceByRef(tx, row.provider, event.priceRef))
      : null;

  if (decision.outcome === "ignored") {
    if (decision.reason === "out_of_order") {
      return { applied: false, tenantId: row.tenantId, after: [] };
    }
    if (decision.reason !== "no_change" || !changedPlan) {
      await touchProviderClock(tx, row, event.occurredAt);
      return { applied: false, tenantId: row.tenantId, after: [] };
    }

    await applySubscriptionDecision(
      tx,
      row,
      { outcome: "applied", status: row.status, reason: "provider_plan_changed", patch: {} },
      { paymentEventId, occurredAt: event.occurredAt, extra: changedPlan },
    );
    return { applied: true, tenantId: row.tenantId, after: [] };
  }

  await applySubscriptionDecision(tx, row, decision, {
    paymentEventId,
    occurredAt: event.occurredAt,
    extra: decision.patch.planId ? null : changedPlan,
  });

  return { applied: true, tenantId: row.tenantId, after: [] };
}

async function onSubscriptionCanceled(
  tx: Tx,
  row: SubscriptionRow,
  event: Extract<NormalizedEvent, { type: "subscription.canceled" }>,
  settings: Settings,
  paymentEventId: string,
  now: Date,
): Promise<Applied> {
  const decision = transition(
    snapshotOf(row),
    {
      type: "subscription.canceled",
      occurredAt: event.occurredAt,
      subscriptionRef: event.subscriptionRef,
      freePlanId: settings.freePlanId,
    },
    now,
  );

  if (decision.outcome === "ignored") {
    return { applied: false, tenantId: row.tenantId, after: [] };
  }

  await applySubscriptionDecision(tx, row, decision, {
    paymentEventId,
    occurredAt: event.occurredAt,
  });

  // Quem pediu o cancelamento já recebeu o aviso, com a data, ao pedir.
  const told = row.cancelAtPeriodEnd;

  return {
    applied: true,
    tenantId: row.tenantId,
    after: told
      ? []
      : [() => notifyCanceled(row.tenantId, row.planId, now)],
  };
}

async function onRefund(
  tx: Tx,
  row: SubscriptionRow,
  event: Extract<NormalizedEvent, { type: "refund.completed" }>,
  now: Date,
): Promise<Applied> {
  const [current] = await tx
    .select()
    .from(invoice)
    .where(
      and(
        eq(invoice.subscriptionId, row.id),
        eq(invoice.providerRef, event.invoiceRef),
      ),
    )
    .for("update");
  if (!current) return { applied: false, tenantId: row.tenantId, after: [] };

  // Reembolso parcial fica na auditoria; a fatura segue paga.
  const total = event.amountCents >= current.amountCents;
  if (total && current.status !== "refunded") {
    await tx
      .update(invoice)
      .set({ status: "refunded" })
      .where(eq(invoice.id, current.id));
  } else if (total) {
    return { applied: false, tenantId: row.tenantId, after: [] };
  }

  await auditInTransaction(tx, "billing.invoice_refunded", {
    actor: { type: "system", id: null },
    tenantId: row.tenantId,
    target: { type: "invoice", id: current.id },
    metadata: { amountCents: event.amountCents, total, at: now.toISOString() },
  });

  return { applied: true, tenantId: row.tenantId, after: [] };
}

async function onChargeback(
  tx: Tx,
  row: SubscriptionRow,
  event: Extract<NormalizedEvent, { type: "chargeback.opened" }>,
  now: Date,
): Promise<Applied> {
  await setAlert(tx, row, {
    kind: "chargeback",
    at: now.toISOString(),
    detail: event.invoiceRef.slice(0, 100),
  });
  await auditInTransaction(tx, "billing.chargeback_opened", {
    actor: { type: "system", id: null },
    tenantId: row.tenantId,
    target: { type: "subscription", id: row.id },
  });

  return { applied: true, tenantId: row.tenantId, after: [] };
}

async function applyEvent(
  tx: Tx,
  provider: PaymentProviderId,
  event: NormalizedEvent,
  settings: Settings,
  paymentEventId: string,
  now: Date,
): Promise<Applied> {
  const row = await resolveSubscription(tx, provider, event);
  if (!row) return { applied: false, after: [] };

  switch (event.type) {
    case "invoice.paid":
      return onInvoicePaid(tx, row, event, paymentEventId, now);
    case "invoice.payment_failed":
      return onPaymentFailed(tx, row, event, settings, paymentEventId, now);
    case "invoice.created":
      return onInvoiceCreated(tx, row, event);
    case "subscription.updated":
      return onSubscriptionUpdated(tx, row, event, settings, paymentEventId, now);
    case "subscription.canceled":
      return onSubscriptionCanceled(tx, row, event, settings, paymentEventId, now);
    case "refund.completed":
      return onRefund(tx, row, event, now);
    case "chargeback.opened":
      return onChargeback(tx, row, event, now);
    case "ignored":
      return { applied: false, after: [] };
  }
}

export type WebhookOutcome = "processed" | "ignored" | "skipped";

async function loadEvent(id: string) {
  const [row] = await withPlatformScope("webhook: carrega evento", (tx) =>
    tx
      .update(paymentEvent)
      .set({ attempts: sql`${paymentEvent.attempts} + 1` })
      .where(
        and(
          eq(paymentEvent.id, id),
          eq(paymentEvent.verified, true),
          sql`${paymentEvent.status} in ('pending', 'failed')`,
        ),
      )
      .returning(),
  );

  return row ?? null;
}

/**
 * Aplica o evento. `skipped`: não há o que fazer (já tratado, ou nunca verificado). Falha
 * marca `failed` e relança para o pg-boss tentar de novo.
 */
export async function processPaymentEvent(
  id: string,
  now = new Date(),
): Promise<WebhookOutcome> {
  const row = await loadEvent(id);
  if (!row) return "skipped";

  try {
    const provider = getProvider(row.provider);
    if (!provider) throw new Error("módulo do provedor indisponível");

    const ctx = platformContext();
    const parsed = provider.parseWebhook(JSON.stringify(row.raw));
    const events: NormalizedEvent[] = [];

    for (const raw of parsed) {
      const enriched = (await provider.enrichEvent?.(ctx, raw)) ?? raw;
      events.push(await confirm(provider, ctx, enriched));
    }

    const { graceDays } = await loadSettings();
    const settings = { graceDays, freePlanId: await findFreePlanId() };

    const { outcome, after } = await withPlatformScope("webhook", async (tx) => {
      const after: Applied["after"] = [];

      // Dois jobs do mesmo evento: o segundo espera aqui e encontra o trabalho feito.
      const [current] = await tx
        .select({ status: paymentEvent.status })
        .from(paymentEvent)
        .where(eq(paymentEvent.id, row.id))
        .for("update");

      if (current?.status !== "pending" && current?.status !== "failed") {
        return { outcome: "skipped" as const, after };
      }

      let tenantId: string | null = null;
      let applied = false;

      for (const event of events) {
        const result = await applyEvent(tx, row.provider, event, settings, row.id, now);
        after.push(...result.after);
        applied ||= result.applied;
        tenantId ??= result.tenantId ?? null;
      }

      const status: "processed" | "ignored" = applied ? "processed" : "ignored";
      await tx
        .update(paymentEvent)
        .set({ status, tenantId, processedAt: now, error: null })
        .where(eq(paymentEvent.id, row.id));

      return { outcome: status, after };
    });

    // A cobrança já está gravada: aviso que falha não desfaz nem repete o evento.
    for (const effect of after) {
      await effect().catch((error) =>
        logError("Falha em efeito de webhook de pagamento", error),
      );
    }

    return outcome;
  } catch (error) {
    await withPlatformScope("webhook: marca falha", (tx) =>
      tx
        .update(paymentEvent)
        .set({ status: "failed", error: sanitizeError(error) })
        .where(eq(paymentEvent.id, row.id)),
    );
    throw error;
  }
}

export async function handleWebhookProcess(jobs: Job<WebhookProcessJob>[]) {
  for (const job of jobs) await processPaymentEvent(job.data.paymentEventId);
}
