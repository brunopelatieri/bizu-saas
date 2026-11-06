import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "@/api/app";
import { processPaymentEvent } from "@/jobs/webhooks";
import { setWebhookQueueForTests } from "@/lib/billing/inbox";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import { setProvidersForTests } from "@/lib/payments/registry";
import {
  accessModeOf,
  asPlatform,
  bodyOf,
  cleanUpBilling,
  createPaidPlan,
  createStubProvider,
  hideFreePlans,
  makePlatformUser,
  paymentEvents,
  restoreSettings,
  type SavedSettings,
  saveSettings,
  sendWebhook,
  setSettings,
  type StubProvider,
  STUB_ID,
  subscriptionState,
  updateSubscription,
} from "./billing-helpers";
import {
  call,
  cleanUp,
  connectOwner,
  createTenant,
  createUser,
  type TestUser,
} from "./tenant-helpers";

/**
 * Do checkout ao estado local, pelo caminho real: rota do webhook → `payment_event` →
 * job → assinatura, fatura e e-mail. O provedor é um stub; só a fila fica de fora, e o
 * teste chama o job na ordem que quer.
 */

const PROFILE = {
  legalName: "Clínica Teste Ltda",
  document: "11.222.333/0001-81",
  documentType: "cnpj",
  email: "financeiro@tenant-test.bizu.local",
};

const mail = createMemoryProvider();
const queued: string[] = [];
let stub: StubProvider;
let owner: postgres.Sql;
let saved: SavedSettings;
let showFreePlans: () => Promise<void>;
let basic: Awaited<ReturnType<typeof createPaidPlan>>;
let pro: Awaited<ReturnType<typeof createPaidPlan>>;
let featured: Awaited<ReturnType<typeof createPaidPlan>>;
let user: TestUser;
let tenantId: string;

const subscriptionRef = () => `sub_${randomUUID()}`;
const templates = () => mail.sent.map((message) => message.tags?.template);

async function drain() {
  const outcomes = [];
  for (const id of queued.splice(0)) outcomes.push(await processPaymentEvent(id));

  return outcomes;
}

/** Tenant novo em trial no plano `basic`, com perfil de faturamento. */
async function newTenant() {
  const person = await createUser(owner);
  const tenant = await createTenant(person);
  const profile = await call("PUT", "/api/billing/profile", {
    cookie: person.cookie,
    body: PROFILE,
  });
  expect(profile.status).toBe(200);

  return { person, tenantId: tenant.id };
}

/** Assinatura ativa e paga, ligada ao provedor por um `invoice.paid`. */
async function subscribe(tenant: string, plan = basic) {
  const ref = subscriptionRef();
  const [row] = await asPlatform(owner, (tx) =>
    tx<{ id: string }[]>`select id from subscription where tenant_id = ${tenant}`,
  );
  await updateSubscription(owner, tenant, {
    provider: STUB_ID,
    provider_customer_ref: `cus_${randomUUID()}`,
  });

  await sendWebhook([
    {
      type: "invoice.paid",
      invoiceRef: `in_${randomUUID()}`,
      subscriptionRef: ref,
      amountCents: 9900,
      paidAt: new Date().toISOString(),
      periodStart: new Date().toISOString(),
      periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      metadata: { subscriptionId: row?.id, planPriceId: plan.priceId },
    },
  ]);
  await drain();

  return ref;
}

beforeAll(async () => {
  owner = connectOwner();
  saved = await saveSettings(owner);
  showFreePlans = await hideFreePlans(owner);
  basic = await createPaidPlan(owner, 9900);
  pro = await createPaidPlan(owner, 29900);
  featured = await createPaidPlan(owner, 59900, { features: ["recurso_pago"] });
  await setSettings(owner, { trialPlanId: basic.id, trialDays: 14, graceDays: 7 });
  setEmailProviderForTests(mail);
  setWebhookQueueForTests(async (id) => {
    queued.push(id);
  });
});

beforeEach(async () => {
  stub = createStubProvider();
  setProvidersForTests([stub]);
  queued.length = 0;
  mail.sent.length = 0;
  ({ person: user, tenantId } = await newTenant());
  mail.sent.length = 0;
});

afterAll(async () => {
  setProvidersForTests(undefined);
  setWebhookQueueForTests(undefined);
  setEmailProviderForTests(undefined);
  await restoreSettings(owner, saved);
  await showFreePlans();
  await cleanUpBilling(owner);
  await cleanUp(owner);
  await owner.end();
});

describe("checkout até active", () => {
  it("do trial ao plano pago, por webhook", async () => {
    const checkout = await call("POST", "/api/billing/checkout", {
      cookie: user.cookie,
      body: { planPriceId: pro.priceId, method: "card" },
    });
    expect(checkout.status).toBe(200);
    expect(await bodyOf(checkout)).toEqual({
      kind: "redirect",
      url: "https://pagamento.test/checkout",
    });

    const before = await subscriptionState(owner, tenantId);
    expect(before.status).toBe("trialing");
    expect(before.plan_id).toBe(basic.id);
    expect(before.provider).toBe(STUB_ID);

    const [, input] = (stub.calls.createCheckout?.[0] ?? []) as [
      unknown,
      {
        idempotencyKey: string;
        methods: string[];
        metadata: Record<string, string>;
        successUrl: string;
      },
    ];
    expect(input.metadata).toEqual({
      tenantId,
      subscriptionId: before.id,
      planPriceId: pro.priceId,
    });
    expect(input.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(input.methods).toEqual(["card"]);
    expect(input.successUrl).toContain("/app/assinatura/retorno");

    const ref = subscriptionRef();
    const invoiceRef = `in_${randomUUID()}`;
    const eventId = `evt_${randomUUID()}`;
    const webhook = await sendWebhook(
      [
        {
          type: "invoice.paid",
          invoiceRef,
          subscriptionRef: ref,
          customerRef: before.provider_customer_ref,
          amountCents: 29900,
          currency: "BRL",
          method: "card",
          paidAt: new Date().toISOString(),
          occurredAt: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          hostedUrl: "https://pagamento.test/fatura/1",
          metadata: { subscriptionId: before.id, planPriceId: pro.priceId },
        },
      ],
      { id: eventId },
    );
    expect(webhook.status).toBe(200);

    const [received] = await paymentEvents(owner, eventId);
    expect(received).toMatchObject({ status: "pending", verified: true });
    expect(queued).toEqual([received?.id]);

    // Nada mudou antes do job: a rota só recebe.
    expect((await subscriptionState(owner, tenantId)).status).toBe("trialing");

    expect(await drain()).toEqual(["processed"]);

    const after = await subscriptionState(owner, tenantId);
    expect(after).toMatchObject({
      status: "active",
      plan_id: pro.id,
      plan_price_id: pro.priceId,
      provider_subscription_ref: ref,
    });

    const [processed] = await paymentEvents(owner, eventId);
    expect(processed).toMatchObject({
      status: "processed",
      tenant_id: tenantId,
      attempts: 1,
    });

    const [event] = await asPlatform(owner, (tx) =>
      tx<{ source: string; from_status: string; to_status: string; payment_event_id: string }[]>`
        select source, from_status, to_status, payment_event_id
        from subscription_event
        where tenant_id = ${tenantId}
        order by created_at desc limit 1
      `,
    );
    expect(event).toEqual({
      source: "webhook",
      from_status: "trialing",
      to_status: "active",
      payment_event_id: received?.id,
    });

    const invoices = await bodyOf(
      await call("GET", "/api/billing/invoices", { cookie: user.cookie }),
    );
    expect(invoices.invoices).toMatchObject([
      {
        status: "paid",
        amountCents: 29900,
        paymentMethod: "card",
        hostedUrl: "https://pagamento.test/fatura/1",
      },
    ]);

    expect(templates()).toEqual(["payment-received"]);
  });

  it("recusa checkout sem perfil de faturamento", async () => {
    const person = await createUser(owner);
    await createTenant(person);

    const response = await call("POST", "/api/billing/checkout", {
      cookie: person.cookie,
      body: { planPriceId: basic.priceId, method: "card" },
    });

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("BILLING_PROFILE_REQUIRED");
  });

  it("em unpaid, não troca de provedor com a assinatura antiga viva", async () => {
    await subscribe(tenantId);
    await updateSubscription(owner, tenantId, {
      status: "unpaid",
      provider: "asaas",
    });

    const response = await call("POST", "/api/billing/checkout", {
      cookie: user.cookie,
      body: { planPriceId: basic.priceId, method: "card" },
    });

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("PROVIDER_MISMATCH");
  });

  it("checkout abandonado sem assinatura prévia não concede o plano", async () => {
    const person = await createUser(owner);
    const tenant = await createTenant(person, "Sem Assinatura");
    await asPlatform(owner, (tx) =>
      tx`delete from subscription where tenant_id = ${tenant.id}`,
    );
    await call("PUT", "/api/billing/profile", { cookie: person.cookie, body: PROFILE });

    const checkout = await call("POST", "/api/billing/checkout", {
      cookie: person.cookie,
      body: { planPriceId: featured.priceId, method: "card" },
    });
    expect(checkout.status).toBe(200);

    const me = await bodyOf(await call("GET", "/api/me", { cookie: person.cookie }));
    expect(me.features).toEqual([]);
  });

  it("recusa forma de pagamento que o provedor não tem", async () => {
    stub.capabilities.recurringPix = false;

    const response = await call("POST", "/api/billing/checkout", {
      cookie: user.cookie,
      body: { planPriceId: basic.priceId, method: "pix" },
    });

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("METHOD_NOT_AVAILABLE");
  });

  it("quem já paga troca de plano, não abre outro checkout", async () => {
    await subscribe(tenantId);

    const response = await call("POST", "/api/billing/checkout", {
      cookie: user.cookie,
      body: { planPriceId: pro.priceId, method: "card" },
    });

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("CHECKOUT_NOT_ALLOWED");
  });

  it("repete o cliente do provedor em vez de criar outro", async () => {
    const body = { planPriceId: basic.priceId, method: "card" };

    await call("POST", "/api/billing/checkout", { cookie: user.cookie, body });
    await call("POST", "/api/billing/checkout", { cookie: user.cookie, body });

    expect(stub.calls.ensureCustomer).toHaveLength(1);
  });

  it("clique duplo gera a mesma chave de idempotência", async () => {
    const body = { planPriceId: basic.priceId, method: "card" };

    await call("POST", "/api/billing/checkout", { cookie: user.cookie, body });
    await call("POST", "/api/billing/checkout", { cookie: user.cookie, body });

    const keys = (stub.calls.createCheckout ?? []).map(
      ([, input]) => (input as { idempotencyKey: string }).idempotencyKey,
    );
    expect(new Set(keys).size).toBe(1);
  });

  it("erro do provedor chega genérico ao cliente", async () => {
    setProvidersForTests([
      createStubProvider({
        createCheckout: async () => {
          throw new Error("sk_live_vazou fulano@tenant-test.bizu.local");
        },
      }),
    ]);

    const response = await call("POST", "/api/billing/checkout", {
      cookie: user.cookie,
      body: { planPriceId: basic.priceId, method: "card" },
    });
    const text = await response.clone().text();

    expect(response.status).toBe(502);
    expect(text).not.toContain("sk_live");
    expect(text).not.toContain("fulano");
  });

  it("checkout inline: fatura local, polling e confirmação pelo webhook", async () => {
    const invoiceRef = `in_${randomUUID()}`;
    setProvidersForTests([
      createStubProvider({
        createCheckout: async () => ({
          kind: "inline",
          pixPayload: "00020126pix-copia-e-cola",
          expiresAt: new Date(Date.now() + 3_600_000),
          invoiceRef,
        }),
      }),
    ]);

    const checkout = await bodyOf(
      await call("POST", "/api/billing/checkout", {
        cookie: user.cookie,
        body: { planPriceId: pro.priceId, method: "pix" },
      }),
    );
    expect(checkout).toMatchObject({
      kind: "inline",
      pixPayload: "00020126pix-copia-e-cola",
    });

    const path = `/api/billing/invoices/${checkout.invoiceId}`;
    const open = await bodyOf(await call("GET", path, { cookie: user.cookie }));
    expect(open.invoice).toMatchObject({
      status: "open",
      amountCents: 29900,
      paymentMethod: "pix",
      pixPayload: "00020126pix-copia-e-cola",
    });

    const row = await subscriptionState(owner, tenantId);
    await sendWebhook([
      {
        type: "invoice.paid",
        invoiceRef,
        amountCents: 29900,
        method: "pix",
        paidAt: new Date().toISOString(),
        metadata: { subscriptionId: row.id, planPriceId: pro.priceId },
      },
    ]);
    await drain();

    const paid = await bodyOf(await call("GET", path, { cookie: user.cookie }));
    expect(paid.invoice).toMatchObject({ status: "paid" });
    expect((await subscriptionState(owner, tenantId)).status).toBe("active");
  });
});

describe("recebimento do webhook", () => {
  it("duplicado responde 200, não enfileira e não aplica de novo", async () => {
    await subscribe(tenantId);
    const id = `evt_${randomUUID()}`;
    const events = [
      {
        type: "invoice.payment_failed",
        invoiceRef: `in_${randomUUID()}`,
        subscriptionRef: (await subscriptionState(owner, tenantId))
          .provider_subscription_ref,
        reason: "recusado",
        amountCents: 9900,
      },
    ];

    await sendWebhook(events, { id });
    await drain();
    mail.sent.length = 0;

    const again = await sendWebhook(events, { id });

    expect(again.status).toBe(200);
    expect(await bodyOf(again)).toEqual({ received: true, status: "duplicate" });
    expect(queued).toEqual([]);
    expect(await paymentEvents(owner, id)).toHaveLength(1);
    expect(mail.sent).toEqual([]);
  });

  it("reenvio de evento parado na caixa volta para a fila", async () => {
    const id = `evt_${randomUUID()}`;

    await sendWebhook([{ type: "ignored", reason: "x" }], { id });
    queued.length = 0; // a fila caiu antes do job

    const again = await sendWebhook([{ type: "ignored", reason: "x" }], { id });

    expect(again.status).toBe(200);
    expect(queued).toHaveLength(1);
  });

  it("assinatura inválida: 400, rastro sem corpo e sem segredo", async () => {
    const before = await asPlatform(owner, (tx) =>
      tx`select id from payment_event where provider = ${STUB_ID} and verified = false`,
    );

    const response = await sendWebhook(
      [{ type: "invoice.paid", invoiceRef: "in_forjada" }],
      { signature: "errada" },
    );

    expect(response.status).toBe(400);
    expect(queued).toEqual([]);

    const rows = await asPlatform(owner, (tx) =>
      tx<{ id: string; status: string; raw: unknown; headers: object; error: string }[]>`
        select id, status, raw, headers, error from payment_event
        where provider = ${STUB_ID} and verified = false
        order by received_at desc
      `,
    );
    expect(rows).toHaveLength(before.length + 1);
    expect(rows[0]).toMatchObject({
      status: "failed",
      raw: null,
      error: "invalid_signature",
    });
    expect(JSON.stringify(rows[0]?.headers)).not.toContain("segredo");
  });

  it("evento verificado não grava cabeçalho com segredo", async () => {
    const id = `evt_${randomUUID()}`;
    await sendWebhook([{ type: "ignored", reason: "x" }], { id });

    const [row] = await paymentEvents(owner, id);

    expect(row?.headers).toEqual({
      "content-type": "application/json",
      "user-agent": "stub/1.0",
    });
  });

  it("20 assinaturas erradas por minuto bloqueiam o IP, sem gravar mais", async () => {
    const ip = "10.77.0.1";

    for (let i = 0; i < 20; i += 1) {
      const response = await sendWebhook([], { signature: "errada", ip });
      expect(response.status).toBe(400);
    }

    const blocked = await sendWebhook([], { signature: "errada", ip });
    expect(blocked.status).toBe(429);
  });

  it("assinatura válida passa mesmo com o IP bloqueado por forjadores", async () => {
    const ip = "10.77.0.4";

    for (let i = 0; i < 21; i += 1) {
      await sendWebhook([], { signature: "errada", ip });
    }

    const legit = await sendWebhook([{ type: "ignored", reason: "x" }], { ip });

    expect(legit.status).toBe(200);
  });

  it("volume legítimo do mesmo IP não é limitado", async () => {
    const ip = "10.77.0.2";

    for (let i = 0; i < 25; i += 1) {
      const response = await sendWebhook([{ type: "ignored", reason: "x" }], { ip });
      expect(response.status).toBe(200);
    }
  });

  it("corpo acima de 1 MB é recusado", async () => {
    const response = await sendWebhook([{ padding: "x".repeat(1024 * 1024 + 1) }]);

    expect(response.status).toBe(413);
  });

  it("provedor fora de PAYMENT_PROVIDERS é 404, sem gravar nada", async () => {
    const response = await sendWebhook([], { provider: "asaas" });

    expect(response.status).toBe(404);
  });

  it("corpo verificado que não é JSON é 400", async () => {
    setProvidersForTests([
      createStubProvider({
        verifyWebhook: async () => ({ ok: true, eventId: "x" }),
      }),
    ]);

    const response = await api.request(`/api/webhooks/payments/${STUB_ID}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-Forwarded-For": "10.77.0.3" },
      body: "isto não é json",
    });

    expect(response.status).toBe(400);
  });
});

describe("job webhook.process", () => {
  it("evento sem assinatura conhecida fica ignored", async () => {
    const id = `evt_${randomUUID()}`;
    await sendWebhook(
      [
        {
          type: "invoice.paid",
          invoiceRef: `in_${randomUUID()}`,
          subscriptionRef: "sub_de_outro_sistema",
          amountCents: 100,
          paidAt: new Date().toISOString(),
        },
      ],
      { id },
    );

    expect(await drain()).toEqual(["ignored"]);
    expect((await paymentEvents(owner, id))[0]?.status).toBe("ignored");
  });

  it("metadados apontando para assinatura de outro provedor não valem", async () => {
    const row = await subscriptionState(owner, tenantId);
    await updateSubscription(owner, tenantId, { provider: null });

    await sendWebhook([
      {
        type: "invoice.paid",
        invoiceRef: `in_${randomUUID()}`,
        amountCents: 100,
        paidAt: new Date().toISOString(),
        metadata: { subscriptionId: row.id },
      },
    ]);

    expect(await drain()).toEqual(["ignored"]);
    expect((await subscriptionState(owner, tenantId)).status).toBe("trialing");
  });

  it("fora de ordem: falha antiga depois do pagamento não derruba", async () => {
    const ref = await subscribe(tenantId);
    const row = await subscriptionState(owner, tenantId);
    const now = Date.now();

    await sendWebhook([
      {
        type: "subscription.updated",
        subscriptionRef: ref,
        status: "active",
        occurredAt: new Date(now).toISOString(),
        currentPeriodEnd: new Date(now + 40 * 86_400_000).toISOString(),
      },
    ]);
    await drain();

    const id = `evt_${randomUUID()}`;
    await sendWebhook(
      [
        {
          type: "invoice.payment_failed",
          invoiceRef: `in_${randomUUID()}`,
          subscriptionRef: ref,
          reason: "x",
          occurredAt: new Date(now - 60_000).toISOString(),
        },
      ],
      { id },
    );

    expect(await drain()).toEqual(["ignored"]);
    expect((await subscriptionState(owner, tenantId)).status).toBe(row.status);
    expect(templates()).not.toContain("payment-failed");
  });

  it("transição repetida marca ignored e não repete e-mail", async () => {
    const ref = await subscribe(tenantId);
    const invoiceRef = `in_${randomUUID()}`;
    const paid = {
      type: "invoice.paid",
      invoiceRef,
      subscriptionRef: ref,
      amountCents: 9900,
      paidAt: new Date().toISOString(),
    };

    await sendWebhook([paid]);
    expect(await drain()).toEqual(["processed"]);
    mail.sent.length = 0;

    await sendWebhook([paid]);

    expect(await drain()).toEqual(["ignored"]);
    expect(mail.sent).toEqual([]);
  });

  it("past_due por falha, com carência e e-mail", async () => {
    const ref = await subscribe(tenantId);
    mail.sent.length = 0;

    await sendWebhook([
      {
        type: "invoice.payment_failed",
        invoiceRef: `in_${randomUUID()}`,
        subscriptionRef: ref,
        reason: "recusado",
        amountCents: 9900,
        attempt: 2,
      },
    ]);
    await drain();

    const row = await subscriptionState(owner, tenantId);
    const graceMs = (row.grace_until?.getTime() ?? 0) - Date.now();

    expect(row.status).toBe("past_due");
    expect(Math.round(graceMs / 86_400_000)).toBe(7);
    expect(await accessModeOf(owner, tenantId)).toBe("full");
    expect(templates()).toEqual(["payment-failed"]);

    const me = await bodyOf(await call("GET", "/api/me", { cookie: user.cookie }));
    expect(me.billing).toMatchObject({ state: "past_due" });
  });

  it("past_due antes da fatura: o e-mail de falha sai igual, uma vez", async () => {
    const ref = await subscribe(tenantId);
    const invoiceRef = `in_${randomUUID()}`;
    const failed = {
      type: "invoice.payment_failed",
      invoiceRef,
      subscriptionRef: ref,
      reason: "recusado",
      amountCents: 9900,
    };
    mail.sent.length = 0;

    await sendWebhook([
      { type: "subscription.updated", subscriptionRef: ref, status: "past_due" },
    ]);
    await drain();
    expect((await subscriptionState(owner, tenantId)).status).toBe("past_due");
    expect(mail.sent).toEqual([]);

    await sendWebhook([failed]);
    await sendWebhook([{ ...failed, attempt: 2 }]);
    await drain();

    expect(templates()).toEqual(["payment-failed"]);
  });

  it("invoice.created grava a fatura e avisa uma vez só", async () => {
    const ref = await subscribe(tenantId);
    const invoiceRef = `in_${randomUUID()}`;
    mail.sent.length = 0;

    const created = {
      type: "invoice.created",
      invoiceRef,
      subscriptionRef: ref,
      amountCents: 9900,
      dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    };

    await sendWebhook([created]);
    await sendWebhook([{ ...created, hostedUrl: "https://pagamento.test/f" }]);
    await drain();

    expect(templates()).toEqual(["invoice-created"]);

    const { invoices } = (await bodyOf(
      await call("GET", "/api/billing/invoices", { cookie: user.cookie }),
    )) as unknown as { invoices: { status: string; hostedUrl: string }[] };

    expect(invoices[0]).toMatchObject({
      status: "open",
      hostedUrl: "https://pagamento.test/f",
    });
  });

  it("hosted_url que não é https não entra", async () => {
    const ref = await subscribe(tenantId);

    await sendWebhook([
      {
        type: "invoice.created",
        invoiceRef: `in_${randomUUID()}`,
        subscriptionRef: ref,
        amountCents: 9900,
        hostedUrl: "javascript:alert(1)",
      },
    ]);
    await drain();

    const { invoices } = (await bodyOf(
      await call("GET", "/api/billing/invoices", { cookie: user.cookie }),
    )) as unknown as { invoices: { hostedUrl: string | null }[] };

    expect(invoices[0]?.hostedUrl).toBeNull();
  });

  it("segundo checkout pago: fica o alerta, sem trocar a assinatura", async () => {
    const ref = await subscribe(tenantId);
    const row = await subscriptionState(owner, tenantId);

    await sendWebhook([
      {
        type: "invoice.paid",
        invoiceRef: `in_${randomUUID()}`,
        subscriptionRef: "sub_segundo",
        amountCents: 9900,
        paidAt: new Date().toISOString(),
        metadata: { subscriptionId: row.id },
      },
    ]);
    await drain();

    const after = await subscriptionState(owner, tenantId);
    expect(after.provider_subscription_ref).toBe(ref);
    expect(after.metadata.alert?.kind).toBe("duplicate_subscription");
  });

  it("reativação troca a assinatura e cancela a antiga no provedor", async () => {
    const old = await subscribe(tenantId);
    const row = await subscriptionState(owner, tenantId);
    await updateSubscription(owner, tenantId, { status: "unpaid" });
    await owner`update organization set access_mode = 'read_only' where id = ${tenantId}`;

    const fresh = subscriptionRef();
    await sendWebhook([
      {
        type: "invoice.paid",
        invoiceRef: `in_${randomUUID()}`,
        subscriptionRef: fresh,
        amountCents: 29900,
        paidAt: new Date().toISOString(),
        metadata: { subscriptionId: row.id, planPriceId: pro.priceId },
      },
    ]);
    await drain();

    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      status: "active",
      plan_id: pro.id,
      provider_subscription_ref: fresh,
    });
    expect(await accessModeOf(owner, tenantId)).toBe("full");
    expect(stub.calls.cancelSubscription?.[0]?.slice(1)).toEqual([
      old,
      { atPeriodEnd: false },
    ]);
  });

  it("falha ao cancelar a assinatura substituída vira alerta", async () => {
    await subscribe(tenantId);
    const row = await subscriptionState(owner, tenantId);
    await updateSubscription(owner, tenantId, { status: "unpaid" });
    setProvidersForTests([
      createStubProvider({
        cancelSubscription: async () => {
          throw new Error("provedor fora do ar");
        },
      }),
    ]);

    await sendWebhook([
      {
        type: "invoice.paid",
        invoiceRef: `in_${randomUUID()}`,
        subscriptionRef: subscriptionRef(),
        amountCents: 9900,
        paidAt: new Date().toISOString(),
        metadata: { subscriptionId: row.id },
      },
    ]);
    await drain();

    const after = await subscriptionState(owner, tenantId);
    expect(after.status).toBe("active");
    expect(after.metadata.alert?.kind).toBe("duplicate_subscription");
  });

  it("suspensão vence: pagamento não destrava tenant locked", async () => {
    await owner`update organization set access_mode = 'locked' where id = ${tenantId}`;
    await subscribe(tenantId);

    expect(await accessModeOf(owner, tenantId)).toBe("locked");
    await owner`update organization set access_mode = 'full' where id = ${tenantId}`;
  });

  it("subscription.canceled do provedor encerra e avisa", async () => {
    const ref = await subscribe(tenantId);
    mail.sent.length = 0;

    await sendWebhook([{ type: "subscription.canceled", subscriptionRef: ref }]);
    await drain();

    expect((await subscriptionState(owner, tenantId)).status).toBe("canceled");
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");
    expect(templates()).toEqual(["subscription-canceled"]);
  });

  it("troca de plano no portal do provedor chega por subscription.updated", async () => {
    const ref = await subscribe(tenantId);

    await sendWebhook([
      {
        type: "subscription.updated",
        subscriptionRef: ref,
        status: "active",
        priceRef: pro.priceRef,
      },
    ]);
    await drain();

    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      plan_id: pro.id,
      plan_price_id: pro.priceId,
    });
  });

  it("reembolso total marca a fatura; parcial só audita", async () => {
    const ref = await subscribe(tenantId);
    const invoiceRef = `in_${randomUUID()}`;

    await sendWebhook([
      {
        type: "invoice.paid",
        invoiceRef,
        subscriptionRef: ref,
        amountCents: 9900,
        paidAt: new Date().toISOString(),
      },
    ]);
    await sendWebhook([
      { type: "refund.completed", invoiceRef, amountCents: 1000 },
    ]);
    await drain();

    const statusOf = async () => {
      const [row] = await asPlatform(owner, (tx) =>
        tx<{ status: string }[]>`
          select status from invoice where provider_ref = ${invoiceRef}
        `,
      );
      return row?.status;
    };

    expect(await statusOf()).toBe("paid");

    await sendWebhook([
      { type: "refund.completed", invoiceRef, amountCents: 9900 },
    ]);
    await drain();

    expect(await statusOf()).toBe("refunded");
  });

  it("chargeback deixa alerta para o admin", async () => {
    const ref = await subscribe(tenantId);
    const invoiceRef = `in_${randomUUID()}`;

    await sendWebhook([
      {
        type: "invoice.paid",
        invoiceRef,
        subscriptionRef: ref,
        amountCents: 9900,
        paidAt: new Date().toISOString(),
      },
    ]);
    await sendWebhook([{ type: "chargeback.opened", invoiceRef }]);
    await drain();

    expect(
      (await subscriptionState(owner, tenantId)).metadata.alert?.kind,
    ).toBe("chargeback");
  });

  it("enrichEvent falha, o evento fica failed e o erro sobe para o retry", async () => {
    setProvidersForTests([
      createStubProvider({
        enrichEvent: async () => {
          throw new Error("provedor fora do ar: fulano@tenant-test.bizu.local");
        },
      }),
    ]);
    const id = `evt_${randomUUID()}`;
    await sendWebhook([{ type: "ignored", reason: "x" }], { id });
    const [row] = await paymentEvents(owner, id);

    await expect(processPaymentEvent(row?.id ?? "")).rejects.toThrow();

    const [failed] = await paymentEvents(owner, id);
    expect(failed).toMatchObject({ status: "failed", attempts: 1 });
    expect(failed?.error).not.toContain("fulano");
  });

  it("o mesmo evento em dois jobs ao mesmo tempo só aplica uma vez", async () => {
    const ref = await subscribe(tenantId);
    const id = `evt_${randomUUID()}`;
    mail.sent.length = 0;

    await sendWebhook(
      [
        {
          type: "invoice.paid",
          invoiceRef: `in_${randomUUID()}`,
          subscriptionRef: ref,
          amountCents: 9900,
          paidAt: new Date().toISOString(),
        },
      ],
      { id },
    );
    const [row] = await paymentEvents(owner, id);
    queued.length = 0;

    const outcomes = await Promise.all([
      processPaymentEvent(row?.id ?? ""),
      processPaymentEvent(row?.id ?? ""),
    ]);

    expect(outcomes.sort()).toEqual(["processed", "skipped"]);
    expect(templates()).toEqual(["payment-received"]);
    expect((await paymentEvents(owner, id))[0]?.status).toBe("processed");
  });

  it("eventos diferentes da mesma assinatura em paralelo não se atropelam", async () => {
    const ref = await subscribe(tenantId);
    const paid = (invoiceRef: string) => ({
      type: "invoice.paid",
      invoiceRef,
      subscriptionRef: ref,
      amountCents: 9900,
      paidAt: new Date().toISOString(),
    });

    await sendWebhook([paid(`in_${randomUUID()}`)]);
    await sendWebhook([paid(`in_${randomUUID()}`)]);
    await sendWebhook([
      {
        type: "invoice.created",
        invoiceRef: `in_${randomUUID()}`,
        subscriptionRef: ref,
        amountCents: 9900,
      },
    ]);

    const outcomes = await Promise.all(
      queued.splice(0).map((id) => processPaymentEvent(id)),
    );

    expect(outcomes).toEqual(["processed", "processed", "processed"]);

    const invoices = await asPlatform(owner, (tx) =>
      tx`select id from invoice where tenant_id = ${tenantId}`,
    );
    expect(invoices).toHaveLength(4);
  });

  it("job repetido em evento já processado não faz nada", async () => {
    const id = `evt_${randomUUID()}`;
    await sendWebhook([{ type: "ignored", reason: "x" }], { id });
    const [row] = await paymentEvents(owner, id);

    await drain();

    expect(await processPaymentEvent(row?.id ?? "")).toBe("skipped");
    expect((await paymentEvents(owner, id))[0]?.attempts).toBe(1);
  });

  it("evento não verificado nunca é aplicado", async () => {
    const [row] = await asPlatform(owner, (tx) =>
      tx<{ id: string }[]>`
        insert into payment_event (provider, provider_event_id, raw, verified, status)
        values (${STUB_ID}, ${`evt_${randomUUID()}`},
                ${tx.json({ events: [] })}, false, 'failed')
        returning id
      `,
    );

    expect(await processPaymentEvent(row?.id ?? "")).toBe("skipped");
  });
});

describe("verificação só por token: confiar, mas conferir", () => {
  let tokenStub: StubProvider;

  beforeEach(() => {
    tokenStub = createStubProvider();
    tokenStub.capabilities.webhookSignature = "token";
    setProvidersForTests([tokenStub]);
  });

  async function paidEvent() {
    const invoiceRef = `in_${randomUUID()}`;
    const row = await subscriptionState(owner, tenantId);
    await updateSubscription(owner, tenantId, { provider: STUB_ID });

    await sendWebhook([
      {
        type: "invoice.paid",
        invoiceRef,
        amountCents: 1,
        paidAt: new Date().toISOString(),
        metadata: { subscriptionId: row.id, planPriceId: pro.priceId },
      },
    ]);

    return invoiceRef;
  }

  it("a API do provedor nega: o evento não vale", async () => {
    const ref = await paidEvent();
    tokenStub.remoteInvoice = {
      ref,
      status: "open",
      amountCents: 29900,
      currency: "BRL",
    };

    expect(await drain()).toEqual(["ignored"]);
    expect((await subscriptionState(owner, tenantId)).status).toBe("trialing");
  });

  it("fatura paga de verdade, com metadados de outro tenant, não ativa a vítima", async () => {
    const ref = await paidEvent();
    // A API não reconhece esta fatura como do tenant citado no corpo.
    tokenStub.remoteInvoice = {
      ref,
      status: "paid",
      amountCents: 29900,
      currency: "BRL",
      subscriptionRef: "sub_de_quem_pagou",
    };

    expect(await drain()).toEqual(["ignored"]);
    expect((await subscriptionState(owner, tenantId)).status).toBe("trialing");
  });

  it("a API confirma: vale o valor dela, não o do corpo", async () => {
    const ref = await paidEvent();
    const row = await subscriptionState(owner, tenantId);
    tokenStub.remoteInvoice = {
      ref,
      status: "paid",
      amountCents: 29900,
      currency: "BRL",
      metadata: { subscriptionId: row.id, planPriceId: pro.priceId },
    };

    await drain();

    expect((await subscriptionState(owner, tenantId)).status).toBe("active");
    const [invoice] = await asPlatform(owner, (tx) =>
      tx<{ amount_cents: number }[]>`
        select amount_cents from invoice where provider_ref = ${ref}
      `,
    );
    expect(invoice?.amount_cents).toBe(29900);
  });

  it("a API fora do ar: falha para tentar de novo, sem aplicar", async () => {
    await paidEvent();
    const [id] = queued.splice(0);

    await expect(processPaymentEvent(id ?? "")).rejects.toThrow();
    expect((await subscriptionState(owner, tenantId)).status).toBe("trialing");
  });
});

describe("reprocessamento pelo admin", () => {
  it("reenfileira o que falhou, e o evento volta a valer", async () => {
    const platformOwner = await makePlatformUser(owner, "platform_owner");
    const ref = await subscribe(tenantId);
    const failing = createStubProvider({
      parseWebhook: () => {
        throw new Error("parser quebrado");
      },
    });
    setProvidersForTests([failing]);

    const id = `evt_${randomUUID()}`;
    await sendWebhook([{ type: "subscription.canceled", subscriptionRef: ref }], { id });
    const [row] = await paymentEvents(owner, id);

    await expect(processPaymentEvent(row?.id ?? "")).rejects.toThrow();
    queued.length = 0;

    const list = await bodyOf(
      await call("GET", "/api/admin/webhooks?status=failed", {
        cookie: platformOwner.cookie,
      }),
    );
    const items = list.items as { id: string; raw?: unknown }[];
    const listed = items.find((item) => item.id === row?.id);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty("raw");

    setProvidersForTests([stub]);

    const response = await call(
      "POST",
      `/api/admin/webhooks/${row?.id}/reprocess`,
      { cookie: platformOwner.cookie },
    );
    expect(response.status).toBe(200);
    expect(queued).toEqual([row?.id]);
    expect((await paymentEvents(owner, id))[0]?.status).toBe("pending");

    expect(await drain()).toEqual(["processed"]);
    expect((await subscriptionState(owner, tenantId)).status).toBe("canceled");
  });

  it("evento processado não reprocessa: duplicaria e-mail", async () => {
    const platformOwner = await makePlatformUser(owner, "platform_owner");
    const ref = await subscribe(tenantId);
    const id = `evt_${randomUUID()}`;

    await sendWebhook(
      [
        {
          type: "invoice.paid",
          invoiceRef: `in_${randomUUID()}`,
          subscriptionRef: ref,
          amountCents: 9900,
          paidAt: new Date().toISOString(),
        },
      ],
      { id },
    );
    await drain();
    const [row] = await paymentEvents(owner, id);

    const response = await call(
      "POST",
      `/api/admin/webhooks/${row?.id}/reprocess`,
      { cookie: platformOwner.cookie },
    );

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("NOT_REPROCESSABLE");
  });

  it("evento que falhou na assinatura nunca reprocessa", async () => {
    const platformOwner = await makePlatformUser(owner, "platform_owner");
    const [row] = await asPlatform(owner, (tx) =>
      tx<{ id: string }[]>`
        insert into payment_event (provider, provider_event_id, verified, status)
        values (${STUB_ID}, ${`rejected:${randomUUID()}`}, false, 'failed')
        returning id
      `,
    );

    const response = await call(
      "POST",
      `/api/admin/webhooks/${row?.id}/reprocess`,
      { cookie: platformOwner.cookie },
    );

    expect(response.status).toBe(409);
  });
});
