import type postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runBillingDunning, runBillingPeriodEnd } from "@/jobs/billing";
import { listBillingPlans } from "@/lib/billing/checkout";
import { listPublicPlans } from "@/lib/billing/public-plans.server";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import { setProvidersForTests } from "@/lib/payments/registry";
import {
  accessModeOf,
  asPlatform,
  bodyOf,
  cleanUpBilling,
  createPlanRow,
  ensureSubscription,
  makePlatformUser,
  restoreSettings,
  type SavedSettings,
  saveSettings,
  setSettings,
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
 * Cobrança manual (`docs/specs/cobranca-manual/spec.md`): o proprietário marca quem pagou e
 * quem não pagou, o job vence o período e o `billing.dunning` fecha a carência. E o limite de
 * organizações do plano em `POST /api/tenant`.
 */

const DAY = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 5;

let owner: postgres.Sql;
let saved: SavedSettings;
let platformOwner: TestUser;
let support: TestUser;
let paidPlan: { id: string; slug: string };
let freePlan: { id: string; slug: string };
let noPricePlan: { id: string; slug: string };
let monthPriceId: string;

const send = (user: TestUser, method: string, path: string, body?: unknown) =>
  call(method, path, { cookie: user.cookie, body });

async function manualPrice(planId: string, interval: "month" | "year", amountCents: number) {
  const [row] = await owner<{ id: string }[]>`
    insert into plan_price (plan_id, provider, interval, amount_cents)
    values (${planId}, 'manual', ${interval}, ${amountCents})
    returning id
  `;
  if (!row) throw new Error("preço não criado");
  return row.id;
}

type InvoiceState = {
  id: string;
  provider: string;
  status: string;
  amount_cents: number;
  period_start: Date | null;
  period_end: Date | null;
  paid_at: Date | null;
};

function invoicesOf(tenantId: string) {
  return asPlatform(owner, (tx) =>
    tx<InvoiceState[]>`
      select id, provider, status, amount_cents, period_start, period_end, paid_at
      from invoice where tenant_id = ${tenantId} order by created_at
    `,
  );
}

function auditActions(tenantId: string) {
  return asPlatform(owner, async (tx) =>
    (
      await tx<{ action: string }[]>`
        select action from audit_log where tenant_id = ${tenantId} order by created_at
      `
    ).map(({ action }) => action),
  );
}

/** Tenant com assinatura manual ativa no plano pago, período vencendo em `periodEnd`. */
async function manualTenant(periodEnd: Date | null, status = "active") {
  const tenantOwner = await createUser(owner);
  const tenant = await createTenant(tenantOwner, "Loja Manual");
  await ensureSubscription(owner, tenant.id, paidPlan.id, status);
  await updateSubscription(owner, tenant.id, {
    current_period_start: periodEnd ? new Date(periodEnd.getTime() - 30 * DAY) : null,
    current_period_end: periodEnd,
    trial_ends_at: null,
    provider: null,
    provider_subscription_ref: null,
    grace_until: null,
    plan_price_id: null,
  });

  return { tenantId: tenant.id, tenantOwner };
}

beforeAll(async () => {
  setEmailProviderForTests(createMemoryProvider());
  // Nenhum módulo ativo: o caminho padrão do template.
  setProvidersForTests([]);
  owner = connectOwner();
  saved = await saveSettings(owner);

  platformOwner = await makePlatformUser(owner, "platform_owner");
  support = await makePlatformUser(owner, "platform_support");

  paidPlan = await createPlanRow(owner, {
    isFree: false,
    limits: { members: 5, organizations: 2 },
  });
  freePlan = await createPlanRow(owner, { isFree: true, limits: { organizations: 1 } });
  noPricePlan = await createPlanRow(owner, { isFree: false });
  monthPriceId = await manualPrice(paidPlan.id, "month", 4900);
  await manualPrice(paidPlan.id, "year", 49000);
});

// Tenant novo nasce no plano gratuito de teste (ativo, 1 organização), salvo quando o teste muda.
const defaultSettings = () =>
  setSettings(owner, { trialPlanId: freePlan.id, trialDays: 14, graceDays: GRACE_DAYS });

beforeEach(defaultSettings);

afterAll(async () => {
  setEmailProviderForTests(undefined);
  setProvidersForTests(undefined);
  await cleanUpBilling(owner);
  await restoreSettings(owner, saved);
  await cleanUp(owner);
  await owner.end();
});

describe("autorização", () => {
  it("só o proprietário da plataforma marca pagamentos", async () => {
    const { tenantId, tenantOwner } = await manualTenant(new Date());
    const { id } = await subscriptionState(owner, tenantId);

    for (const user of [support, tenantOwner]) {
      for (const path of ["manual-payment", "manual-unpaid"]) {
        const response = await send(user, "POST", `/api/admin/subscriptions/${id}/${path}`, {});
        expect(response.status, `${path}`).toBe(403);
      }
    }
    expect((await subscriptionState(owner, tenantId)).status).toBe("active");
  });
});

describe("vencimento, carência e pagamento", () => {
  const only = (tenantId: string) => ({ tenantIds: [tenantId] });

  it("vence o período, fecha a carência e volta a ativo quando o admin registra o pagamento", async () => {
    const periodEnd = new Date(Date.now() - 1000);
    const { tenantId } = await manualTenant(periodEnd);
    await updateSubscription(owner, tenantId, { plan_price_id: monthPriceId });

    // Vencimento: fatura do período seguinte e `past_due`, com a carência a partir dele.
    const due = await runBillingPeriodEnd(new Date(), only(tenantId));
    expect(due.manualDue).toBe(1);

    const pastDue = await subscriptionState(owner, tenantId);
    expect(pastDue.status).toBe("past_due");
    expect(pastDue.grace_until?.getTime()).toBe(periodEnd.getTime() + GRACE_DAYS * DAY);
    const [opened] = await invoicesOf(tenantId);
    expect(opened).toMatchObject({ provider: "manual", status: "open", amount_cents: 4900 });
    expect(opened?.period_start?.getTime()).toBe(periodEnd.getTime());

    // Rodar de novo não abre outra fatura nem repete a transição.
    expect((await runBillingPeriodEnd(new Date(), only(tenantId))).manualDue).toBe(0);
    expect(await invoicesOf(tenantId)).toHaveLength(1);

    // Carência vencida: `unpaid` + somente leitura.
    const after = new Date(periodEnd.getTime() + (GRACE_DAYS + 1) * DAY);
    expect((await runBillingDunning(after, only(tenantId))).unpaid).toBe(1);
    expect((await subscriptionState(owner, tenantId)).status).toBe("unpaid");
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");

    // O admin registra o pagamento: a fatura aberta vira paga. Em `unpaid` o tenant estava em
    // somente leitura, então o período novo começa agora.
    const paidAt = Date.now();
    const response = await send(
      platformOwner,
      "POST",
      `/api/admin/subscriptions/${pastDue.id}/manual-payment`,
      { method: "pix" },
    );
    expect(response.status).toBe(200);

    const active = await subscriptionState(owner, tenantId);
    expect(active.status).toBe("active");
    expect(active.grace_until).toBeNull();
    expect(active.current_period_end?.getTime()).toBeGreaterThan(paidAt + 27 * DAY);
    expect(await accessModeOf(owner, tenantId)).toBe("full");

    const invoices = await invoicesOf(tenantId);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ status: "paid" });
    // A fatura passa a dizer o período pago.
    expect(invoices[0]?.period_end?.getTime()).toBe(active.current_period_end?.getTime());

    const actions = await auditActions(tenantId);
    expect(actions).toContain("admin.manual_payment_recorded");
    expect(actions).toContain("billing.subscription_changed");
  });

  it("pagamento adiantado continua do vencimento, com o preço escolhido", async () => {
    const periodEnd = new Date(Date.now() + 10 * DAY);
    const { tenantId } = await manualTenant(periodEnd);
    const [yearly] = await owner<{ id: string }[]>`
      select id from plan_price where plan_id = ${paidPlan.id} and provider = 'manual' and interval = 'year'
    `;
    const { id } = await subscriptionState(owner, tenantId);

    const response = await send(
      platformOwner,
      "POST",
      `/api/admin/subscriptions/${id}/manual-payment`,
      { planPriceId: yearly?.id },
    );
    expect(response.status).toBe(200);

    const state = await subscriptionState(owner, tenantId);
    const expectedEnd = new Date(periodEnd);
    expectedEnd.setUTCFullYear(expectedEnd.getUTCFullYear() + 1);
    expect(state.current_period_end?.toISOString()).toBe(expectedEnd.toISOString());
    expect(state.plan_price_id).toBe(yearly?.id);
    expect(await invoicesOf(tenantId)).toMatchObject([
      { provider: "manual", status: "paid", amount_cents: 49000 },
    ]);
  });

  it("pagar atrasado mais de um período não gera período já vencido", async () => {
    // Venceu há 40 dias e ficou em `past_due` (job parado): o período devido inteiro já passou.
    const periodEnd = new Date(Date.now() - 40 * DAY);
    const { tenantId } = await manualTenant(periodEnd, "past_due");
    const { id } = await subscriptionState(owner, tenantId);
    const paidAt = Date.now();

    const response = await send(
      platformOwner,
      "POST",
      `/api/admin/subscriptions/${id}/manual-payment`,
      {},
    );
    expect(response.status).toBe(200);

    const state = await subscriptionState(owner, tenantId);
    expect(state.status).toBe("active");
    expect(state.current_period_end?.getTime()).toBeGreaterThan(paidAt + 27 * DAY);
    // E o job não o devolve a `past_due`.
    expect((await runBillingPeriodEnd(new Date(), only(tenantId))).manualDue).toBe(0);
  });

  it("preço anual escolhido sobre fatura mensal aberta reprecifica a fatura", async () => {
    const periodEnd = new Date(Date.now() - 1000);
    const { tenantId } = await manualTenant(periodEnd);
    await updateSubscription(owner, tenantId, { plan_price_id: monthPriceId });
    await runBillingPeriodEnd(new Date(), only(tenantId));
    const [yearly] = await owner<{ id: string }[]>`
      select id from plan_price where plan_id = ${paidPlan.id} and provider = 'manual' and interval = 'year'
    `;
    const { id } = await subscriptionState(owner, tenantId);

    const response = await send(
      platformOwner,
      "POST",
      `/api/admin/subscriptions/${id}/manual-payment`,
      { planPriceId: yearly?.id },
    );
    expect(response.status).toBe(200);

    const [paid] = await invoicesOf(tenantId);
    const expectedEnd = new Date(periodEnd);
    expectedEnd.setUTCFullYear(expectedEnd.getUTCFullYear() + 1);
    expect(paid).toMatchObject({ status: "paid", amount_cents: 49000 });
    expect(paid?.period_start?.getTime()).toBe(periodEnd.getTime());
    expect(paid?.period_end?.toISOString()).toBe(expectedEnd.toISOString());
    expect((await subscriptionState(owner, tenantId)).plan_price_id).toBe(yearly?.id);
  });

  it("marcar como não pago com o período correndo cobra o período corrente", async () => {
    const periodEnd = new Date(Date.now() + 10 * DAY);
    const { tenantId } = await manualTenant(periodEnd);
    const state = await subscriptionState(owner, tenantId);

    const response = await send(
      platformOwner,
      "POST",
      `/api/admin/subscriptions/${state.id}/manual-unpaid`,
      {},
    );
    expect(response.status).toBe(200);

    const [failed] = await invoicesOf(tenantId);
    expect(failed?.status).toBe("failed");
    expect(failed?.period_start?.getTime()).toBe(periodEnd.getTime() - 30 * DAY);
  });

  it("marcar como não pago abre a carência; sem carência bloqueia na hora", async () => {
    const { tenantId } = await manualTenant(new Date(Date.now() + 3 * DAY));
    const { id } = await subscriptionState(owner, tenantId);
    const path = `/api/admin/subscriptions/${id}/manual-unpaid`;

    expect((await send(platformOwner, "POST", path, {})).status).toBe(200);
    const pastDue = await subscriptionState(owner, tenantId);
    expect(pastDue.status).toBe("past_due");
    expect(pastDue.grace_until).not.toBeNull();
    expect(await accessModeOf(owner, tenantId)).toBe("full");
    expect(await invoicesOf(tenantId)).toMatchObject([{ status: "failed" }]);

    const again = await send(platformOwner, "POST", path, {});
    expect(again.status).toBe(409);
    expect((await bodyOf(again)).code).toBe("ALREADY_PAST_DUE");

    expect((await send(platformOwner, "POST", path, { immediate: true })).status).toBe(200);
    expect((await subscriptionState(owner, tenantId)).status).toBe("unpaid");
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");
    // A mesma fatura, sem duplicar.
    expect(await invoicesOf(tenantId)).toHaveLength(1);
    expect(await auditActions(tenantId)).toContain("admin.manual_payment_missed");
  });

  it("recusa plano sem preço manual, plano gratuito e assinatura do provedor", async () => {
    const { tenantId } = await manualTenant(new Date());
    const { id } = await subscriptionState(owner, tenantId);
    const path = `/api/admin/subscriptions/${id}/manual-payment`;

    await updateSubscription(owner, tenantId, { plan_id: noPricePlan.id });
    let response = await send(platformOwner, "POST", path, {});
    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("MANUAL_PRICE_REQUIRED");

    await updateSubscription(owner, tenantId, { plan_id: freePlan.id });
    response = await send(platformOwner, "POST", path, {});
    expect((await bodyOf(response)).code).toBe("FREE_PLAN");

    await updateSubscription(owner, tenantId, {
      plan_id: paidPlan.id,
      provider: "stripe",
      provider_subscription_ref: `sub_${id}`,
    });
    response = await send(platformOwner, "POST", path, {});
    expect((await bodyOf(response)).code).toBe("PROVIDER_SUBSCRIPTION_ACTIVE");
    // E o job não vence o que é do provedor.
    expect((await runBillingPeriodEnd(new Date(), only(tenantId))).manualDue).toBe(0);
  });
});

describe("troca de plano pelo admin", () => {
  it("do gratuito para o pago vence agora; trocar de novo anula a fatura aberta", async () => {
    const tenantOwner = await createUser(owner);
    const { id: tenantId } = await createTenant(tenantOwner, "Troca Manual");
    await ensureSubscription(owner, tenantId, freePlan.id, "active");
    await updateSubscription(owner, tenantId, { trial_ends_at: null });

    const before = Date.now();
    const toPaid = await send(platformOwner, "PUT", `/api/admin/tenants/${tenantId}/plan`, {
      planId: paidPlan.id,
    });
    expect(toPaid.status).toBe(200);

    const state = await subscriptionState(owner, tenantId);
    expect(state.status).toBe("active");
    expect(state.current_period_end?.getTime()).toBeGreaterThanOrEqual(before - 1000);

    await runBillingPeriodEnd(new Date(Date.now() + 1000), { tenantIds: [tenantId] });
    expect((await subscriptionState(owner, tenantId)).status).toBe("past_due");
    expect(await invoicesOf(tenantId)).toMatchObject([{ status: "open" }]);

    const toFree = await send(platformOwner, "PUT", `/api/admin/tenants/${tenantId}/plan`, {
      planId: freePlan.id,
    });
    expect(toFree.status).toBe(200);
    const free = await subscriptionState(owner, tenantId);
    expect(free).toMatchObject({ status: "active", current_period_end: null, grace_until: null });
    expect(await invoicesOf(tenantId)).toMatchObject([{ status: "void" }]);
  });

  it("o detalhe do tenant traz período, modo e faturas", async () => {
    const { tenantId } = await manualTenant(new Date(Date.now() + DAY));
    const response = await send(platformOwner, "GET", `/api/admin/tenants/${tenantId}`);
    const body = (await response.json()) as {
      subscription: { billingMode: string; currentPeriodEnd: string | null };
      invoices: unknown[];
      manualPrices: Array<{ interval: string }>;
    };

    expect(body.subscription.billingMode).toBe("manual");
    expect(body.subscription.currentPeriodEnd).not.toBeNull();
    expect(body.invoices).toEqual([]);
    expect(body.manualPrices.map(({ interval }) => interval).sort()).toEqual(["month", "year"]);
  });
});

describe("planos sem provedor", () => {
  it("/api/billing/plans e /precos mostram os preços manuais", async () => {
    const plans = await listBillingPlans();
    const paid = plans.plans.find(({ id }) => id === paidPlan.id);

    expect(plans.billingMode).toBe("manual");
    expect(paid?.prices).toEqual([]);
    expect(paid?.manualPrices).toHaveLength(2);

    const publicPlan = (await listPublicPlans()).find(({ slug }) => slug === paidPlan.slug);
    expect(publicPlan?.prices.month?.amountCents).toBe(4900);
  });
});

describe("limite de organizações", () => {
  let user: TestUser;

  afterEach(defaultSettings);

  it("em trial, a segunda organização é recusada", async () => {
    await setSettings(owner, { trialPlanId: paidPlan.id, trialDays: 14, graceDays: GRACE_DAYS });
    user = await createUser(owner);
    const first = await createTenant(user, "Primeira");
    expect((await subscriptionState(owner, first.id)).status).toBe("trialing");

    const second = await send(user, "POST", "/api/tenant", { name: "Segunda" });
    expect(second.status).toBe(403);
    expect((await bodyOf(second)).code).toBe("PLAN_LIMIT_REACHED");
  });

  it("pago, vale o limite do plano (2)", async () => {
    user = await createUser(owner);
    const first = await createTenant(user, "Paga");
    await ensureSubscription(owner, first.id, paidPlan.id, "active");

    expect((await send(user, "POST", "/api/tenant", { name: "Segunda paga" })).status).toBe(201);

    const third = await send(user, "POST", "/api/tenant", { name: "Terceira" });
    expect(third.status).toBe(403);
    expect((await bodyOf(third)).code).toBe("PLAN_LIMIT_REACHED");
  });

  it("plano pago sem a chave `organizations` vale 1", async () => {
    const legacy = await createPlanRow(owner, { isFree: false, limits: { members: 5 } });
    user = await createUser(owner);
    const first = await createTenant(user, "Plano antigo");
    await ensureSubscription(owner, first.id, legacy.id, "active");

    const second = await send(user, "POST", "/api/tenant", { name: "Outra antiga" });
    expect(second.status).toBe(403);
    expect((await bodyOf(second)).code).toBe("PLAN_LIMIT_REACHED");
  });

  it("duas criações simultâneas não furam o limite", async () => {
    user = await createUser(owner);
    const responses = await Promise.all([
      send(user, "POST", "/api/tenant", { name: "Corrida A" }),
      send(user, "POST", "/api/tenant", { name: "Corrida B" }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 403]);
  });

  it("vencida volta a valer 1", async () => {
    user = await createUser(owner);
    const first = await createTenant(user, "Vencida");
    await ensureSubscription(owner, first.id, paidPlan.id, "unpaid");

    expect((await send(user, "POST", "/api/tenant", { name: "Outra" })).status).toBe(403);
  });
});
