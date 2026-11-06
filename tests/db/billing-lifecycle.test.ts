import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  runBillingDunning,
  runBillingPeriodEnd,
  runBillingReconcile,
} from "@/jobs/billing";
import { processPaymentEvent } from "@/jobs/webhooks";
import { getDb } from "@/db";
import { withTenant } from "@/db/rls";
import { billingProfile, invoice, paymentEvent } from "@/db/schema";
import { setWebhookQueueForTests } from "@/lib/billing/inbox";
import { DAY_MS } from "@/lib/billing/trial";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import { createMemoryEmailStore } from "@/lib/email/store";
import { setProvidersForTests } from "@/lib/payments/registry";
import {
  accessModeOf,
  asPlatform,
  bodyOf,
  cleanUpBilling,
  createPaidPlan,
  createPlanRow,
  createStubProvider,
  hideFreePlans,
  makePlatformUser,
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
  addMember,
  call,
  cleanUp,
  connectOwner,
  createTenant,
  createUser,
  type TestUser,
} from "./tenant-helpers";

/**
 * Depois de ativa: dunning, fim do período, troca de plano, reconciliação, leitura pelo
 * owner, `read_only` e isolamento das tabelas novas.
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
let user: TestUser;
let tenantId: string;
let ref: string;

const only = () => ({ tenantIds: [tenantId] });
const templates = () => mail.sent.map((message) => message.tags?.template);
const inDays = (days: number, from = Date.now()) => new Date(from + days * DAY_MS);

async function drain() {
  for (const id of queued.splice(0)) await processPaymentEvent(id);
}

async function activeTenant() {
  const person = await createUser(owner);
  const tenant = await createTenant(person);
  await call("PUT", "/api/billing/profile", { cookie: person.cookie, body: PROFILE });

  const subscriptionRef = `sub_${randomUUID()}`;
  await updateSubscription(owner, tenant.id, {
    provider: STUB_ID,
    provider_customer_ref: `cus_${randomUUID()}`,
  });
  const row = await subscriptionState(owner, tenant.id);

  await sendWebhook([
    {
      type: "invoice.paid",
      invoiceRef: `in_${randomUUID()}`,
      subscriptionRef,
      amountCents: 9900,
      paidAt: new Date().toISOString(),
      periodStart: inDays(-1).toISOString(),
      periodEnd: inDays(29).toISOString(),
      metadata: { subscriptionId: row.id, planPriceId: basic.priceId },
    },
  ]);
  await drain();

  return { person, tenantId: tenant.id, subscriptionRef };
}

beforeAll(async () => {
  owner = connectOwner();
  saved = await saveSettings(owner);
  showFreePlans = await hideFreePlans(owner);
  basic = await createPaidPlan(owner, 9900);
  pro = await createPaidPlan(owner, 29900);
  await setSettings(owner, { trialPlanId: basic.id, trialDays: 14, graceDays: 7 });
  setEmailProviderForTests(mail);
  setWebhookQueueForTests(async (id) => {
    queued.push(id);
  });
});

beforeEach(async () => {
  stub = createStubProvider();
  setProvidersForTests([stub]);
  ({ person: user, tenantId, subscriptionRef: ref } = await activeTenant());
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

describe("billing.dunning", () => {
  async function pastDue(graceUntil: Date) {
    await updateSubscription(owner, tenantId, {
      status: "past_due",
      grace_until: graceUntil,
    });
  }

  it("avisa em T-3 e em T0, uma vez cada", async () => {
    const graceUntil = inDays(10);
    await pastDue(graceUntil);

    expect((await runBillingDunning(inDays(1), only())).notices.t3).toBe(0);

    const t3 = await runBillingDunning(inDays(7.5), only());
    const again = await runBillingDunning(inDays(7.6), only());
    const t0 = await runBillingDunning(inDays(9.5), only());

    expect(t3.notices.t3).toBe(1);
    expect(again.notices.t3).toBe(0);
    expect(t0.notices.t0).toBe(1);
    expect(templates()).toEqual(["payment-failed", "payment-failed"]);
    expect((await subscriptionState(owner, tenantId)).status).toBe("past_due");
  });

  it("vencida a carência: unpaid, read_only e aviso, sem repetir", async () => {
    await pastDue(inDays(-1));

    const first = await runBillingDunning(new Date(), only());
    const second = await runBillingDunning(new Date(), only());

    expect(first.unpaid).toBe(1);
    expect(second.unpaid).toBe(0);
    expect((await subscriptionState(owner, tenantId)).status).toBe("unpaid");
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");
    expect(templates()).toEqual(["payment-failed"]);

    const [event] = await asPlatform(owner, (tx) =>
      tx<{ to_status: string; source: string; reason: string }[]>`
        select to_status, source, reason from subscription_event
        where tenant_id = ${tenantId} order by created_at desc limit 1
      `,
    );
    expect(event).toEqual({
      to_status: "unpaid",
      source: "job",
      reason: "grace_expired",
    });
  });

  it("tenant suspenso não é tocado, e a suspensão continua", async () => {
    await pastDue(inDays(-1));
    await owner`
      update organization set status = 'suspended', access_mode = 'locked'
      where id = ${tenantId}
    `;

    expect((await runBillingDunning(new Date(), only())).unpaid).toBe(0);
    expect(await accessModeOf(owner, tenantId)).toBe("locked");

    await owner`
      update organization set status = 'active', access_mode = 'full'
      where id = ${tenantId}
    `;
  });

  it("pagar limpa os avisos: a próxima falha avisa de novo", async () => {
    await pastDue(inDays(2));
    await runBillingDunning(new Date(), only());
    expect(
      (await subscriptionState(owner, tenantId)).metadata.dunningNotices?.t3,
    ).toBeDefined();

    await sendWebhook([
      {
        type: "invoice.paid",
        invoiceRef: `in_${randomUUID()}`,
        subscriptionRef: ref,
        amountCents: 9900,
        paidAt: new Date().toISOString(),
      },
    ]);
    await drain();

    const after = await subscriptionState(owner, tenantId);
    expect(after.status).toBe("active");
    expect(after.grace_until).toBeNull();
    expect(after.metadata.dunningNotices).toBeUndefined();
  });

  it("falha no envio devolve o aviso e o job tenta de novo", async () => {
    await pastDue(inDays(2));
    const store = createMemoryEmailStore();
    store.createMessage = async () => {
      throw new Error("fila fora do ar");
    };
    setEmailProviderForTests(mail, { store });

    await expect(runBillingDunning(new Date(), only())).rejects.toThrow(
      /1 tenant/,
    );
    setEmailProviderForTests(mail);

    expect(
      (await subscriptionState(owner, tenantId)).metadata.dunningNotices?.t3,
    ).toBeUndefined();

    const retry = await runBillingDunning(new Date(), only());

    expect(retry.notices.t3).toBe(1);
    expect(templates()).toEqual(["payment-failed"]);
  });
});

describe("cancelamento no fim do período", () => {
  const cancel = () =>
    call("POST", "/api/billing/cancel", { cookie: user.cookie, body: {} });

  it("o owner agenda: segue ativo, o provedor sabe e o e-mail sai", async () => {
    const response = await cancel();

    expect(response.status).toBe(200);
    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      status: "active",
      cancel_at_period_end: true,
    });
    expect(stub.calls.cancelSubscription?.[0]?.slice(1)).toEqual([
      ref,
      { atPeriodEnd: true },
    ]);
    expect(templates()).toEqual(["subscription-canceled"]);
  });

  it("cancelar duas vezes não chama o provedor de novo", async () => {
    await cancel();
    await cancel();

    expect(stub.calls.cancelSubscription).toHaveLength(1);
  });

  it("o owner não cancela na hora", async () => {
    const response = await call("POST", "/api/billing/cancel", {
      cookie: user.cookie,
      body: { atPeriodEnd: false },
    });

    expect(response.status).toBe(400);
    expect(stub.calls.cancelSubscription).toBeUndefined();
  });

  it("sem plano gratuito, o job encerra e deixa só leitura", async () => {
    await cancel();
    const row = await subscriptionState(owner, tenantId);
    const end = row.current_period_end ?? new Date();

    const before = await runBillingPeriodEnd(new Date(end.getTime() - 1000), only());
    expect(before.canceled).toBe(0);

    const after = await runBillingPeriodEnd(new Date(end.getTime() + 1000), only());
    expect(after.canceled).toBe(1);
    expect((await subscriptionState(owner, tenantId)).status).toBe("canceled");
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");
  });

  it("com plano gratuito, migra para ele e segue com acesso", async () => {
    const free = await createPlanRow(owner, { isFree: true });

    await cancel();
    const end = (await subscriptionState(owner, tenantId)).current_period_end;
    await runBillingPeriodEnd(new Date((end?.getTime() ?? 0) + 1000), only());
    await owner`update plan set active = false where id = ${free.id}`;

    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      status: "active",
      plan_id: free.id,
      plan_price_id: null,
      provider_subscription_ref: null,
      cancel_at_period_end: false,
    });
    expect(await accessModeOf(owner, tenantId)).toBe("full");
  });

  it("reactivate desfaz o agendamento, aqui e no provedor", async () => {
    await cancel();

    const response = await call("POST", "/api/billing/reactivate", {
      cookie: user.cookie,
    });

    expect(response.status).toBe(200);
    expect(stub.calls.resumeSubscription).toHaveLength(1);
    expect(
      (await subscriptionState(owner, tenantId)).cancel_at_period_end,
    ).toBe(false);
  });

  it("webhook do fim do período depois do job é no-op", async () => {
    await cancel();
    const end = (await subscriptionState(owner, tenantId)).current_period_end;
    await runBillingPeriodEnd(new Date((end?.getTime() ?? 0) + 1000), only());
    mail.sent.length = 0;

    await sendWebhook([{ type: "subscription.canceled", subscriptionRef: ref }]);
    await drain();

    expect(mail.sent).toEqual([]);
  });
});

describe("troca de plano", () => {
  const change = (planPriceId: string) =>
    call("POST", "/api/billing/change-plan", {
      cookie: user.cookie,
      body: { planPriceId },
    });

  it("upgrade é imediato, com proração do provedor", async () => {
    const response = await change(pro.priceId);

    expect(response.status).toBe(200);
    expect((await bodyOf(response)).change).toMatchObject({ effectiveAt: "now" });
    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      plan_id: pro.id,
      plan_price_id: pro.priceId,
    });

    const [, , input] = (stub.calls.updateSubscription?.[0] ?? []) as [
      unknown,
      string,
      { prorate: boolean },
    ];
    expect(input.prorate).toBe(true);
  });

  it("provedor sem proração: o núcleo calcula e cobra a diferença", async () => {
    const charges: { amountCents: number; idempotencyKey: string }[] = [];
    const noProration = createStubProvider({
      chargeOnce: async (_ctx, input) => {
        charges.push(input);
        return { invoiceRef: "in_diferenca" };
      },
    });
    noProration.capabilities.proration = false;
    setProvidersForTests([noProration]);

    await change(pro.priceId);

    // 20000 de diferença, com 29 dias de 30 restantes.
    expect(charges[0]?.amountCents).toBeGreaterThan(19000);
    expect(charges[0]?.amountCents).toBeLessThan(20000);
    expect(charges[0]?.idempotencyKey).toContain("upgrade:");
  });

  it("downgrade fica agendado e o plano segue até o fim do período", async () => {
    await change(pro.priceId);

    const response = await change(basic.priceId);
    expect((await bodyOf(response)).change).toMatchObject({
      effectiveAt: "period_end",
    });

    const pending = await subscriptionState(owner, tenantId);
    expect(pending).toMatchObject({ plan_id: pro.id, pending_plan_id: basic.id });

    const [, , input] = (stub.calls.updateSubscription?.[1] ?? []) as [
      unknown,
      string,
      { prorate: boolean },
    ];
    expect(input.prorate).toBe(false);

    const end = pending.current_period_end?.getTime() ?? 0;
    const result = await runBillingPeriodEnd(new Date(end + 1000), only());

    expect(result.downgraded).toBe(1);
    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      plan_id: basic.id,
      plan_price_id: basic.priceId,
      pending_plan_id: null,
    });
  });

  it("downgrade entra também se a renovação chegar antes do job", async () => {
    await change(pro.priceId);
    await change(basic.priceId);

    await sendWebhook([
      {
        type: "invoice.paid",
        invoiceRef: `in_${randomUUID()}`,
        subscriptionRef: ref,
        amountCents: 9900,
        paidAt: new Date().toISOString(),
        periodEnd: inDays(60).toISOString(),
      },
    ]);
    await drain();

    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      plan_id: basic.id,
      plan_price_id: basic.priceId,
      pending_plan_id: null,
    });
  });

  it("subscription.updated com o preço do downgrade não antecipa o plano", async () => {
    await change(pro.priceId);
    await change(basic.priceId);

    await sendWebhook([
      {
        type: "subscription.updated",
        subscriptionRef: ref,
        status: "active",
        priceRef: basic.priceRef,
      },
    ]);
    await drain();

    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      plan_id: pro.id,
      pending_plan_id: basic.id,
    });
  });

  it("cobrança recusada no upgrade não troca o plano", async () => {
    const declined = createStubProvider({
      updateSubscription: async () => {
        throw new Error("card_declined");
      },
    });
    setProvidersForTests([declined]);

    const response = await change(pro.priceId);

    expect(response.status).toBe(502);
    expect((await subscriptionState(owner, tenantId)).plan_id).toBe(basic.id);
  });

  it("o owner desfaz o downgrade: o provedor volta ao preço atual", async () => {
    await change(pro.priceId);
    await change(basic.priceId);

    const response = await change(pro.priceId);

    expect(response.status).toBe(200);

    const after = await subscriptionState(owner, tenantId);
    expect(after).toMatchObject({ plan_id: pro.id, pending_plan_id: null });
    expect(after.metadata.pendingPlanPriceId).toBeUndefined();

    const [, , input] = (stub.calls.updateSubscription?.[2] ?? []) as [
      unknown,
      string,
      { price: { id: string }; prorate: boolean },
    ];
    expect(input.price.id).toBe(pro.priceId);
    expect(input.prorate).toBe(false);
  });

  it("com downgrade agendado, upgrade espera: prorratearia do preço menor", async () => {
    const top = await createPaidPlan(owner, 59900);
    await change(pro.priceId);
    await change(basic.priceId);

    const response = await change(top.priceId);

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("PENDING_DOWNGRADE");
    expect(stub.calls.updateSubscription).toHaveLength(2);
  });

  it("mesmo plano é recusado", async () => {
    const response = await change(basic.priceId);

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("SAME_PLAN");
  });

  it("em past_due, primeiro regulariza", async () => {
    await updateSubscription(owner, tenantId, { status: "past_due" });

    const response = await change(pro.priceId);

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("PLAN_CHANGE_NOT_ALLOWED");
  });

  it("sem assinatura no provedor, não há o que trocar", async () => {
    const person = await createUser(owner);
    await createTenant(person);

    const response = await call("POST", "/api/billing/change-plan", {
      cookie: person.cookie,
      body: { planPriceId: pro.priceId },
    });

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("NO_ACTIVE_SUBSCRIPTION");
  });
});

describe("cancelamento de assinatura pausada", () => {
  it("agenda aqui e no provedor, sem ficar pela metade", async () => {
    await call("POST", "/api/billing/pause", { cookie: user.cookie });

    const response = await call("POST", "/api/billing/cancel", {
      cookie: user.cookie,
      body: {},
    });

    expect(response.status).toBe(200);
    expect(stub.calls.cancelSubscription).toHaveLength(1);
    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      status: "paused",
      cancel_at_period_end: true,
    });
  });
});

describe("pausa e portal", () => {
  const pause = () =>
    call("POST", "/api/billing/pause", { cookie: user.cookie });
  const resume = () =>
    call("POST", "/api/billing/reactivate", { cookie: user.cookie });
  const chargeNowOf = (index: number) =>
    (stub.calls.resumeSubscription?.[index]?.[2] as { chargeNow: boolean })?.chargeNow;

  it("pausa quando capabilities.pause, e o plano não segue de graça", async () => {
    const response = await pause();

    expect(response.status).toBe(200);

    const row = await subscriptionState(owner, tenantId);
    expect(row.status).toBe("paused");
    expect(row.metadata.paidThrough).toBe(row.current_period_end?.toISOString());
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");

    const write = await call("PATCH", "/api/tenant", {
      cookie: user.cookie,
      body: { name: "Pausada" },
    });
    expect((await bodyOf(write)).code).toBe("TENANT_READ_ONLY");
  });

  it("pausada não recebe as features do plano", async () => {
    const featured = await createPaidPlan(owner, 100, { features: ["recurso_pago"] });
    await updateSubscription(owner, tenantId, { plan_id: featured.id });
    await pause();

    const me = await bodyOf(await call("GET", "/api/me", { cookie: user.cookie }));

    expect(me.features).toEqual([]);
  });

  it("retomar dentro do período pago devolve o acesso sem cobrar", async () => {
    await pause();

    const response = await resume();

    expect(response.status).toBe(200);
    expect(chargeNowOf(0)).toBe(false);
    expect((await subscriptionState(owner, tenantId)).status).toBe("active");
    expect((await subscriptionState(owner, tenantId)).metadata.paidThrough).toBeUndefined();
    expect(await accessModeOf(owner, tenantId)).toBe("full");
  });

  it("pausar antes da renovação e retomar depois dela cobra um ciclo novo", async () => {
    await pause();

    // O provedor avança o período mesmo com a fatura anulada: `paid_through` não muda.
    await sendWebhook([
      {
        type: "subscription.updated",
        subscriptionRef: ref,
        status: "paused",
        currentPeriodEnd: inDays(60).toISOString(),
      },
    ]);
    await drain();
    const row = await subscriptionState(owner, tenantId);
    await updateSubscription(owner, tenantId, {
      metadata: owner.json({ ...row.metadata, paidThrough: inDays(-1).toISOString() }),
    });

    await resume();

    expect(chargeNowOf(0)).toBe(true);
  });

  it("cobrança recusada ao retomar deixa tudo pausado", async () => {
    const declined = createStubProvider({
      resumeSubscription: async () => {
        throw new Error("card_declined");
      },
    });
    setProvidersForTests([declined]);
    await pause();
    await updateSubscription(owner, tenantId, {
      metadata: owner.json({ paidThrough: inDays(-1).toISOString() }),
    });

    const response = await resume();

    expect(response.status).toBe(502);
    expect((await subscriptionState(owner, tenantId)).status).toBe("paused");
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");
  });

  it("a reconciliação também olha as pausadas", async () => {
    await pause();
    stub.remoteSubscription = {
      ref,
      status: "canceled",
      cancelAtPeriodEnd: false,
    };

    const result = await runBillingReconcile(new Date(), only());

    expect(result.checked).toBe(1);
    expect((await subscriptionState(owner, tenantId)).status).toBe("canceled");
  });

  it("sem capabilities.pause, recusa antes de chamar o provedor", async () => {
    const noPause = createStubProvider();
    noPause.capabilities.pause = false;
    setProvidersForTests([noPause]);

    const response = await call("POST", "/api/billing/pause", {
      cookie: user.cookie,
    });

    expect(response.status).toBe(409);
    expect(noPause.calls.pauseSubscription).toBeUndefined();
  });

  it("portal devolve a URL do provedor", async () => {
    const response = await call("POST", "/api/billing/portal", {
      cookie: user.cookie,
    });

    expect(await bodyOf(response)).toEqual({
      url: "https://pagamento.test/portal",
    });
  });

  it("sem portal no provedor, 409", async () => {
    const noPortal = createStubProvider();
    noPortal.capabilities.customerPortal = false;
    setProvidersForTests([noPortal]);

    const response = await call("POST", "/api/billing/portal", {
      cookie: user.cookie,
    });

    expect(response.status).toBe(409);
  });
});

describe("billing.reconcile", () => {
  const remote = (
    status: StubProvider["remoteSubscription"] extends infer T
      ? T extends { status: infer S }
        ? S
        : never
      : never,
    extra = {},
  ) => ({
    ref,
    status,
    cancelAtPeriodEnd: false,
    ...extra,
  });

  async function inSync() {
    const row = await subscriptionState(owner, tenantId);
    stub.remoteSubscription = {
      ...remote("active"),
      currentPeriodEnd: row.current_period_end ?? undefined,
    };
    return row;
  }

  it("igual ao provedor: nenhum evento e nenhum alerta", async () => {
    await inSync();

    const result = await runBillingReconcile(new Date(), only());

    expect(result).toMatchObject({ checked: 1, diverged: 0 });
    expect(
      (await subscriptionState(owner, tenantId)).metadata.alert,
    ).toBeUndefined();
  });

  it("webhook perdido: corrige, grava evento de job e deixa alerta", async () => {
    await inSync();
    await updateSubscription(owner, tenantId, {
      status: "past_due",
      grace_until: inDays(3),
    });

    const result = await runBillingReconcile(new Date(), only());

    expect(result.diverged).toBe(1);

    const after = await subscriptionState(owner, tenantId);
    expect(after.status).toBe("active");
    expect(after.grace_until).toBeNull();
    expect(after.metadata.alert).toMatchObject({
      kind: "divergence",
      detail: "local=past_due remoto=active",
    });

    const [event] = await asPlatform(owner, (tx) =>
      tx<{ source: string; from_status: string; to_status: string }[]>`
        select source, from_status, to_status from subscription_event
        where tenant_id = ${tenantId} order by created_at desc limit 1
      `,
    );
    expect(event).toEqual({
      source: "job",
      from_status: "past_due",
      to_status: "active",
    });
  });

  it("plano trocado no provedor e webhook perdido: corrige e alerta", async () => {
    const row = await inSync();
    stub.remoteSubscription = {
      ...remote("active"),
      currentPeriodEnd: row.current_period_end ?? undefined,
      priceRef: pro.priceRef,
    };

    const result = await runBillingReconcile(new Date(), only());

    expect(result.diverged).toBe(1);
    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      status: "active",
      plan_id: pro.id,
      plan_price_id: pro.priceId,
    });
    expect(
      (await subscriptionState(owner, tenantId)).metadata.alert?.detail,
    ).toContain("plano");
  });

  it("downgrade agendado não é divergência de plano", async () => {
    await call("POST", "/api/billing/change-plan", {
      cookie: user.cookie,
      body: { planPriceId: pro.priceId },
    });
    await call("POST", "/api/billing/change-plan", {
      cookie: user.cookie,
      body: { planPriceId: basic.priceId },
    });
    const row = await subscriptionState(owner, tenantId);
    stub.remoteSubscription = {
      ...remote("active"),
      currentPeriodEnd: row.current_period_end ?? undefined,
      priceRef: basic.priceRef,
    };

    const result = await runBillingReconcile(new Date(), only());

    expect(result.diverged).toBe(0);
    expect((await subscriptionState(owner, tenantId)).plan_id).toBe(pro.id);
  });

  it("cancelada no provedor encerra aqui", async () => {
    await inSync();
    stub.remoteSubscription = remote("canceled");

    await runBillingReconcile(new Date(), only());

    expect((await subscriptionState(owner, tenantId)).status).toBe("canceled");
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");
  });

  it("provedor fora do ar em uma assinatura não para as demais e falha no fim", async () => {
    const other = await activeTenant();
    stub.remoteSubscription = undefined;

    await expect(
      runBillingReconcile(new Date(), { tenantIds: [tenantId, other.tenantId] }),
    ).rejects.toThrow(/2 assinatura/);
    expect(stub.calls.fetchSubscription).toHaveLength(2);
  });

  it("módulo ausente é pulado, sem derrubar o job", async () => {
    setProvidersForTests([]);

    const result = await runBillingReconcile(new Date(), only());

    expect(result).toMatchObject({ checked: 0, diverged: 0 });
  });

  it("/api/admin/subscriptions/:id/sync busca do provedor e audita", async () => {
    const platformOwner = await makePlatformUser(owner, "platform_owner");
    const row = await inSync();
    await updateSubscription(owner, tenantId, {
      status: "past_due",
      grace_until: inDays(3),
    });

    const response = await call(
      "POST",
      `/api/admin/subscriptions/${row.id}/sync`,
      { cookie: platformOwner.cookie },
    );

    expect(await bodyOf(response)).toEqual({ skipped: false, diverged: true });
    expect((await subscriptionState(owner, tenantId)).status).toBe("active");

    // Conferido de novo e igual: o alerta sai.
    await call("POST", `/api/admin/subscriptions/${row.id}/sync`, {
      cookie: platformOwner.cookie,
    });
    expect(
      (await subscriptionState(owner, tenantId)).metadata.alert,
    ).toBeUndefined();
  });
});

describe("admin", () => {
  it("cancela na hora, no provedor e aqui, e avisa o tenant", async () => {
    const platformOwner = await makePlatformUser(owner, "platform_owner");
    const row = await subscriptionState(owner, tenantId);
    mail.sent.length = 0;

    const response = await call(
      "POST",
      `/api/admin/subscriptions/${row.id}/cancel`,
      { cookie: platformOwner.cookie },
    );

    expect(response.status).toBe(200);
    expect(stub.calls.cancelSubscription?.[0]?.slice(1)).toEqual([
      ref,
      { atPeriodEnd: false },
    ]);
    expect((await subscriptionState(owner, tenantId)).status).toBe("canceled");
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");
    expect(templates()).toEqual(["subscription-canceled"]);

    const [event] = await asPlatform(owner, (tx) =>
      tx<{ source: string }[]>`
        select source from subscription_event
        where tenant_id = ${tenantId} order by created_at desc limit 1
      `,
    );
    expect(event?.source).toBe("admin");

    const again = await call(
      "POST",
      `/api/admin/subscriptions/${row.id}/cancel`,
      { cookie: platformOwner.cookie },
    );
    expect(again.status).toBe(409);
  });

  it("lista assinaturas por status, sem referências do provedor", async () => {
    const support = await makePlatformUser(owner, "platform_support");

    const response = await call(
      "GET",
      "/api/admin/subscriptions?status=active",
      { cookie: support.cookie },
    );
    const text = await response.clone().text();
    const body = await bodyOf(response);

    expect((body.items as { tenantId: string }[]).map((item) => item.tenantId)).toContain(
      tenantId,
    );
    expect(text).not.toContain(ref);
  });

  it("não troca o plano de quem tem assinatura viva no provedor", async () => {
    const platformOwner = await makePlatformUser(owner, "platform_owner");

    const response = await call("PUT", `/api/admin/tenants/${tenantId}/plan`, {
      cookie: platformOwner.cookie,
      body: { planId: pro.id },
    });

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("PROVIDER_SUBSCRIPTION_ACTIVE");
  });

  it("unpaid ainda é assinatura viva: não troca o plano", async () => {
    const platformOwner = await makePlatformUser(owner, "platform_owner");
    await updateSubscription(owner, tenantId, { status: "unpaid" });

    const response = await call("PUT", `/api/admin/tenants/${tenantId}/plan`, {
      cookie: platformOwner.cookie,
      body: { planId: pro.id },
    });

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("PROVIDER_SUBSCRIPTION_ACTIVE");
  });

  it("encerrada, ir para o gratuito larga o provedor e a reconciliação não desfaz", async () => {
    const platformOwner = await makePlatformUser(owner, "platform_owner");
    // Inativo: o resto do arquivo conta com nenhum plano gratuito na oferta.
    const free = await createPlanRow(owner, { isFree: true });
    await owner`update plan set active = false where id = ${free.id}`;
    await updateSubscription(owner, tenantId, {
      status: "canceled",
      cancel_at_period_end: true,
      current_period_end: inDays(-1),
    });
    await owner`update organization set access_mode = 'read_only' where id = ${tenantId}`;

    const response = await call("PUT", `/api/admin/tenants/${tenantId}/plan`, {
      cookie: platformOwner.cookie,
      body: { planId: free.id },
    });
    expect(response.status).toBe(200);

    expect(await subscriptionState(owner, tenantId)).toMatchObject({
      status: "active",
      provider_subscription_ref: null,
      cancel_at_period_end: false,
    });

    await runBillingPeriodEnd(new Date(), { tenantIds: [tenantId] });
    await runBillingReconcile(new Date(), { tenantIds: [tenantId] });

    expect((await subscriptionState(owner, tenantId)).status).toBe("active");
    expect(await accessModeOf(owner, tenantId)).toBe("full");
    expect(stub.calls.fetchSubscription).toBeUndefined();
  });

  it("a visão geral conta webhooks que falharam", async () => {
    const platformOwner = await makePlatformUser(owner, "platform_owner");
    const failing = createStubProvider({
      parseWebhook: () => {
        throw new Error("parser quebrado");
      },
    });
    setProvidersForTests([failing]);

    const before = await bodyOf(
      await call("GET", "/api/admin/overview", { cookie: platformOwner.cookie }),
    );
    await sendWebhook([]);
    await drain().catch(() => undefined);

    const after = await bodyOf(
      await call("GET", "/api/admin/overview", { cookie: platformOwner.cookie }),
    );

    expect(after.failedWebhooks).toBe((before.failedWebhooks as number) + 1);
  });
});

describe("leitura e permissões do owner", () => {
  it("/api/billing/plans mostra preços do provedor ativo e capacidades", async () => {
    const body = await bodyOf(
      await call("GET", "/api/billing/plans", { cookie: user.cookie }),
    );
    const plans = body.plans as { id: string; prices: { id: string }[] }[];

    expect(plans.find(({ id }) => id === pro.id)?.prices.map(({ id }) => id)).toEqual([
      pro.priceId,
    ]);
    expect(body.providers).toEqual([
      {
        id: STUB_ID,
        methods: ["card", "boleto", "pix"],
        customerPortal: true,
        pause: true,
      },
    ]);
  });

  it("preço sem referência some quando o provedor a exige", async () => {
    setProvidersForTests([createStubProvider({ requiresPriceRef: true })]);
    const unconfigured = await createPaidPlan(owner, 100);
    await owner`
      update plan_price set provider_price_ref = null where id = ${unconfigured.priceId}
    `;

    const body = await bodyOf(
      await call("GET", "/api/billing/plans", { cookie: user.cookie }),
    );
    const plans = body.plans as { id: string; prices: unknown[] }[];

    expect(plans.find(({ id }) => id === unconfigured.id)?.prices).toEqual([]);

    const response = await call("POST", "/api/billing/checkout", {
      cookie: user.cookie,
      body: { planPriceId: unconfigured.priceId, method: "card" },
    });
    expect((await bodyOf(response)).code).toBe("PRICE_NOT_CONFIGURED");
  });

  it("sem provedores o sistema segue: só planos, sem checkout", async () => {
    setProvidersForTests([]);

    const plans = await bodyOf(
      await call("GET", "/api/billing/plans", { cookie: user.cookie }),
    );
    expect(plans.providers).toEqual([]);

    const checkout = await call("POST", "/api/billing/checkout", {
      cookie: user.cookie,
      body: { planPriceId: pro.priceId, method: "card" },
    });
    expect(checkout.status).toBe(409);
    expect((await bodyOf(checkout)).code).toBe("PROVIDER_UNAVAILABLE");

    const webhook = await sendWebhook([]);
    expect(webhook.status).toBe(404);
  });

  it.each(["unpaid", "canceled"])(
    "%s não conta como pago: a tela precisa oferecer checkout",
    async (status) => {
      await updateSubscription(owner, tenantId, { status });

      const body = await bodyOf(
        await call("GET", "/api/billing/subscription", { cookie: user.cookie }),
      );

      expect(body.subscription).toMatchObject({ status, paid: false });
    },
  );

  it("/api/billing/subscription não expõe referências do provedor", async () => {
    const response = await call("GET", "/api/billing/subscription", {
      cookie: user.cookie,
    });
    const text = await response.clone().text();
    const body = await bodyOf(response);

    expect(body.subscription).toMatchObject({
      status: "active",
      paid: true,
      plan: { id: basic.id },
    });
    expect(body.profile).toMatchObject({ document: "11222333000181" });
    expect(text).not.toContain(ref);
    expect(text).not.toContain("cus_");
  });

  it("admin do tenant lê, mas não paga", async () => {
    const admin = await createUser(owner);
    await addMember(owner, tenantId, admin, "admin");

    const read = await call("GET", "/api/billing/subscription", {
      cookie: admin.cookie,
    });
    const write = await call("POST", "/api/billing/cancel", {
      cookie: admin.cookie,
      body: {},
    });

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
  });

  it("colaborador não vê cobrança", async () => {
    const person = await createUser(owner);
    await addMember(owner, tenantId, person, "member");

    const response = await call("GET", "/api/billing/subscription", {
      cookie: person.cookie,
    });

    expect(response.status).toBe(403);
    expect((await bodyOf(response)).code).toBe("PERMISSION_DENIED");
  });

  it("documento inválido é recusado", async () => {
    const response = await call("PUT", "/api/billing/profile", {
      cookie: user.cookie,
      body: { ...PROFILE, document: "11.222.333/0001-82" },
    });

    expect(response.status).toBe(400);
  });
});

describe("read_only", () => {
  beforeEach(async () => {
    await updateSubscription(owner, tenantId, { status: "unpaid" });
    await owner`update organization set access_mode = 'read_only' where id = ${tenantId}`;
  });

  it("/api/billing/* segue aberta para voltar a pagar", async () => {
    const response = await call("POST", "/api/billing/checkout", {
      cookie: user.cookie,
      body: { planPriceId: pro.priceId, method: "card" },
    });

    expect(response.status).toBe(200);
  });

  it("o resto das mutações continua barrado", async () => {
    const response = await call("PATCH", "/api/tenant", {
      cookie: user.cookie,
      body: { name: "Outro nome" },
    });

    expect(response.status).toBe(403);
    expect((await bodyOf(response)).code).toBe("TENANT_READ_ONLY");
  });
});

describe("isolamento", () => {
  it("fatura de outro tenant é 404", async () => {
    const other = await activeTenant();
    const [row] = await asPlatform(owner, (tx) =>
      tx<{ id: string }[]>`select id from invoice where tenant_id = ${other.tenantId}`,
    );

    const response = await call("GET", `/api/billing/invoices/${row?.id}`, {
      cookie: user.cookie,
    });

    expect(response.status).toBe(404);
  });

  it("a lista de faturas só traz o próprio tenant", async () => {
    const other = await activeTenant();
    const body = await bodyOf(
      await call("GET", "/api/billing/invoices", { cookie: other.person.cookie }),
    );

    expect(body.invoices).toHaveLength(1);
  });

  it("bizu_app fora de withTenant não lê invoice, billing_profile nem payment_event", async () => {
    const db = getDb();

    expect(await db.select().from(invoice)).toEqual([]);
    expect(await db.select().from(billingProfile)).toEqual([]);
    expect(await db.select().from(paymentEvent)).toEqual([]);
  });

  it("dentro de withTenant(A) não lê faturas de B", async () => {
    const other = await activeTenant();
    const rows = await withTenant(tenantId, (tx) => tx.select().from(invoice));

    expect(rows.every((row) => row.tenantId === tenantId)).toBe(true);
    expect(rows.some((row) => row.tenantId === other.tenantId)).toBe(false);
  });

  it("dentro de withTenant, payment_event sem tenant não aparece", async () => {
    await sendWebhook([{ type: "ignored", reason: "x" }]);
    await drain();

    const rows = await withTenant(tenantId, (tx) => tx.select().from(paymentEvent));

    expect(rows.every((row) => row.tenantId === tenantId)).toBe(true);
  });
});
