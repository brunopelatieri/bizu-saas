import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import { makePlatformUser } from "./billing-helpers";
import {
  addMember,
  call,
  cleanUp,
  connectOwner,
  createTenant,
  createUser,
  type TestUser,
} from "./tenant-helpers";

type AuditPage = {
  items: Array<{
    action: string;
    actorId: string | null;
    actorName: string | null;
    support?: boolean;
    tenantName?: string;
    impersonatorId?: string;
  }>;
  total: number;
};

describe("leitura da auditoria", () => {
  let owner: postgres.Sql;
  let tenantOwner: TestUser;
  let collaborator: TestUser;
  let tenantId: string;
  let otherTenant: string;
  let platformOwner: TestUser;

  async function page(path: string, cookie: string) {
    const response = await call("GET", path, { cookie });
    expect(response.status).toBe(200);
    return (await response.json()) as AuditPage;
  }

  beforeAll(async () => {
    setEmailProviderForTests(createMemoryProvider());
    owner = connectOwner();

    tenantOwner = await createUser(owner);
    tenantId = (await createTenant(tenantOwner)).id;
    collaborator = await createUser(owner);
    await addMember(owner, tenantId, collaborator, "member");

    const outsider = await createUser(owner);
    otherTenant = (await createTenant(outsider, "Outra")).id;
    platformOwner = await makePlatformUser(owner, "platform_owner");

    await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      await tx`
        insert into audit_log (tenant_id, actor_type, actor_id, action, ip_hash) values
          (${tenantId}, 'platform', ${platformOwner.id}, 'platform.impersonation_started', 'hash-secreto')
      `;
      await tx`
        insert into audit_log (tenant_id, actor_type, actor_id, impersonator_id, action) values
          (${tenantId}, 'user', ${tenantOwner.id}, ${platformOwner.id}, 'customer.created')
      `;
    });
  });

  afterAll(async () => {
    setEmailProviderForTests(undefined);
    await cleanUp(owner);
    await owner.end();
  });

  it("o tenant vê só o próprio log, sem hash de IP", async () => {
    const response = await call("GET", "/api/audit", {
      cookie: tenantOwner.cookie,
    });
    const text = await response.text();
    const { items } = JSON.parse(text) as AuditPage;

    expect(items.map(({ action }) => action)).toContain("tenant.created");
    expect(text).not.toContain("hash-secreto");
    expect(text).not.toContain("ipHash");
    expect(text).not.toContain(otherTenant);
  });

  it("o tenant sabe que foi o suporte, não quem foi", async () => {
    const { items } = await page(
      "/api/audit?action=platform.",
      tenantOwner.cookie,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      support: true,
      actorId: null,
      actorName: null,
    });
    expect(JSON.stringify(items)).not.toContain(platformOwner.id);
  });

  it("marca o que foi feito personificado", async () => {
    const { items } = await page(
      "/api/audit?action=customer.created",
      tenantOwner.cookie,
    );

    expect(items[0]).toMatchObject({ support: true, actorId: tenantOwner.id });
    expect(JSON.stringify(items)).not.toContain(platformOwner.id);
  });

  it("filtra por ator e pagina", async () => {
    const byActor = await page(
      `/api/audit?actor=${tenantOwner.id}`,
      tenantOwner.cookie,
    );
    const nobody = await page(
      `/api/audit?actor=${randomUUID()}`,
      tenantOwner.cookie,
    );
    const farPage = await page("/api/audit?page=50", tenantOwner.cookie);

    expect(byActor.items.every(({ actorId }) => actorId === tenantOwner.id)).toBe(true);
    expect(byActor.total).toBeGreaterThan(0);
    expect(nobody.total).toBe(0);
    expect(farPage.items).toEqual([]);
    expect(farPage.total).toBeGreaterThan(0);
  });

  it("curinga do filtro de ação é literal", async () => {
    const { total } = await page("/api/audit?action=%25", tenantOwner.cookie);

    expect(total).toBe(0);
  });

  it("recusa filtro malformado", async () => {
    const response = await call("GET", "/api/audit?actor=nao-e-uuid", {
      cookie: tenantOwner.cookie,
    });

    expect(response.status).toBe(400);
  });

  it("sem audit:read não lê", async () => {
    const response = await call("GET", "/api/audit", {
      cookie: collaborator.cookie,
    });

    expect(response.status).toBe(403);
  });

  it("a plataforma filtra por tenant e vê quem agiu", async () => {
    const { items } = await page(
      `/api/admin/audit?tenant=${tenantId}&action=platform.`,
      platformOwner.cookie,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      actorId: platformOwner.id,
      tenantName: "Clínica Teste",
    });
  });

  it("a plataforma vê evento de conta, sem tenant", async () => {
    const { items } = await page(
      `/api/admin/audit?actor=${platformOwner.id}&action=platform.`,
      platformOwner.cookie,
    );

    expect(items.length).toBeGreaterThan(0);
  });

  it("o suporte lê; quem é só de tenant não", async () => {
    const support = await makePlatformUser(owner, "platform_support");

    expect(
      (await call("GET", "/api/admin/audit", { cookie: support.cookie })).status,
    ).toBe(200);
    expect(
      (await call("GET", "/api/admin/audit", { cookie: tenantOwner.cookie })).status,
    ).toBe(403);
  });
});
