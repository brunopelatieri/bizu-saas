import { createHash } from "node:crypto";
import type Stripe from "stripe";
import type { ProviderModule } from "@/lib/payments/registry";
import {
  type Capabilities,
  type NormalizedEvent,
  PaymentProviderError,
  type PaymentMetadata,
  type PaymentProvider,
  type RemoteInvoice,
  type RemoteSubscription,
  type RemoteSubscriptionStatus,
} from "@/lib/payments/types";
import { createStripeClient, type StripeClient } from "./client";
import {
  metadataOf,
  parseEvents,
  SUBSCRIPTION_STATUS,
  verifySignature,
} from "./webhook";

/**
 * Módulo Stripe. Como instalar, testar e remover: `README.md`, nesta pasta. Pix avulso
 * existe, mas assinatura com Pix não: o checkout oferece cartão e boleto.
 */

export const capabilities: Capabilities = {
  pix: true,
  boleto: true,
  card: true,
  debitCard: false,
  recurring: true,
  recurringPix: false,
  split: false,
  refund: true,
  partialRefund: true,
  hostedCheckout: true,
  customerPortal: true,
  pause: true,
  sandbox: true,
  webhookSignature: "hmac",
  nativeTrial: true,
  proration: true,
};

/** O Stripe recusa `trial_end` a menos de 48 h no Checkout: aí a cobrança é imediata. */
const MIN_TRIAL_MS = 48 * 60 * 60 * 1000;

/** Nada do erro do SDK sai daqui além do código: a mensagem pode citar dado do cliente. */
async function guard<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof PaymentProviderError) throw error;

    const { code, type } = error as { code?: string; type?: string };
    throw new PaymentProviderError(code ?? type ?? "stripe_error");
  }
}

const metadataParams = (metadata: PaymentMetadata) => ({
  tenantId: metadata.tenantId,
  subscriptionId: metadata.subscriptionId,
  ...(metadata.planPriceId ? { planPriceId: metadata.planPriceId } : {}),
});

function remoteStatus(subscription: Stripe.Subscription): RemoteSubscriptionStatus {
  if (subscription.pause_collection) return "paused";

  // Fora do mapa só sobra checkout pela metade: expirado acabou, o resto deve pagamento.
  return (
    SUBSCRIPTION_STATUS[subscription.status] ??
    (subscription.status === "incomplete_expired" ? "canceled" : "past_due")
  );
}

function remoteSubscription(subscription: Stripe.Subscription): RemoteSubscription {
  const item = subscription.items.data[0];
  const time = (seconds: number | undefined) =>
    seconds ? new Date(seconds * 1000) : undefined;

  return {
    ref: subscription.id,
    status: remoteStatus(subscription),
    currentPeriodStart: time(item?.current_period_start),
    currentPeriodEnd: time(item?.current_period_end),
    cancelAtPeriodEnd:
      subscription.cancel_at_period_end || Boolean(subscription.cancel_at),
    priceRef: item?.price.id,
  };
}

function remoteInvoice(invoice: Stripe.Invoice): RemoteInvoice {
  const status: RemoteInvoice["status"] =
    invoice.status === "paid"
      ? "paid"
      : invoice.status === "void"
        ? "void"
        : invoice.status === "uncollectible"
          ? "failed"
          : "open";
  const details = invoice.parent?.subscription_details;
  const subscription = details?.subscription;
  const customer = invoice.customer;

  return {
    ref: invoice.id,
    status,
    amountCents: invoice.total,
    currency: invoice.currency.toUpperCase(),
    subscriptionRef:
      typeof subscription === "string" ? subscription : subscription?.id,
    customerRef: typeof customer === "string" ? customer : customer?.id,
    metadata: metadataOf(details?.metadata),
    paidAt: invoice.status_transitions.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : undefined,
  };
}

async function paymentIntentOf(client: StripeClient, invoiceRef: string) {
  const payments = await client.invoicePayments.list({
    invoice: invoiceRef,
    limit: 1,
  });
  const payment = payments.data[0]?.payment.payment_intent;

  return typeof payment === "string" ? payment : payment?.id;
}

async function invoiceOfPayment(client: StripeClient, paymentIntent: string) {
  const payments = await client.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntent },
    limit: 1,
  });
  const invoice = payments.data[0]?.invoice;

  return typeof invoice === "string" ? invoice : invoice?.id;
}

export function createStripeProvider(deps: {
  client: StripeClient;
  webhookSecret: string;
}): PaymentProvider {
  const { client, webhookSecret } = deps;

  return {
    id: "stripe",
    capabilities,
    requiresPriceRef: true,

    ensureCustomer: (_ctx, { tenantId, billingProfile }) =>
      guard(async () => {
        const fingerprint = createHash("sha256")
          .update(JSON.stringify(billingProfile))
          .digest("hex")
          .slice(0, 16);
        const customer = await client.customers.create(
          {
            name: billingProfile.legalName,
            email: billingProfile.email,
            metadata: { tenantId },
          },
          { idempotencyKey: `customer:${tenantId}:${fingerprint}` },
        );

        return { customerRef: customer.id };
      }),

    createCheckout: (_ctx, input) =>
      guard(async () => {
        if (!input.price.providerPriceRef) {
          throw new PaymentProviderError("config", "Preço sem referência no Stripe.");
        }

        const metadata = metadataParams(input.metadata);
        const trialEnd =
          input.trialEndsAt &&
          input.trialEndsAt.getTime() - Date.now() > MIN_TRIAL_MS
            ? Math.floor(input.trialEndsAt.getTime() / 1000)
            : undefined;

        const session = await client.checkout.sessions.create(
          {
            mode: "subscription",
            customer: input.customerRef,
            line_items: [{ price: input.price.providerPriceRef, quantity: 1 }],
            allowed_payment_method_types: input.methods.filter(
              (method) => method !== "pix",
            ),
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            client_reference_id: input.metadata.subscriptionId,
            metadata,
            subscription_data: {
              metadata,
              ...(trialEnd ? { trial_end: trialEnd } : {}),
            },
          },
          { idempotencyKey: input.idempotencyKey },
        );

        if (!session.url) throw new PaymentProviderError("checkout_without_url");

        return { kind: "redirect", url: session.url };
      }),

    updateSubscription: (_ctx, ref, { price, prorate }) =>
      guard(async () => {
        if (!price.providerPriceRef) {
          throw new PaymentProviderError("config", "Preço sem referência no Stripe.");
        }

        const subscription = await client.subscriptions.retrieve(ref);
        const item = subscription.items.data[0];
        if (!item) throw new PaymentProviderError("subscription_without_item");

        await client.subscriptions.update(ref, {
          items: [{ id: item.id, price: price.providerPriceRef }],
          proration_behavior: prorate ? "always_invoice" : "none",
          // Sem isto o Stripe aceita a troca com o cartão recusado, e o plano maior valeria
          // até o fim da carência sem a diferença paga.
          ...(prorate ? { payment_behavior: "error_if_incomplete" as const } : {}),
          metadata: { planPriceId: price.id },
        });
      }),

    cancelSubscription: (_ctx, ref, { atPeriodEnd }) =>
      guard(async () => {
        if (atPeriodEnd) {
          await client.subscriptions.update(ref, { cancel_at_period_end: true });
          return;
        }

        await client.subscriptions.cancel(ref);
      }),

    pauseSubscription: (_ctx, ref) =>
      guard(async () => {
        await client.subscriptions.update(ref, {
          pause_collection: { behavior: "void" },
        });
      }),

    resumeSubscription: (_ctx, ref, { chargeNow }) =>
      guard(async () => {
        await client.subscriptions.update(ref, {
          pause_collection: "",
          cancel_at_period_end: false,
          ...(chargeNow
            ? {
                billing_cycle_anchor: { type: "now" },
                proration_behavior: "none" as const,
                payment_behavior: "error_if_incomplete" as const,
              }
            : {}),
        });
      }),

    refund: (_ctx, { invoiceRef, amountCents, idempotencyKey }) =>
      guard(async () => {
        const paymentIntent = await paymentIntentOf(client, invoiceRef);
        if (!paymentIntent) throw new PaymentProviderError("invoice_without_payment");

        const refund = await client.refunds.create(
          { payment_intent: paymentIntent, amount: amountCents },
          { idempotencyKey },
        );

        return { refundRef: refund.id, status: refund.status ?? "pending" };
      }),

    fetchSubscription: (_ctx, ref) =>
      guard(async () => remoteSubscription(await client.subscriptions.retrieve(ref))),

    fetchInvoice: (_ctx, ref) =>
      guard(async () => remoteInvoice(await client.invoices.retrieve(ref))),

    verifyWebhook: async (_ctx, req) =>
      verifySignature(client, webhookSecret, req),

    parseWebhook: parseEvents,

    enrichEvent: (_ctx, event): Promise<NormalizedEvent> =>
      guard(async () => {
        if (event.type !== "refund.completed" && event.type !== "chargeback.opened") {
          return event;
        }

        const invoiceRef = await invoiceOfPayment(client, event.invoiceRef);

        // Pagamento fora de fatura não é assinatura: não há o que espelhar.
        return invoiceRef
          ? { ...event, invoiceRef }
          : { type: "ignored", reason: "payment_without_invoice" };
      }),

    portalUrl: (_ctx, customerRef, returnUrl) =>
      guard(async () => {
        const session = await client.billingPortal.sessions.create({
          customer: customerRef,
          return_url: returnUrl,
        });

        return session.url;
      }),
  };
}

const stripeModule: ProviderModule = {
  id: "stripe",
  createProvider: (env) =>
    createStripeProvider({
      client: createStripeClient(env.STRIPE_SECRET_KEY ?? ""),
      webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
    }),
};

export default stripeModule;
