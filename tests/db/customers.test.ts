import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { waitForBackgroundTasks } from "@/lib/auth/background";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import {
  bodyOf,
  cleanUpBilling,
  createPlanRow,
} from "./billing-helpers";
import {
  cleanUpPortal,
  createCustomer,
  customerEmail,
  inviteAndEnter,
  lastLink,
  verify,
} from "./portal-helpers";
import {
  call,
  cleanUp,
  connectOwner,
  createTenant,
  createUser,
  type TestUser,
} from "./tenant-helpers";

/** `/api/customers/*`: CRUD, isolamento entre tenants, limite do plano e convite. */

const mail = createMemoryProvider();

describe("clientes", () => {
  let owner: postgres.Sql;
  let tenantOwner: TestUser;
  let otherOwner: TestUser;
  let tenant: { id: string; slug: string };

  const portalUsers = (email: string) => owner<{ id: string }[]>`
    select id from portal_user where email = ${email}
  `;

  beforeAll(async () => {
    setEmailProviderForTests(mail);
    owner = connectOwner();
    tenantOwner = await createUser(owner);
    tenant = await createTenant(tenantOwner);
    otherOwner = await createUser(owner);
    await createTenant(otherOwner);
  });

  afterAll(async () => {
    setEmailProviderForTests(undefined);
    await cleanUpPortal(owner);
    await cleanUp(owner);
    await cleanUpBilling(owner);
    await owner.end();
  });

  beforeEach(() => mail.reset());

  describe("CRUD", () => {
    it("cria, lê, altera e remove", async () => {
      const email = customerEmail();
      const created = await call("POST", "/api/customers", {
        cookie: tenantOwner.cookie,
        body: {
          name: "Júlia Lima",
          email: email.toUpperCase(),
          phone: "(11) 99999-0000",
          document: "123.456.789-09",
          tags: ["vip", "vip", "retorno"],
          notes: "Prefere contato à tarde.",
        },
      });
      expect(created.status).toBe(201);

      const { customer } = (await created.json()) as {
        customer: Record<string, unknown> & { id: string };
      };
      expect(customer).toMatchObject({
        name: "Júlia Lima",
        email,
        status: "lead",
        tags: ["vip", "retorno"],
        hasPortalAccess: false,
        invitedAt: null,
        lastLoginAt: null,
      });
      expect(customer).not.toHaveProperty("portalUserId");
      expect(customer).not.toHaveProperty("tenantId");

      const read = await call("GET", `/api/customers/${customer.id}`, {
        cookie: tenantOwner.cookie,
      });
      expect(read.status).toBe(200);

      const patched = await call("PATCH", `/api/customers/${customer.id}`, {
        cookie: tenantOwner.cookie,
        body: { phone: "", notes: null, tags: [] },
      });
      expect(patched.status).toBe(200);
      expect(await patched.json()).toMatchObject({
        customer: {
          name: "Júlia Lima",
          document: "123.456.789-09",
          phone: null,
          notes: null,
          tags: [],
        },
      });

      const removed = await call("DELETE", `/api/customers/${customer.id}`, {
        cookie: tenantOwner.cookie,
      });
      expect(removed.status).toBe(200);

      const gone = await call("GET", `/api/customers/${customer.id}`, {
        cookie: tenantOwner.cookie,
      });
      expect(gone.status).toBe(404);
    });

    it("audita sem dado pessoal", async () => {
      const { id } = await createCustomer(tenantOwner, { name: "Nome Sensível" });

      const rows = await owner.begin(async (tx) => {
        await tx`select set_config('app.bypass_tenant', 'on', true)`;
        return tx<{ metadata: unknown }[]>`
          select metadata from audit_log
          where action = 'customer.created' and target_id = ${id}
        `;
      });

      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0]?.metadata)).not.toContain("Sensível");
    });

    it("e-mail repetido no tenant é conflito; em outro tenant, não", async () => {
      const { email } = await createCustomer(tenantOwner);

      const repeated = await call("POST", "/api/customers", {
        cookie: tenantOwner.cookie,
        body: { name: "Outro", email },
      });
      expect(repeated.status).toBe(409);
      expect(await bodyOf(repeated)).toMatchObject({
        code: "CUSTOMER_EMAIL_TAKEN",
      });

      await createCustomer(otherOwner, { email });
    });

    it("busca, filtra e pagina", async () => {
      const marker = randomUUID();
      const first = await createCustomer(tenantOwner, {
        name: `Busca ${marker}`,
      });
      await createCustomer(tenantOwner, {
        name: `Busca ${marker}`,
        status: "blocked",
      });

      const list = async (query: string) => {
        const response = await call("GET", `/api/customers?${query}`, {
          cookie: tenantOwner.cookie,
        });
        expect(response.status).toBe(200);
        return (await response.json()) as {
          items: { id: string }[];
          total: number;
          pageSize: number;
        };
      };

      expect((await list(`q=${marker}`)).total).toBe(2);

      const onlyLeads = await list(`q=${marker}&status=lead`);
      expect(onlyLeads.items.map(({ id }) => id)).toEqual([first.id]);

      expect((await list(`q=${marker}&page=2`)).items).toHaveLength(0);
      expect((await list("q=%25")).total).toBe(0);
    });

    it("entrada inválida responde 400", async () => {
      const response = await call("POST", "/api/customers", {
        cookie: tenantOwner.cookie,
        body: { name: "A", email: "nao-e-email" },
      });

      expect(response.status).toBe(400);
    });
  });

  describe("isolamento", () => {
    it("cliente de outro tenant responde 404 em toda rota", async () => {
      const { id } = await createCustomer(tenantOwner);
      const cookie = otherOwner.cookie;

      for (const [method, path, body] of [
        ["GET", `/api/customers/${id}`, undefined],
        ["PATCH", `/api/customers/${id}`, { name: "Invadido" }],
        ["DELETE", `/api/customers/${id}`, undefined],
        ["POST", `/api/customers/${id}/invite`, undefined],
      ] as const) {
        const response = await call(method, path, { cookie, body });
        expect(response.status).toBe(404);
      }

      const intact = await call("GET", `/api/customers/${id}`, {
        cookie: tenantOwner.cookie,
      });
      expect(await intact.json()).toMatchObject({
        customer: { name: "Cliente Teste" },
      });
    });

    it("id malformado é 404", async () => {
      const response = await call("GET", "/api/customers/nao-e-uuid", {
        cookie: tenantOwner.cookie,
      });

      expect(response.status).toBe(404);
    });
  });

  describe("limite do plano", () => {
    it("recusa o cliente acima do limite e conta os que existem", async () => {
      const user = await createUser(owner);
      const { id } = await createTenant(user);
      const plan = await createPlanRow(owner, {
        isFree: false,
        limits: { customers: 2 },
      });

      await owner.begin(async (tx) => {
        await tx`select set_config('app.bypass_tenant', 'on', true)`;
        // Em banco sem planos, o tenant nasce sem assinatura.
        await tx`
          insert into subscription (tenant_id, plan_id, status)
          values (${id}, ${plan.id}, 'active')
          on conflict (tenant_id) do update set plan_id = excluded.plan_id
        `;
      });

      const first = await createCustomer(user);
      await createCustomer(user);

      const over = await call("POST", "/api/customers", {
        cookie: user.cookie,
        body: { name: "Terceiro", email: customerEmail() },
      });
      expect(over.status).toBe(403);
      expect(await bodyOf(over)).toMatchObject({ code: "PLAN_LIMIT_REACHED" });

      await call("DELETE", `/api/customers/${first.id}`, { cookie: user.cookie });

      await createCustomer(user);
    });
  });

  describe("convite", () => {
    function invite(id: string) {
      return call("POST", `/api/customers/${id}/invite`, {
        cookie: tenantOwner.cookie,
      });
    }

    it("cria portal_user uma vez só, sem senha e sem verificação", async () => {
      const { id, email } = await createCustomer(tenantOwner);

      expect((await invite(id)).status).toBe(200);
      expect((await invite(id)).status).toBe(200);

      const [person, ...others] = await portalUsers(email);
      expect(others).toHaveLength(0);

      const [row] = await owner<{ email_verified: boolean }[]>`
        select email_verified from portal_user where id = ${person?.id ?? ""}
      `;
      expect(row?.email_verified).toBe(false);
      expect(
        await owner`select 1 from portal_account where user_id = ${person?.id ?? ""}`,
      ).toHaveLength(0);

      const detail = await call("GET", `/api/customers/${id}`, {
        cookie: tenantOwner.cookie,
      });
      const { customer } = (await detail.json()) as {
        customer: { invitedAt: string | null; hasPortalAccess: boolean };
      };
      expect(customer.invitedAt).not.toBeNull();
      expect(customer.hasPortalAccess).toBe(true);

      const events = await owner.begin(async (tx) => {
        await tx`select set_config('app.bypass_tenant', 'on', true)`;
        return tx`
          select 1 from audit_log
          where action = 'customer.invited' and target_id = ${id}
        `;
      });
      expect(events).toHaveLength(2);
    });

    it("o e-mail traz o link da página, com o tenant", async () => {
      const { id, email } = await createCustomer(tenantOwner);
      await invite(id);

      const { org, message } = lastLink(mail, email);

      expect(org).toBe(tenant.slug);
      expect(message?.subject).toContain("liberou seu acesso");
      expect(message?.tags).toEqual({ template: "portal-invite" });
      expect(message?.html).toContain(
        "http://localhost:5173/portal/entrar?token=",
      );
    });

    it("cliente bloqueado não recebe convite", async () => {
      const { id, email } = await createCustomer(tenantOwner, {
        status: "blocked",
      });

      const response = await invite(id);

      expect(response.status).toBe(409);
      expect(await bodyOf(response)).toMatchObject({ code: "CUSTOMER_BLOCKED" });
      expect(mail.sent).toHaveLength(0);
      expect(await portalUsers(email)).toHaveLength(0);
    });

    it("trocar o e-mail corta o acesso do antigo e pede novo convite", async () => {
      const { id, email } = await createCustomer(tenantOwner);
      const cookie = await inviteAndEnter(tenantOwner, mail, id, email);
      const replacement = customerEmail();

      const response = await call("PATCH", `/api/customers/${id}`, {
        cookie: tenantOwner.cookie,
        body: { email: replacement },
      });
      expect(await response.json()).toMatchObject({
        customer: {
          email: replacement,
          status: "lead",
          hasPortalAccess: false,
          invitedAt: null,
        },
      });

      expect((await call("GET", "/api/portal/customer", { cookie })).status).toBe(401);
      expect(await portalUsers(email)).toHaveLength(0);

      await call("POST", "/api/portal/auth-ext/magic-link", {
        body: { email, org: tenant.slug },
      });
      await waitForBackgroundTasks();
      expect(mail.sent.filter(({ to, tags }) => to === email && tags?.template === "portal-magic-link")).toHaveLength(0);
    });

    it("remover o cliente apaga a identidade sem outro vínculo", async () => {
      const { id, email } = await createCustomer(tenantOwner);
      await invite(id);
      expect(await portalUsers(email)).toHaveLength(1);

      await call("DELETE", `/api/customers/${id}`, {
        cookie: tenantOwner.cookie,
      });

      expect(await portalUsers(email)).toHaveLength(0);
    });

    it("remover mantém a identidade usada em outro tenant", async () => {
      const email = customerEmail();
      const here = await createCustomer(tenantOwner, { email });
      const there = await createCustomer(otherOwner, { email });

      await invite(here.id);
      await call("POST", `/api/customers/${there.id}/invite`, {
        cookie: otherOwner.cookie,
      });

      await call("DELETE", `/api/customers/${here.id}`, {
        cookie: tenantOwner.cookie,
      });

      expect(await portalUsers(email)).toHaveLength(1);
    });

    it("link de um convite cortado não dá acesso ao tenant", async () => {
      const { id, email } = await createCustomer(tenantOwner);
      await invite(id);
      const { token, org } = lastLink(mail, email);

      await call("DELETE", `/api/customers/${id}`, {
        cookie: tenantOwner.cookie,
      });

      expect((await verify(token, org)).status).toBe(400);
    });
  });
});
