import type {
  InvoiceStatus,
  PaymentMethod,
  PaymentProviderId,
  PriceInterval,
} from "@/lib/billing/constants";
import type { BillingAddress, DocumentType, SubscriptionStatus } from "@/db/schema/billing";

/**
 * Contrato de um módulo de pagamento (`spec-billing.md`). O núcleo (`src/lib/billing/`)
 * só conhece este arquivo e o registro: nenhum provedor aparece pelo nome.
 *
 * Campos além da spec, todos opcionais ou aditivos, com o motivo ao lado.
 */

export type ProviderId = PaymentProviderId;

export type Capabilities = {
  pix: boolean;
  boleto: boolean;
  card: boolean;
  debitCard: boolean;
  /** Assinatura nativa no provedor. */
  recurring: boolean;
  /** Pix recorrente para empresa no Brasil. */
  recurringPix: boolean;
  split: boolean;
  refund: boolean;
  partialRefund: boolean;
  hostedCheckout: boolean;
  customerPortal: boolean;
  pause: boolean;
  sandbox: boolean;
  webhookSignature: "hmac" | "ecdsa" | "token" | "none";
  /** Além da spec: o provedor mantém o trial e só cobra no fim dele. */
  nativeTrial: boolean;
  /** Além da spec: `updateSubscription` prorrateia. Sem isso, o núcleo calcula. */
  proration: boolean;
};

/** Credenciais do tenant no fluxo (b), reservado. No fluxo (a) ficam ausentes. */
export type TenantCredentials = { secret: string };

export type PaymentContext = {
  /** Ausente no fluxo (a): o módulo usa as variáveis de ambiente. */
  credentials?: TenantCredentials;
  sandbox: boolean;
};

export type PlanPrice = {
  id: string;
  planId: string;
  provider: ProviderId;
  interval: PriceInterval;
  amountCents: number;
  currency: string;
  providerPriceRef: string | null;
};

export type BillingProfile = {
  legalName: string;
  document: string;
  documentType: DocumentType;
  email: string;
  address: BillingAddress;
};

/** Vão em todo checkout e assinatura e voltam nos webhooks. */
export type PaymentMetadata = {
  tenantId: string;
  subscriptionId: string;
  /** Além da spec: o preço escolhido, para ativar o plano certo no primeiro pagamento. */
  planPriceId?: string;
};

export type CheckoutResult =
  | { kind: "redirect"; url: string }
  | {
      kind: "inline";
      pixPayload?: string;
      boletoUrl?: string;
      expiresAt: Date;
      /** Além da spec: fatura criada no provedor e linha digitável, quando já existem. */
      invoiceRef?: string;
      boletoLine?: string;
    };

/** Status da assinatura no provedor, já traduzido pelo módulo. */
export type RemoteSubscriptionStatus = Extract<
  SubscriptionStatus,
  "trialing" | "active" | "past_due" | "unpaid" | "paused" | "canceled"
>;

export type RemoteSubscription = {
  ref: string;
  status: RemoteSubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  priceRef?: string;
};

export type RemoteInvoice = {
  ref: string;
  status: InvoiceStatus;
  amountCents: number;
  currency: string;
  subscriptionRef?: string;
  customerRef?: string;
  /** Além da spec: sem assinatura no webhook, só o que a API devolve identifica o tenant. */
  metadata?: Partial<PaymentMetadata>;
  paidAt?: Date;
};

export type WebhookRequest = {
  /** Nomes em minúsculas. */
  headers: Record<string, string>;
  rawBody: string;
  url: string;
};

export type WebhookVerification =
  | {
      ok: true;
      eventId: string;
      /** Além da spec: só para a listagem em `/admin/webhooks`. */
      eventType?: string;
    }
  | { ok: false; reason: string };

/** Além da spec: o que todo evento pode trazer. Fica fora do `raw` para o núcleo não o ler. */
export type EventEnvelope = {
  /** Quando aconteceu no provedor. Sem isso, o evento não participa da ordem. */
  occurredAt?: Date;
  customerRef?: string;
  metadata?: Partial<PaymentMetadata>;
};

export type NormalizedEvent = EventEnvelope &
  (
    | {
        type: "invoice.paid";
        invoiceRef: string;
        subscriptionRef?: string;
        amountCents: number;
        method?: PaymentMethod;
        paidAt: Date;
        currency?: string;
        hostedUrl?: string;
        periodStart?: Date;
        periodEnd?: Date;
        priceRef?: string;
      }
    | {
        type: "invoice.payment_failed";
        invoiceRef: string;
        subscriptionRef?: string;
        reason: string;
        amountCents?: number;
        currency?: string;
        hostedUrl?: string;
        attempt?: number;
      }
    | {
        type: "invoice.created";
        invoiceRef: string;
        subscriptionRef?: string;
        dueAt?: Date;
        hostedUrl?: string;
        pixPayload?: string;
        boletoLine?: string;
        amountCents?: number;
        currency?: string;
      }
    | {
        type: "subscription.updated";
        subscriptionRef: string;
        status: RemoteSubscriptionStatus;
        currentPeriodEnd?: Date;
        currentPeriodStart?: Date;
        cancelAtPeriodEnd?: boolean;
        priceRef?: string;
      }
    | { type: "subscription.canceled"; subscriptionRef: string }
    | { type: "refund.completed"; invoiceRef: string; amountCents: number }
    | { type: "chargeback.opened"; invoiceRef: string }
    | { type: "ignored"; reason: string }
  );

export interface PaymentProvider {
  id: ProviderId;
  capabilities: Capabilities;
  /** Além da spec: o preço só serve com `provider_price_ref` preenchido. */
  requiresPriceRef: boolean;
  ensureCustomer(
    ctx: PaymentContext,
    input: { tenantId: string; billingProfile: BillingProfile },
  ): Promise<{ customerRef: string }>;
  createCheckout(
    ctx: PaymentContext,
    input: {
      customerRef: string;
      price: PlanPrice;
      methods: PaymentMethod[];
      successUrl: string;
      cancelUrl: string;
      idempotencyKey: string;
      metadata: PaymentMetadata;
      /** Além da spec: fim do trial local, para quem tem trial nativo não cobrar antes. */
      trialEndsAt?: Date;
    },
  ): Promise<CheckoutResult>;
  createSubscription?(
    ctx: PaymentContext,
    input: {
      customerRef: string;
      price: PlanPrice;
      idempotencyKey: string;
      metadata: PaymentMetadata;
    },
  ): Promise<{
    subscriptionRef: string;
    status: RemoteSubscriptionStatus;
    currentPeriodEnd?: Date;
  }>;
  updateSubscription?(
    ctx: PaymentContext,
    ref: string,
    input: { price: PlanPrice; prorate: boolean },
  ): Promise<void>;
  cancelSubscription(
    ctx: PaymentContext,
    ref: string,
    input: { atPeriodEnd: boolean },
  ): Promise<void>;
  pauseSubscription?(ctx: PaymentContext, ref: string): Promise<void>;
  /**
   * Além da spec: desfaz a pausa e o cancelamento agendado. `chargeNow`: o período pago
   * acabou durante a pausa, e a retomada abre um ciclo novo, cobrado na hora. Se a cobrança
   * falhar, lance erro: nada pode voltar sem pagamento.
   */
  resumeSubscription?(
    ctx: PaymentContext,
    ref: string,
    input: { chargeNow: boolean },
  ): Promise<void>;
  /** Além da spec: cobrança avulsa da diferença quando o provedor não prorrateia. */
  chargeOnce?(
    ctx: PaymentContext,
    input: {
      customerRef: string;
      amountCents: number;
      currency: string;
      description: string;
      idempotencyKey: string;
      metadata: PaymentMetadata;
    },
  ): Promise<{ invoiceRef: string }>;
  refund(
    ctx: PaymentContext,
    input: { invoiceRef: string; amountCents?: number; idempotencyKey: string },
  ): Promise<{ refundRef: string; status: string }>;
  fetchSubscription(ctx: PaymentContext, ref: string): Promise<RemoteSubscription>;
  fetchInvoice(ctx: PaymentContext, ref: string): Promise<RemoteInvoice>;
  verifyWebhook(
    ctx: PaymentContext,
    req: WebhookRequest,
  ): Promise<WebhookVerification>;
  parseWebhook(rawBody: string): NormalizedEvent[];
  /**
   * Além da spec: completa o evento com o que só a API do provedor sabe, fora da
   * transação. No Stripe, `charge.refunded` não traz a fatura.
   */
  enrichEvent?(
    ctx: PaymentContext,
    event: NormalizedEvent,
  ): Promise<NormalizedEvent>;
  portalUrl?(
    ctx: PaymentContext,
    customerRef: string,
    returnUrl?: string,
  ): Promise<string>;
}

/** Erro do provedor sem dado pessoal: o módulo traduz antes de deixar sair. */
export class PaymentProviderError extends Error {
  constructor(
    /** Código ou tipo do provedor, ou `config` para configuração incompleta. */
    readonly code: string,
    message = "Falha no provedor de pagamento.",
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
