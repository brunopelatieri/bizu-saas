import type Stripe from "stripe";
import type {
  EventEnvelope,
  NormalizedEvent,
  PaymentMetadata,
  RemoteSubscriptionStatus,
  WebhookRequest,
  WebhookVerification,
} from "@/lib/payments/types";
import type { StripeClient } from "./client";

/** Tolerância da assinatura, em segundos: mais antigo que isso é replay. */
export const SIGNATURE_TOLERANCE = 300;

export function verifySignature(
  client: StripeClient,
  secret: string,
  req: WebhookRequest,
): WebhookVerification {
  const signature = req.headers["stripe-signature"];
  if (!signature) return { ok: false, reason: "missing_signature" };

  try {
    const event = client.webhooks.constructEvent(
      req.rawBody,
      signature,
      secret,
      SIGNATURE_TOLERANCE,
    );

    return { ok: true, eventId: event.id, eventType: event.type };
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
}

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;

const fromUnix = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000) : undefined;

/** `incomplete` é checkout em andamento: não muda nada aqui. */
export const SUBSCRIPTION_STATUS: Record<
  string,
  RemoteSubscriptionStatus | undefined
> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  unpaid: "unpaid",
  paused: "paused",
  canceled: "canceled",
};

function metadataOf(
  metadata: Stripe.Metadata | null | undefined,
): Partial<PaymentMetadata> {
  return {
    tenantId: metadata?.tenantId,
    subscriptionId: metadata?.subscriptionId,
    planPriceId: metadata?.planPriceId,
  };
}

/** A linha do preço da assinatura; as de proração vêm junto numa troca de plano. */
function subscriptionLine(invoice: Stripe.Invoice) {
  const lines = invoice.lines?.data ?? [];

  return (
    lines.find(
      (line) => line.parent?.subscription_item_details?.proration === false,
    ) ?? lines[0]
  );
}

function invoiceEnvelope(invoice: Stripe.Invoice, occurredAt: Date) {
  const details = invoice.parent?.subscription_details;

  return {
    occurredAt,
    customerRef: idOf(invoice.customer),
    metadata: metadataOf(details?.metadata),
    subscriptionRef: idOf(details?.subscription),
  } satisfies EventEnvelope & { subscriptionRef?: string };
}

function parseInvoice(event: Stripe.Event, occurredAt: Date): NormalizedEvent {
  const invoice = event.data.object as Stripe.Invoice;
  if (!invoice.id) return { type: "ignored", reason: "invoice_without_id" };

  const base = {
    ...invoiceEnvelope(invoice, occurredAt),
    invoiceRef: invoice.id,
    currency: invoice.currency?.toUpperCase(),
    hostedUrl: invoice.hosted_invoice_url ?? undefined,
  };

  switch (event.type) {
    case "invoice.paid": {
      // Início do trial nativo: fatura de zero, sem dinheiro. Quem ativa é a primeira cobrança.
      if (invoice.amount_paid === 0) {
        return { type: "ignored", reason: "zero_amount_invoice" };
      }

      const line = subscriptionLine(invoice);

      return {
        ...base,
        type: "invoice.paid",
        amountCents: invoice.amount_paid,
        paidAt: fromUnix(invoice.status_transitions?.paid_at) ?? occurredAt,
        periodStart: fromUnix(line?.period?.start),
        periodEnd: fromUnix(line?.period?.end),
        priceRef: idOf(line?.pricing?.price_details?.price),
      };
    }

    case "invoice.payment_failed":
      return {
        ...base,
        type: "invoice.payment_failed",
        reason: "payment_failed",
        amountCents: invoice.amount_due,
        attempt: invoice.attempt_count,
      };

    default:
      if (invoice.amount_due === 0) {
        return { type: "ignored", reason: "zero_amount_invoice" };
      }

      return {
        ...base,
        type: "invoice.created",
        amountCents: invoice.amount_due,
        dueAt: fromUnix(invoice.due_date),
      };
  }
}

function parseSubscription(
  event: Stripe.Event,
  occurredAt: Date,
): NormalizedEvent {
  const subscription = event.data.object as Stripe.Subscription;
  const envelope = {
    occurredAt,
    customerRef: idOf(subscription.customer),
    metadata: metadataOf(subscription.metadata),
    subscriptionRef: subscription.id,
  };

  if (event.type === "customer.subscription.deleted") {
    return { ...envelope, type: "subscription.canceled" };
  }

  // `pause_collection` não muda o status do Stripe: a assinatura segue `active`.
  const status = subscription.pause_collection
    ? "paused"
    : SUBSCRIPTION_STATUS[subscription.status];
  if (!status) return { type: "ignored", reason: "incomplete_subscription" };

  const item = subscription.items?.data?.[0];

  return {
    ...envelope,
    type: "subscription.updated",
    status,
    currentPeriodStart: fromUnix(item?.current_period_start),
    currentPeriodEnd: fromUnix(item?.current_period_end),
    cancelAtPeriodEnd:
      subscription.cancel_at_period_end || subscription.cancel_at !== null,
    priceRef: item?.price?.id,
  };
}

/**
 * O `Charge` e a `Dispute` não apontam mais para a fatura. O pagamento vai em `invoiceRef`
 * e `enrichEvent` troca pela fatura, que só a API responde.
 */
function parseCharge(event: Stripe.Event, occurredAt: Date): NormalizedEvent {
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const payment = idOf(charge.payment_intent);
    if (!payment) return { type: "ignored", reason: "charge_without_payment" };

    return {
      type: "refund.completed",
      occurredAt,
      invoiceRef: payment,
      amountCents: charge.amount_refunded,
    };
  }

  const dispute = event.data.object as Stripe.Dispute;
  const payment = idOf(dispute.payment_intent);
  if (!payment) return { type: "ignored", reason: "dispute_without_payment" };

  return { type: "chargeback.opened", occurredAt, invoiceRef: payment };
}

/** Só traduz: o corpo já foi verificado no recebimento. */
export function parseEvents(rawBody: string): NormalizedEvent[] {
  const event = JSON.parse(rawBody) as Stripe.Event;
  const occurredAt = new Date(event.created * 1000);

  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.created":
    case "invoice.finalized":
      return [parseInvoice(event, occurredAt)];

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return [parseSubscription(event, occurredAt)];

    case "charge.refunded":
    case "charge.dispute.created":
      return [parseCharge(event, occurredAt)];

    default:
      return [{ type: "ignored", reason: `unhandled:${event.type}` }];
  }
}
