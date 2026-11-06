import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { recurringMethods } from "@/lib/billing/checkout";
import { PaymentProviderError } from "@/lib/payments/types";
import { capabilities, createStripeProvider } from "./index";

const SECRET = "whsec_teste_local_nao_e_segredo";
const client = new Stripe("sk_test_nao_e_segredo");
const ctx = { sandbox: true };
const CREATED = new Date(1793620800 * 1000);

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const fixture = (name: string) =>
  readFileSync(path.join(fixturesDir, `${name}.json`), "utf8");

const provider = createStripeProvider({ client, webhookSecret: SECRET });

function signed(payload: string, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  return {
    headers: {
      "stripe-signature": client.webhooks.generateTestHeaderString({
        payload,
        secret,
        timestamp,
      }),
    },
    rawBody: payload,
    url: "https://app.test/api/webhooks/payments/stripe",
  };
}

const parsed = (name: string) => provider.parseWebhook(fixture(name))[0];

describe("capacidades", () => {
  it("assinatura com cartão e boleto, sem Pix recorrente", () => {
    expect(recurringMethods(capabilities)).toEqual(["card", "boleto"]);
  });

  it("segue a matriz da spec", () => {
    expect(capabilities).toMatchObject({
      recurringPix: false,
      nativeTrial: true,
      pause: true,
      customerPortal: true,
      webhookSignature: "hmac",
    });
  });
});

describe("verifyWebhook", () => {
  const payload = fixture("invoice.paid");

  it("aceita assinatura válida e devolve o id e o tipo do evento", async () => {
    await expect(provider.verifyWebhook(ctx, signed(payload))).resolves.toEqual({
      ok: true,
      eventId: "evt_test_paid",
      eventType: "invoice.paid",
    });
  });

  it("recusa assinatura com outro segredo", async () => {
    const request = signed(payload, undefined, "whsec_outro");

    await expect(provider.verifyWebhook(ctx, request)).resolves.toEqual({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("recusa corpo alterado depois de assinado", async () => {
    const request = signed(payload);

    await expect(
      provider.verifyWebhook(ctx, {
        ...request,
        rawBody: payload.replace("9900", "1"),
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("recusa assinatura expirada (replay, mais de 5 minutos)", async () => {
    const old = Math.floor(Date.now() / 1000) - 301;

    await expect(
      provider.verifyWebhook(ctx, signed(payload, old)),
    ).resolves.toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("aceita dentro da tolerância", async () => {
    const recent = Math.floor(Date.now() / 1000) - 240;

    await expect(
      provider.verifyWebhook(ctx, signed(payload, recent)),
    ).resolves.toMatchObject({ ok: true });
  });

  it("recusa requisição sem o cabeçalho", async () => {
    await expect(
      provider.verifyWebhook(ctx, { headers: {}, rawBody: payload, url: "" }),
    ).resolves.toEqual({ ok: false, reason: "missing_signature" });
  });
});

describe("parseWebhook", () => {
  it("todas as fixtures são eventos com id e tipo", () => {
    const files = readdirSync(fixturesDir).filter((name) => name.endsWith(".json"));

    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const body = fixture(file.replace(/\.json$/, ""));
      expect(provider.parseWebhook(body)).toHaveLength(1);
    }
  });

  it("invoice.paid traz valor, período, preço e metadados", () => {
    expect(parsed("invoice.paid")).toEqual({
      type: "invoice.paid",
      invoiceRef: "in_test_1",
      subscriptionRef: "sub_test_1",
      customerRef: "cus_test_1",
      amountCents: 9900,
      currency: "BRL",
      paidAt: CREATED,
      occurredAt: CREATED,
      hostedUrl: "https://invoice.stripe.com/i/acct_test/test_inv_1",
      periodStart: CREATED,
      periodEnd: new Date(CREATED.getTime() + 30 * 86_400_000),
      priceRef: "price_test_pro",
      metadata: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        subscriptionId: "22222222-2222-4222-8222-222222222222",
        planPriceId: "33333333-3333-4333-8333-333333333333",
      },
    });
  });

  it("numa troca de plano, o período vem da linha do plano, não da proração", () => {
    const event = parsed("invoice.paid.upgrade");

    expect(event).toMatchObject({
      type: "invoice.paid",
      amountCents: 14000,
      priceRef: "price_test_pro",
    });
  });

  it("fatura de zero do início do trial não ativa nada", () => {
    expect(parsed("invoice.paid.trial")).toEqual({
      type: "ignored",
      reason: "zero_amount_invoice",
    });
  });

  it("invoice.payment_failed traz a tentativa, sem o motivo do emissor", () => {
    expect(parsed("invoice.payment_failed")).toMatchObject({
      type: "invoice.payment_failed",
      invoiceRef: "in_test_1",
      subscriptionRef: "sub_test_1",
      reason: "payment_failed",
      amountCents: 9900,
      attempt: 2,
    });
  });

  it.each(["invoice.created", "invoice.finalized"])("%s vira invoice.created", (name) => {
    expect(parsed(name)).toMatchObject({
      type: "invoice.created",
      invoiceRef: "in_test_1",
      amountCents: 9900,
    });
  });

  it("customer.subscription.created em trial liga a referência", () => {
    expect(parsed("customer.subscription.created.trial")).toMatchObject({
      type: "subscription.updated",
      subscriptionRef: "sub_test_1",
      status: "trialing",
    });
  });

  it("customer.subscription.updated traz período, preço e agendamento", () => {
    expect(parsed("customer.subscription.updated")).toMatchObject({
      type: "subscription.updated",
      status: "active",
      cancelAtPeriodEnd: true,
      priceRef: "price_test_pro",
      currentPeriodStart: CREATED,
    });
  });

  it("pause_collection vira paused, mesmo com o status active no Stripe", () => {
    expect(parsed("customer.subscription.updated.paused")).toMatchObject({
      type: "subscription.updated",
      status: "paused",
    });
  });

  it("assinatura incomplete é checkout em andamento", () => {
    expect(parsed("customer.subscription.updated.incomplete")).toEqual({
      type: "ignored",
      reason: "incomplete_subscription",
    });
  });

  it("customer.subscription.deleted vira subscription.canceled", () => {
    expect(parsed("customer.subscription.deleted")).toMatchObject({
      type: "subscription.canceled",
      subscriptionRef: "sub_test_1",
    });
  });

  it("charge.refunded leva o pagamento e o total reembolsado", () => {
    expect(parsed("charge.refunded")).toMatchObject({
      type: "refund.completed",
      invoiceRef: "pi_test_1",
      amountCents: 9900,
    });
    expect(parsed("charge.refunded.partial")).toMatchObject({ amountCents: 3000 });
  });

  it("charge.dispute.created vira chargeback", () => {
    expect(parsed("charge.dispute.created")).toMatchObject({
      type: "chargeback.opened",
      invoiceRef: "pi_test_1",
    });
  });

  it("o resto é ignored", () => {
    expect(parsed("checkout.session.completed")).toEqual({
      type: "ignored",
      reason: "unhandled:checkout.session.completed",
    });
  });
});

/** Só o que o módulo usa do SDK: a rede fica de fora. */
function stubbed(overrides: Record<string, unknown>) {
  return createStripeProvider({
    client: overrides as unknown as Stripe,
    webhookSecret: SECRET,
  });
}

const price = {
  id: "preco-local",
  planId: "plano",
  provider: "stripe" as const,
  interval: "month" as const,
  amountCents: 9900,
  currency: "BRL",
  providerPriceRef: "price_test_pro",
};

const checkoutInput = {
  customerRef: "cus_1",
  price,
  methods: ["card" as const],
  successUrl: "https://app.test/ok",
  cancelUrl: "https://app.test/volta",
  idempotencyKey: "chave",
  metadata: { tenantId: "t", subscriptionId: "s", planPriceId: "preco-local" },
};

describe("enrichEvent", () => {
  const withPayment = (invoice: string | undefined) => ({
    invoicePayments: {
      list: vi.fn().mockResolvedValue({ data: invoice ? [{ invoice }] : [] }),
    },
  });

  it("troca o pagamento pela fatura", async () => {
    const stub = withPayment("in_9");
    const event = provider.parseWebhook(fixture("charge.refunded"))[0];
    if (!event) throw new Error("sem evento");

    await expect(stubbed(stub).enrichEvent?.(ctx, event)).resolves.toMatchObject({
      type: "refund.completed",
      invoiceRef: "in_9",
    });
    expect(stub.invoicePayments.list).toHaveBeenCalledWith({
      payment: { type: "payment_intent", payment_intent: "pi_test_1" },
      limit: 1,
    });
  });

  it("pagamento fora de fatura é ignorado", async () => {
    const event = provider.parseWebhook(fixture("charge.dispute.created"))[0];
    if (!event) throw new Error("sem evento");

    await expect(
      stubbed(withPayment(undefined)).enrichEvent?.(ctx, event),
    ).resolves.toEqual({ type: "ignored", reason: "payment_without_invoice" });
  });

  it("os demais eventos passam sem chamada à API", async () => {
    const stub = withPayment("in_9");
    const event = provider.parseWebhook(fixture("invoice.paid"))[0];
    if (!event) throw new Error("sem evento");

    await expect(stubbed(stub).enrichEvent?.(ctx, event)).resolves.toBe(event);
    expect(stub.invoicePayments.list).not.toHaveBeenCalled();
  });
});

describe("createCheckout", () => {
  const sessions = (url: string | null = "https://checkout.stripe.com/c/1") => ({
    checkout: {
      sessions: { create: vi.fn().mockResolvedValue({ url }) },
    },
  });

  it("assinatura com metadados nos dois objetos e chave de idempotência", async () => {
    const stub = sessions();

    await expect(
      stubbed(stub).createCheckout(ctx, checkoutInput),
    ).resolves.toEqual({
      kind: "redirect",
      url: "https://checkout.stripe.com/c/1",
    });

    const [params, options] = stub.checkout.sessions.create.mock.calls[0] ?? [];

    expect(params).toMatchObject({
      mode: "subscription",
      customer: "cus_1",
      line_items: [{ price: "price_test_pro", quantity: 1 }],
      allowed_payment_method_types: ["card"],
      metadata: checkoutInput.metadata,
      subscription_data: { metadata: checkoutInput.metadata },
    });
    expect(options).toEqual({ idempotencyKey: "chave" });
  });

  it("trial local vira trial_end, com folga de 48 h", async () => {
    const stub = sessions();
    const trialEndsAt = new Date(Date.now() + 5 * 86_400_000);

    await stubbed(stub).createCheckout(ctx, { ...checkoutInput, trialEndsAt });

    const [params] = stub.checkout.sessions.create.mock.calls[0] ?? [];
    expect(params.subscription_data.trial_end).toBe(
      Math.floor(trialEndsAt.getTime() / 1000),
    );
  });

  it("trial acabando cobra na hora: o Stripe recusaria o trial_end", async () => {
    const stub = sessions();
    const trialEndsAt = new Date(Date.now() + 86_400_000);

    await stubbed(stub).createCheckout(ctx, { ...checkoutInput, trialEndsAt });

    const [params] = stub.checkout.sessions.create.mock.calls[0] ?? [];
    expect(params.subscription_data.trial_end).toBeUndefined();
  });

  it("preço sem referência é erro de configuração", async () => {
    await expect(
      stubbed(sessions()).createCheckout(ctx, {
        ...checkoutInput,
        price: { ...price, providerPriceRef: null },
      }),
    ).rejects.toMatchObject({ code: "config" });
  });

  it("erro do SDK sai só com o código, sem a mensagem", async () => {
    const failing = {
      checkout: {
        sessions: {
          create: vi.fn().mockRejectedValue(
            Object.assign(new Error("Cliente fulano@exemplo.test recusado"), {
              code: "resource_missing",
            }),
          ),
        },
      },
    };
    const error = await stubbed(failing)
      .createCheckout(ctx, checkoutInput)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PaymentProviderError);
    expect((error as PaymentProviderError).code).toBe("resource_missing");
    expect((error as PaymentProviderError).message).not.toContain("fulano");
  });
});

describe("assinatura", () => {
  const subscriptions = () => ({
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({ items: { data: [{ id: "si_1" }] } }),
      update: vi.fn().mockResolvedValue({}),
      cancel: vi.fn().mockResolvedValue({}),
    },
  });

  it("upgrade prorrateia e cobra na hora", async () => {
    const stub = subscriptions();
    await stubbed(stub).updateSubscription?.(ctx, "sub_1", { price, prorate: true });

    expect(stub.subscriptions.update).toHaveBeenCalledWith("sub_1", {
      items: [{ id: "si_1", price: "price_test_pro" }],
      proration_behavior: "always_invoice",
      metadata: { planPriceId: "preco-local" },
    });
  });

  it("downgrade só muda o preço da próxima cobrança", async () => {
    const stub = subscriptions();
    await stubbed(stub).updateSubscription?.(ctx, "sub_1", { price, prorate: false });

    expect(stub.subscriptions.update.mock.calls[0]?.[1]).toMatchObject({
      proration_behavior: "none",
    });
  });

  it("cancela no fim do período ou agora", async () => {
    const stub = subscriptions();
    const provider = stubbed(stub);

    await provider.cancelSubscription(ctx, "sub_1", { atPeriodEnd: true });
    await provider.cancelSubscription(ctx, "sub_1", { atPeriodEnd: false });

    expect(stub.subscriptions.update).toHaveBeenCalledWith("sub_1", {
      cancel_at_period_end: true,
    });
    expect(stub.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
  });

  it("pausa e retoma com pause_collection", async () => {
    const stub = subscriptions();
    const provider = stubbed(stub);

    await provider.pauseSubscription?.(ctx, "sub_1");
    await provider.resumeSubscription?.(ctx, "sub_1");

    expect(stub.subscriptions.update).toHaveBeenNthCalledWith(1, "sub_1", {
      pause_collection: { behavior: "void" },
    });
    expect(stub.subscriptions.update).toHaveBeenNthCalledWith(2, "sub_1", {
      pause_collection: "",
      cancel_at_period_end: false,
    });
  });

  it("fetchSubscription traduz o status e o período", async () => {
    const remote = JSON.parse(fixture("customer.subscription.updated")).data.object;
    const stub = {
      subscriptions: { retrieve: vi.fn().mockResolvedValue(remote) },
    };

    await expect(
      stubbed(stub).fetchSubscription(ctx, "sub_test_1"),
    ).resolves.toMatchObject({
      ref: "sub_test_1",
      status: "active",
      cancelAtPeriodEnd: true,
      priceRef: "price_test_pro",
    });
  });

  it("fetchInvoice traduz o status", async () => {
    const remote = JSON.parse(fixture("invoice.paid")).data.object;
    const stub = { invoices: { retrieve: vi.fn().mockResolvedValue(remote) } };

    await expect(stubbed(stub).fetchInvoice(ctx, "in_test_1")).resolves.toMatchObject({
      ref: "in_test_1",
      status: "paid",
      amountCents: 9900,
      currency: "BRL",
      subscriptionRef: "sub_test_1",
    });
  });
});
