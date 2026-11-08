import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runBillingDunning } from "@/jobs/billing";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import { setProvidersForTests } from "@/lib/payments/registry";
import type { RemoteSubscription } from "@/lib/payments/types";
import {
  accessModeOf,
  asPlatform,
  bodyOf,
  cleanUpBilling,
  createPlanRow,
  createStubProvider,
  ensureSubscription,
  makePlatformUser,
  restoreSettings,
  type SavedSettings,
  saveSettings,
  setSettings,
  type StubProvider,
  STUB_ID,
  subscriptionState,
  updateSubscription,
} from "./billing-helpers";
import { call, cleanUp, connectOwner, createTenant, createUser, type TestUser } from "./tenant-helpers";

/**
 * Edição de datas e status da assinatura pelo `/admin` (`docs/specs/admin-crud/spec.md`,
 * seção 5): `PATCH /api/admin/subscriptions/:id`, manual e com provedor (stub).
 */

const DAY = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 5;
const REASON = "Acordo com o cliente";

let owner: postgres.Sql;
let saved: SavedSettings;
let platformOwner: TestUser;
let support: TestUser;
let paidPlan: { id: string; slug: string };
let freePlan: { id: string; slug: string };

const inDays = (days: number) => new Date(Date.now() + days * DAY);

const patch = (user: TestUser, id: string, body: Record<string, unknown>) =>
  call("PATCH", `/api/admin/subscriptions/${id}`, { cookie: user.cookie, body });

/** Tenant com assinatura no plano pago, no status pedido, sem provedor. */
async function manualTenant(status = "active", values: Record<string, unknown> = {}) {
  const tenantOwner = await createUser(owner);
  const tenant = await createTenant(tenantOwner, "Loja Editada");
  await ensureSubscription(owner, tenant.id, paidPlan.id, status);
  await updateSubscription(owner, tenant.id, {
    current_period_start: inDays(-20),
    current_period_end: inDays(10),
    trial_ends_at: null,
    provider: null,
    provider_subscription_ref: null,
    grace_until: null,
    ...values,
  });
  const { id } = await subscriptionState(owner, tenant.id);

  return { tenantId: tenant.id, tenantOwner, id };
}

type EventRow = { from_status: string | null; to_status: string; reason: string; source: string };

function eventsOf(tenantId: string) {
  return asPlatform(owner, (tx) =>
    tx<EventRow[]>`
      select from_status, to_status, reason, source from subscription_event
      where tenant_id = ${tenantId} order by created_at
    `,
  );
}

function auditOf(tenantId: string) {
  return asPlatform(owner, (tx) =>
    tx<{ action: string; metadata: Record<string, unknown> }[]>`
      select action, metadata from audit_log where tenant_id = ${tenantId} order by created_at
    `,
  );
}

async function setAccessMode(tenantId: string, mode: string, status = "active") {
  await owner`update organization set access_mode = ${mode}, status = ${status} where id = ${tenantId}`;
}

async function trialOf(tenantId: string) {
  const [row] = await asPlatform(owner, (tx) =>
    tx<{ sub: Date | null; org: Date | null; notices: Record<string, string> | null }[]>`
      select s.trial_ends_at as sub, o.trial_ends_at as org, s.metadata->'trialNotices' as notices
      from subscription s join organization o on o.id = s.tenant_id
      where s.tenant_id = ${tenantId}
    `,
  );
  return row;
}

beforeAll(async () => {
  setEmailProviderForTests(createMemoryProvider());
  setProvidersForTests([]);
  owner = connectOwner();
  saved = await saveSettings(owner);

  platformOwner = await makePlatformUser(owner, "platform_owner");
  support = await makePlatformUser(owner, "platform_support");
  paidPlan = await createPlanRow(owner, { isFree: false, limits: { organizations: 5 } });
  freePlan = await createPlanRow(owner, { isFree: true, limits: { organizations: 5 } });
});

beforeEach(() =>
  setSettings(owner, { trialPlanId: freePlan.id, trialDays: 14, graceDays: GRACE_DAYS }),
);

afterEach(() => setProvidersForTests([]));

afterAll(async () => {
  setEmailProviderForTests(undefined);
  setProvidersForTests(undefined);
  await cleanUpBilling(owner);
  await restoreSettings(owner, saved);
  await cleanUp(owner);
  await owner.end();
});

describe("autorização e contrato", () => {
  it("só o proprietário da plataforma edita; o motivo é obrigatório", async () => {
    const { id, tenantId, tenantOwner } = await manualTenant();
    const body = { currentPeriodEnd: inDays(30).toISOString(), reason: REASON };

    for (const user of [support, tenantOwner]) {
      expect((await patch(user, id, body)).status).toBe(403);
    }
    expect((await patch(platformOwner, id, { currentPeriodEnd: body.currentPeriodEnd })).status).toBe(400);
    expect((await patch(platformOwner, id, { reason: REASON })).status).toBe(400);
    expect(
      (await patch(platformOwner, id, { currentPeriodEnd: "amanhã", reason: REASON })).status,
    ).toBe(400);
    expect((await patch(platformOwner, randomUUID(), body)).status).toBe(404);

    const state = await subscriptionState(owner, tenantId);
    expect(state.current_period_end?.getTime()).toBeLessThan(inDays(11).getTime());
  });
});

describe("assinatura manual", () => {
  it("muda o vencimento, grava o evento com o motivo e audita", async () => {
    const { id, tenantId } = await manualTenant();
    const next = inDays(40);

    const response = await patch(platformOwner, id, {
      currentPeriodEnd: next.toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).subscription).toMatchObject({ status: "active" });

    const state = await subscriptionState(owner, tenantId);
    expect(state.current_period_end?.toISOString()).toBe(next.toISOString());
    expect((await eventsOf(tenantId)).at(-1)).toEqual({
      from_status: "active",
      to_status: "active",
      reason: `admin_edit: ${REASON}`,
      source: "admin",
    });
    const updated = (await auditOf(tenantId)).find(
      ({ action }) => action === "admin.subscription_updated",
    );
    expect(updated?.metadata).toEqual({
      from: "active",
      to: "active",
      fields: "currentPeriodEnd",
      mode: "manual",
    });
  });

  it("unpaid pelo status deixa somente leitura; active devolve o acesso", async () => {
    const { id, tenantId } = await manualTenant("past_due", { grace_until: inDays(2) });

    const unpaid = await patch(platformOwner, id, { status: "unpaid", reason: REASON });
    expect(unpaid.status).toBe(200);
    expect((await subscriptionState(owner, tenantId)).status).toBe("unpaid");
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");

    const active = await patch(platformOwner, id, {
      status: "active",
      currentPeriodEnd: inDays(30).toISOString(),
      reason: REASON,
    });
    expect(active.status).toBe(200);
    const state = await subscriptionState(owner, tenantId);
    expect(state.status).toBe("active");
    expect(state.grace_until).toBeNull();
    expect(await accessModeOf(owner, tenantId)).toBe("full");
    // Status não é pagamento: nenhuma fatura nasce.
    const [{ count } = { count: -1 }] = await asPlatform(owner, (tx) =>
      tx<{ count: number }[]>`select count(*)::int as count from invoice where tenant_id = ${tenantId}`,
    );
    expect(count).toBe(0);
  });

  it("a suspensão da plataforma vence: locked continua locked", async () => {
    const { id, tenantId } = await manualTenant();
    await setAccessMode(tenantId, "locked", "suspended");

    expect((await patch(platformOwner, id, { status: "unpaid", reason: REASON })).status).toBe(200);
    expect(await accessModeOf(owner, tenantId)).toBe("locked");

    expect(
      (
        await patch(platformOwner, id, {
          status: "active",
          currentPeriodEnd: inDays(30).toISOString(),
          reason: REASON,
        })
      ).status,
    ).toBe(200);
    expect(await accessModeOf(owner, tenantId)).toBe("locked");
  });

  it("canceled é recusado, encerrada não tem data, campo fora do status também não", async () => {
    const { id } = await manualTenant();
    const canceled = await patch(platformOwner, id, { status: "canceled", reason: REASON });
    expect(canceled.status).toBe(409);
    expect((await bodyOf(canceled)).code).toBe("STATUS_NOT_ALLOWED");

    const wrongField = await patch(platformOwner, id, {
      trialEndsAt: inDays(5).toISOString(),
      reason: REASON,
    });
    expect((await bodyOf(wrongField)).code).toBe("FIELD_NOT_APPLICABLE");

    const expired = await manualTenant("expired");
    const closed = await patch(platformOwner, expired.id, {
      currentPeriodEnd: inDays(5).toISOString(),
      reason: REASON,
    });
    expect(closed.status).toBe(409);
    expect((await bodyOf(closed)).code).toBe("SUBSCRIPTION_CLOSED");

    const past = await patch(platformOwner, id, {
      status: "unpaid",
      currentPeriodEnd: inDays(-1).toISOString(),
      reason: REASON,
    });
    expect(past.status).toBe(400);
    expect((await bodyOf(past)).code).toBe("INVALID_DATE");
  });

  it("estender o trial copia no tenant e reabre os avisos que voltaram a ser futuros", async () => {
    const { id, tenantId } = await manualTenant("trialing", {
      trial_ends_at: inDays(1),
      metadata: owner.json({ trialNotices: { t3: inDays(-2).toISOString(), t1: new Date().toISOString() } }),
    });
    const next = inDays(20);

    const response = await patch(platformOwner, id, {
      trialEndsAt: next.toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(200);

    const trial = await trialOf(tenantId);
    expect(trial?.sub?.toISOString()).toBe(next.toISOString());
    expect(trial?.org?.toISOString()).toBe(next.toISOString());
    expect(trial?.notices).toEqual({});
  });

  it("expired → trialing zera os avisos e devolve o acesso", async () => {
    const { id, tenantId } = await manualTenant("expired", {
      trial_ends_at: inDays(-10),
      metadata: owner.json({ trialNotices: { t3: "x", t1: "x", t0: "x", expired: "x" } }),
    });
    await setAccessMode(tenantId, "read_only");

    const response = await patch(platformOwner, id, {
      status: "trialing",
      trialEndsAt: inDays(7).toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(200);
    expect(await accessModeOf(owner, tenantId)).toBe("full");
    expect((await trialOf(tenantId))?.notices).toBeNull();
    expect((await subscriptionState(owner, tenantId)).status).toBe("trialing");
  });

  it("estender a carência adia o unpaid do dunning", async () => {
    const { id, tenantId } = await manualTenant("past_due", { grace_until: inDays(1) });

    const response = await patch(platformOwner, id, {
      graceUntil: inDays(10).toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(200);

    const result = await runBillingDunning(inDays(3), { tenantIds: [tenantId] });
    expect(result.unpaid).toBe(0);
    expect((await subscriptionState(owner, tenantId)).status).toBe("past_due");
  });

  it("paused guarda até quando estava pago e corta o acesso", async () => {
    const end = inDays(12);
    const { id, tenantId } = await manualTenant("active", { current_period_end: end });

    expect((await patch(platformOwner, id, { status: "paused", reason: REASON })).status).toBe(200);
    const state = await subscriptionState(owner, tenantId);
    expect(state.status).toBe("paused");
    expect(state.metadata.paidThrough).toBe(end.toISOString());
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");
  });
});

describe("assinatura com provedor", () => {
  let stub: StubProvider;

  async function providerTenant(status = "active", values: Record<string, unknown> = {}) {
    const created = await manualTenant(status, {
      provider: STUB_ID,
      provider_subscription_ref: `sub_${randomUUID()}`,
      ...values,
    });
    const state = await subscriptionState(owner, created.tenantId);

    return { ...created, ref: state.provider_subscription_ref as string };
  }

  const remoteOf = (ref: string, extra: Partial<RemoteSubscription>): RemoteSubscription => ({
    ref,
    status: "active",
    cancelAtPeriodEnd: false,
    ...extra,
  });

  beforeEach(() => {
    stub = createStubProvider();
    setProvidersForTests([stub]);
  });

  it("vencimento vai primeiro ao provedor e a resposta entra pela reconciliação, sem alerta", async () => {
    const { id, tenantId, ref } = await providerTenant();
    const next = inDays(45);
    const calls: unknown[][] = [];
    stub.updateSubscriptionSchedule = async (...args) => {
      calls.push(args);
      return remoteOf(ref, { currentPeriodStart: new Date(), currentPeriodEnd: next });
    };

    const response = await patch(platformOwner, id, {
      currentPeriodEnd: next.toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(200);
    expect(calls[0]?.[1]).toBe(ref);
    expect(calls[0]?.[2]).toEqual({
      trialEnd: undefined,
      nextBillingAt: next,
    });

    const state = await subscriptionState(owner, tenantId);
    expect(state.current_period_end?.toISOString()).toBe(next.toISOString());
    expect(state.metadata.alert).toBeUndefined();
    expect((await eventsOf(tenantId)).at(-1)).toMatchObject({
      reason: `admin_edit: ${REASON}`,
      source: "admin",
    });
    expect((await auditOf(tenantId)).map(({ action }) => action)).toContain(
      "admin.subscription_updated",
    );
  });

  it("fim do trial nativo: o que o provedor devolveu vai à assinatura e ao tenant", async () => {
    const { id, tenantId, ref } = await providerTenant("trialing", { trial_ends_at: inDays(3) });
    const next = inDays(17);
    stub.updateSubscriptionSchedule = async () =>
      remoteOf(ref, { status: "trialing", currentPeriodEnd: next, trialEnd: next });

    const response = await patch(platformOwner, id, {
      trialEndsAt: next.toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(200);
    const trial = await trialOf(tenantId);
    expect(trial?.sub?.toISOString()).toBe(next.toISOString());
    expect(trial?.org?.toISOString()).toBe(next.toISOString());
  });

  it("provedor recusa: 409 PROVIDER_UPDATE_FAILED e nada muda", async () => {
    const { id, tenantId } = await providerTenant();
    const before = await subscriptionState(owner, tenantId);
    const events = (await eventsOf(tenantId)).length;
    stub.updateSubscriptionSchedule = async () => {
      throw new Error("cartão do cliente@x.test recusado");
    };

    const response = await patch(platformOwner, id, {
      currentPeriodEnd: inDays(45).toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(409);
    const body = await bodyOf(response);
    expect(body.code).toBe("PROVIDER_UPDATE_FAILED");
    expect(JSON.stringify(body)).not.toContain("cliente@x.test");

    const after = await subscriptionState(owner, tenantId);
    expect(after.current_period_end?.getTime()).toBe(before.current_period_end?.getTime());
    expect(await eventsOf(tenantId)).toHaveLength(events);
  });

  it("provedor sem o método: 409 PROVIDER_UNSUPPORTED", async () => {
    const { id } = await providerTenant();
    // O stub não implementa `updateSubscriptionSchedule` por padrão.
    const response = await patch(platformOwner, id, {
      currentPeriodEnd: inDays(45).toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("PROVIDER_UNSUPPORTED");
  });

  it("status que vem dos pagamentos: 409 PROVIDER_STATUS_MANAGED", async () => {
    const { id, tenantId } = await providerTenant();
    const response = await patch(platformOwner, id, { status: "unpaid", reason: REASON });

    expect(response.status).toBe(409);
    expect((await bodyOf(response)).code).toBe("PROVIDER_STATUS_MANAGED");
    expect((await subscriptionState(owner, tenantId)).status).toBe("active");
  });

  it("pausa e retoma pelos métodos do provedor", async () => {
    const { id, tenantId, ref } = await providerTenant("active", { current_period_end: inDays(12) });

    expect((await patch(platformOwner, id, { status: "paused", reason: REASON })).status).toBe(200);
    expect(stub.calls.pauseSubscription?.[0]?.[1]).toBe(ref);
    expect((await subscriptionState(owner, tenantId)).status).toBe("paused");
    expect(await accessModeOf(owner, tenantId)).toBe("read_only");

    expect((await patch(platformOwner, id, { status: "active", reason: REASON })).status).toBe(200);
    // Ainda dentro do período pago: retomar não cobra.
    expect(stub.calls.resumeSubscription?.[0]?.[2]).toEqual({ chargeNow: false });
    expect((await subscriptionState(owner, tenantId)).status).toBe("active");
    expect(await accessModeOf(owner, tenantId)).toBe("full");
  });

  it("pausada com provedor: a próxima cobrança nova vira o paidThrough", async () => {
    const { id, tenantId, ref } = await providerTenant("paused", {
      current_period_end: inDays(3),
      metadata: owner.json({ paidThrough: inDays(3).toISOString() }),
    });
    const next = inDays(33);
    stub.updateSubscriptionSchedule = async () =>
      remoteOf(ref, { status: "paused", currentPeriodEnd: next });

    const response = await patch(platformOwner, id, {
      currentPeriodEnd: next.toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(200);
    expect((await subscriptionState(owner, tenantId)).metadata.paidThrough).toBe(
      next.toISOString(),
    );
  });

  it("resposta com outro status continua sendo divergência", async () => {
    const { id, tenantId, ref } = await providerTenant();
    stub.updateSubscriptionSchedule = async () =>
      remoteOf(ref, { status: "past_due", currentPeriodEnd: inDays(30) });

    const response = await patch(platformOwner, id, {
      currentPeriodEnd: inDays(30).toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(200);
    const state = await subscriptionState(owner, tenantId);
    expect(state.status).toBe("past_due");
    expect(state.metadata.alert?.kind).toBe("divergence");
    expect((await auditOf(tenantId)).map(({ action }) => action)).toContain(
      "admin.subscription_updated",
    );
  });

  it("carência com provedor é só local", async () => {
    const { id, tenantId } = await providerTenant("past_due", { grace_until: inDays(1) });
    const next = inDays(8);

    const response = await patch(platformOwner, id, {
      graceUntil: next.toISOString(),
      reason: REASON,
    });
    expect(response.status).toBe(200);
    expect(stub.calls.updateSubscriptionSchedule).toBeUndefined();
    expect((await subscriptionState(owner, tenantId)).grace_until?.toISOString()).toBe(
      next.toISOString(),
    );
  });
});
