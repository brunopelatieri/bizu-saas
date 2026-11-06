import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import {
  call,
  cleanUp,
  connectOwner,
  createTenant,
  createUser,
  type TestUser,
} from "./tenant-helpers";
import {
  bodyOf,
  cleanUpBilling,
  createPlanRow,
  makePlatformUser,
  restoreSettings,
  saveSettings,
  type SavedSettings,
} from "./billing-helpers";

/**
 * `/api/admin/*`: recusa quem não é da plataforma, separa leitura (suporte) de escrita
 * (proprietário) e muda tenants, planos, configurações e usuários de verdade.
 */

let owner: postgres.Sql;
let saved: SavedSettings;
let platformOwner: TestUser;
let support: TestUser;
let regular: TestUser;
let tenantOwner: TestUser;
let tenantId: string;
let freePlan: { id: string; slug: string };
let paidPlan: { id: string; slug: string };

const get = (user: TestUser, path: string) => call("GET", path, { cookie: user.cookie });
const send = (user: TestUser, method: string, path: string, body?: unknown) =>
  call(method, path, { cookie: user.cookie, body });

beforeAll(async () => {
  setEmailProviderForTests(createMemoryProvider());
  owner = connectOwner();
  saved = await saveSettings(owner);

  platformOwner = await makePlatformUser(owner, "platform_owner");
  support = await makePlatformUser(owner, "platform_support");
  regular = await createUser(owner);
  tenantOwner = await createUser(owner);
  tenantId = (await createTenant(tenantOwner, "Clínica Admin")).id;

  freePlan = await createPlanRow(owner, { isFree: true });
  paidPlan = await createPlanRow(owner, { isFree: false });
});

afterAll(async () => {
  setEmailProviderForTests(undefined);
  await cleanUpBilling(owner);
  await restoreSettings(owner, saved);
  await cleanUp(owner);
  await owner.end();
});

describe("acesso", () => {
  const routes = [
    ["GET", "/api/admin/overview"],
    ["GET", "/api/admin/tenants"],
    ["GET", "/api/admin/plans"],
    ["GET", "/api/admin/settings"],
    ["GET", "/api/admin/users"],
    ["PATCH", "/api/admin/settings"],
    ["POST", "/api/admin/plans"],
  ] as const;

  it.each(routes)("%s %s sem sessão responde 401", async (method, path) => {
    const response = await call(method, path, { body: method === "GET" ? undefined : {} });

    expect(response.status).toBe(401);
  });

  it.each(routes)("%s %s recusa usuário comum com 403", async (method, path) => {
    const response = await send(regular, method, path, method === "GET" ? undefined : {});

    expect(response.status).toBe(403);
    expect((await bodyOf(response)).code).toBe("PLATFORM_FORBIDDEN");
  });

  it("dono de tenant não é da plataforma", async () => {
    expect((await get(tenantOwner, "/api/admin/overview")).status).toBe(403);
  });

  it.each(routes.filter(([method]) => method === "GET"))(
    "%s %s aceita platform_owner",
    async (method, path) => {
      expect((await send(platformOwner, method, path)).status).toBe(200);
    },
  );

  it("suporte lê, mas não escreve", async () => {
    expect((await get(support, "/api/admin/tenants")).status).toBe(200);

    for (const [method, path, body] of [
      ["PATCH", "/api/admin/settings", { trialDays: 5 }],
      ["POST", "/api/admin/plans", { slug: "x-plano", name: "X" }],
      ["POST", `/api/admin/tenants/${tenantId}/suspend`, {}],
      ["POST", `/api/admin/users/${regular.id}/ban`, {}],
    ] as const) {
      const response = await send(support, method, path, body);

      expect(response.status, `${method} ${path}`).toBe(403);
    }
  });

  it("recusa Origin de outro site", async () => {
    const response = await call("PATCH", "/api/admin/settings", {
      cookie: platformOwner.cookie,
      body: { trialDays: 5 },
      origin: "https://evil.example",
    });

    expect(response.status).toBe(403);
  });
});

describe("visão geral e tenants", () => {
  it("overview conta tenants por estado", async () => {
    const body = await bodyOf(await get(platformOwner, "/api/admin/overview"));

    expect(body.tenantsTotal).toBeGreaterThanOrEqual(1);
    expect(Object.keys(body.tenants as object).sort()).toEqual([
      "active",
      "locked",
      "past_due",
      "read_only",
      "trialing",
    ]);
  });

  it("lista e filtra por nome e por estado", async () => {
    const byName = await bodyOf(
      await get(platformOwner, "/api/admin/tenants?q=Clínica Admin"),
    );
    const items = byName.items as Array<{ id: string; state: string }>;

    expect(items.some(({ id }) => id === tenantId)).toBe(true);

    const locked = await bodyOf(
      await get(platformOwner, "/api/admin/tenants?status=locked&q=Clínica Admin"),
    );
    expect((locked.items as unknown[]).length).toBe(0);
  });

  it("detalhe traz membros, assinatura e histórico", async () => {
    const body = await bodyOf(await get(platformOwner, `/api/admin/tenants/${tenantId}`));

    expect((body.members as unknown[]).length).toBe(1);
    expect(body.tenant).toMatchObject({ id: tenantId, status: "active" });
  });

  it("id desconhecido é 404", async () => {
    const response = await get(platformOwner, `/api/admin/tenants/${randomUUID()}`);

    expect(response.status).toBe(404);
    expect((await get(platformOwner, "/api/admin/tenants/nao-e-uuid")).status).toBe(404);
  });

  it("suspender bloqueia o tenant e avisa os donos; reativar devolve o acesso", async () => {
    const provider = createMemoryProvider();
    setEmailProviderForTests(provider);

    const suspend = await send(platformOwner, "POST", `/api/admin/tenants/${tenantId}/suspend`, {
      reason: "Teste",
    });
    expect(suspend.status).toBe(200);

    const blocked = await get(tenantOwner, "/api/team");
    expect(blocked.status).toBe(403);
    expect((await bodyOf(blocked)).code).toBe("TENANT_SUSPENDED");

    expect(
      provider.sent.some(
        ({ to, tags }) => to === tenantOwner.email && tags?.template === "tenant-suspended",
      ),
    ).toBe(true);

    // Já suspenso: 409, sem segundo e-mail.
    const again = await send(platformOwner, "POST", `/api/admin/tenants/${tenantId}/suspend`, {});
    expect(again.status).toBe(409);

    const reactivate = await send(
      platformOwner,
      "POST",
      `/api/admin/tenants/${tenantId}/unsuspend`,
    );
    expect(reactivate.status).toBe(200);
    expect((await get(tenantOwner, "/api/team")).status).toBe(200);

    // Reativar quem não está suspenso: 409.
    expect(
      (await send(platformOwner, "POST", `/api/admin/tenants/${tenantId}/unsuspend`)).status,
    ).toBe(409);
  });

  it("trocar para plano gratuito encerra o trial; o inexistente é 404", async () => {
    const unknown = await send(platformOwner, "PUT", `/api/admin/tenants/${tenantId}/plan`, {
      planId: randomUUID(),
    });
    expect(unknown.status).toBe(404);

    const toFree = await send(platformOwner, "PUT", `/api/admin/tenants/${tenantId}/plan`, {
      planId: freePlan.id,
    });
    expect(toFree.status).toBe(200);
    expect((await bodyOf(toFree)).subscription).toMatchObject({
      status: "active",
      planId: freePlan.id,
    });

    const toPaid = await send(platformOwner, "PUT", `/api/admin/tenants/${tenantId}/plan`, {
      planId: paidPlan.id,
    });
    expect(toPaid.status).toBe(200);

    const detail = await bodyOf(await get(platformOwner, `/api/admin/tenants/${tenantId}`));
    expect(detail.plan).toMatchObject({ id: paidPlan.id });
  });

  it("trocar o plano de um tenant em read_only para o gratuito devolve o acesso", async () => {
    const user = await createUser(owner);
    const { id } = await createTenant(user, "Somente Leitura");
    await owner`update organization set access_mode = 'read_only' where id = ${id}`;

    expect((await send(user, "PATCH", "/api/tenant", { name: "Novo" })).status).toBe(403);

    await send(platformOwner, "PUT", `/api/admin/tenants/${id}/plan`, { planId: freePlan.id });

    expect((await send(user, "PATCH", "/api/tenant", { name: "Novo nome" })).status).toBe(200);
  });
});

describe("planos", () => {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  let planId: string;

  it("cria, lê, edita sem perder campos e desativa", async () => {
    const created = await send(platformOwner, "POST", "/api/admin/plans", {
      slug,
      name: "Plano de teste",
      limits: { members: 3 },
      features: ["audit_export"],
    });
    expect(created.status).toBe(201);
    planId = ((await bodyOf(created)).plan as { id: string }).id;

    // PATCH parcial não pode zerar limites nem features.
    const renamed = await send(platformOwner, "PATCH", `/api/admin/plans/${planId}`, {
      name: "Renomeado",
    });
    expect(renamed.status).toBe(200);
    expect((await bodyOf(renamed)).plan).toMatchObject({
      name: "Renomeado",
      limits: { members: 3 },
      features: ["audit_export"],
      active: true,
      isFree: false,
    });

    const off = await send(platformOwner, "PATCH", `/api/admin/plans/${planId}`, {
      active: false,
    });
    expect((await bodyOf(off)).plan).toMatchObject({ active: false, name: "Renomeado" });

    const list = await bodyOf(await get(platformOwner, "/api/admin/plans"));
    expect((list.plans as Array<{ slug: string }>).some((p) => p.slug === slug)).toBe(true);
  });

  it("slug repetido é 409 e entrada inválida é 400", async () => {
    const dup = await send(platformOwner, "POST", "/api/admin/plans", { slug, name: "Outro" });
    expect(dup.status).toBe(409);
    expect((await bodyOf(dup)).code).toBe("SLUG_TAKEN");

    const bad = await send(platformOwner, "POST", "/api/admin/plans", {
      slug: "ok-slug",
      name: "Ruim",
      limits: { members: -3 },
    });
    expect(bad.status).toBe(400);
  });

  it("preços: cria, recusa duplicado e plano gratuito, edita a referência do provedor", async () => {
    const price = { provider: "stripe", interval: "month", amountCents: 4900 };
    const created = await send(platformOwner, "POST", `/api/admin/plans/${planId}/prices`, price);
    expect(created.status).toBe(201);
    const priceId = ((await bodyOf(created)).price as { id: string }).id;

    const dup = await send(platformOwner, "POST", `/api/admin/plans/${planId}/prices`, price);
    expect(dup.status).toBe(409);
    expect((await bodyOf(dup)).code).toBe("PRICE_EXISTS");

    const ref = await send(
      platformOwner,
      "PATCH",
      `/api/admin/plans/${planId}/prices/${priceId}`,
      { providerPriceRef: "price_123" },
    );
    expect((await bodyOf(ref)).price).toMatchObject({
      providerPriceRef: "price_123",
      amountCents: 4900,
    });

    const free = await send(platformOwner, "POST", `/api/admin/plans/${freePlan.id}/prices`, price);
    expect(free.status).toBe(409);
    expect((await bodyOf(free)).code).toBe("FREE_PLAN_NO_PRICE");

    // Marcar como gratuito um plano que tem preço é recusado.
    const makeFree = await send(platformOwner, "PATCH", `/api/admin/plans/${planId}`, {
      isFree: true,
    });
    expect(makeFree.status).toBe(409);
  });

  it("preço de outro plano não é editável pelo id do plano errado", async () => {
    const other = await createPlanRow(owner, { isFree: false });
    const [row] = await owner<{ id: string }[]>`
      insert into plan_price (plan_id, provider, interval, amount_cents)
      values (${other.id}, 'asaas', 'month', 100) returning id
    `;

    const response = await send(
      platformOwner,
      "PATCH",
      `/api/admin/plans/${planId}/prices/${row?.id}`,
      { amountCents: 1 },
    );

    expect(response.status).toBe(404);
  });
});

describe("configurações da plataforma", () => {
  it("lê, edita e valida contra o banco", async () => {
    const read = await bodyOf(await get(platformOwner, "/api/admin/settings"));
    expect(read.settings).toMatchObject({
      trialDays: expect.any(Number),
      graceDays: expect.any(Number),
    });

    const updated = await send(platformOwner, "PATCH", "/api/admin/settings", {
      trialPlanId: paidPlan.id,
      trialDays: 21,
      graceDays: 3,
    });
    expect(updated.status).toBe(200);
    expect((await bodyOf(updated)).settings).toEqual({
      trialPlanId: paidPlan.id,
      trialDays: 21,
      graceDays: 3,
    });

    // Sem trial, o plano padrão precisa ser gratuito.
    const noTrial = await send(platformOwner, "PATCH", "/api/admin/settings", { trialDays: 0 });
    expect(noTrial.status).toBe(400);
    expect((await bodyOf(noTrial)).code).toBe("TRIAL_PLAN_NOT_FREE");

    const free = await send(platformOwner, "PATCH", "/api/admin/settings", {
      trialPlanId: freePlan.id,
      trialDays: 0,
    });
    expect(free.status).toBe(200);

    const unknown = await send(platformOwner, "PATCH", "/api/admin/settings", {
      trialPlanId: randomUUID(),
    });
    expect(unknown.status).toBe(400);
    expect((await bodyOf(unknown)).code).toBe("PLAN_NOT_FOUND");

    expect(
      (await send(platformOwner, "PATCH", "/api/admin/settings", { trialDays: -2 })).status,
    ).toBe(400);
  });
});

describe("usuários", () => {
  it("lista e busca por e-mail", async () => {
    const body = await bodyOf(await get(platformOwner, `/api/admin/users?q=${regular.email}`));

    expect((body.items as Array<{ email: string }>).map(({ email }) => email)).toEqual([
      regular.email,
    ]);
  });

  it("bane, derruba a sessão, desbane", async () => {
    const target = await createUser(owner);

    expect((await get(target, "/api/me")).status).toBe(200);

    const ban = await send(platformOwner, "POST", `/api/admin/users/${target.id}/ban`, {
      reason: "Abuso",
    });
    expect(ban.status).toBe(200);
    expect((await get(target, "/api/me")).status).toBe(401);

    const unban = await send(platformOwner, "POST", `/api/admin/users/${target.id}/unban`);
    expect(unban.status).toBe(200);
  });

  it("não bane a si mesmo nem outro usuário da plataforma", async () => {
    const self = await send(platformOwner, "POST", `/api/admin/users/${platformOwner.id}/ban`, {});
    expect(self.status).toBe(409);
    expect((await bodyOf(self)).code).toBe("SELF_BAN");

    const staff = await send(platformOwner, "POST", `/api/admin/users/${support.id}/ban`, {});
    expect(staff.status).toBe(403);
    expect((await bodyOf(staff)).code).toBe("PLATFORM_USER_PROTECTED");
    expect((await get(support, "/api/me")).status).toBe(200);
  });
});
