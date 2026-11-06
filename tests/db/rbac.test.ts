import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAuth } from "@/lib/auth/server";
import {
  allPermissions,
  permissionsOf,
  staticRoleCatalog,
} from "@/lib/auth/permissions";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import { makePlatformUser } from "./billing-helpers";
import {
  addMember,
  call,
  cleanUp,
  connectOwner,
  createRole,
  createTenant,
  createUser,
  type TestUser,
} from "./tenant-helpers";

/**
 * Matriz papel × endpoint × esperado, gerada do catálogo: papel novo ou rota nova entra
 * aqui e a expectativa sai das permissões, não de uma tabela copiada.
 *
 * Ids inexistentes e corpos inválidos: quem pode recebe 404 ou 400 depois da checagem,
 * sem alterar nada; quem não pode recebe 403 antes.
 */

const CUSTOM_ROLE = "matriz";
const CUSTOM_PERMISSIONS = [
  "customer:read",
  "invitation:create",
  "member:update",
];

const anyId = randomUUID();

const endpoints = [
  ["PATCH", "/api/tenant", "organization:update"],
  ["POST", "/api/team/invitations", "invitation:create"],
  ["POST", `/api/team/invitations/${anyId}/resend`, "invitation:create"],
  ["DELETE", `/api/team/invitations/${anyId}`, "invitation:cancel"],
  ["PATCH", `/api/team/members/${anyId}`, "member:update"],
  ["DELETE", `/api/team/members/${anyId}`, "member:delete"],
  ["GET", "/api/roles", "role:create"],
  ["POST", "/api/roles", "role:create"],
  ["PATCH", `/api/roles/${anyId}`, "role:update"],
  ["DELETE", `/api/roles/${anyId}`, "role:delete"],
  ["GET", "/api/billing/plans", "billing:read"],
  ["GET", "/api/billing/subscription", "billing:read"],
  ["GET", "/api/billing/invoices", "billing:read"],
  ["GET", `/api/billing/invoices/${anyId}`, "billing:read"],
  ["PUT", "/api/billing/profile", "billing:manage"],
  ["POST", "/api/billing/checkout", "billing:manage"],
  ["POST", "/api/billing/cancel", "billing:manage"],
  ["POST", "/api/billing/reactivate", "billing:manage"],
  ["POST", "/api/billing/pause", "billing:manage"],
  ["POST", "/api/billing/change-plan", "billing:manage"],
  ["POST", "/api/billing/portal", "billing:manage"],
] as const;

const catalog = { ...staticRoleCatalog, [CUSTOM_ROLE]: CUSTOM_PERMISSIONS };
const roles = Object.keys(catalog);

const matrix = roles.flatMap((role) =>
  endpoints.map(([method, path, permission]) => {
    const allowed = permissionsOf(catalog, role).includes(permission);
    return { role, method, path, permission, allowed };
  }),
);

describe("RBAC", () => {
  let owner: postgres.Sql;
  let tenantId: string;
  const users: Record<string, TestUser> = {};

  beforeAll(async () => {
    setEmailProviderForTests(createMemoryProvider());
    owner = connectOwner();

    const tenantOwner = await createUser(owner);
    tenantId = (await createTenant(tenantOwner)).id;
    users.owner = tenantOwner;

    await createRole(tenantOwner, CUSTOM_ROLE, CUSTOM_PERMISSIONS);

    for (const role of ["admin", "member", CUSTOM_ROLE]) {
      const user = await createUser(owner);
      await addMember(owner, tenantId, user, role);
      users[role] = user;
    }
  });

  afterAll(async () => {
    setEmailProviderForTests(undefined);
    await cleanUp(owner);
    await owner.end();
  });

  it.each(matrix)(
    "$role em $method $path: permitido = $allowed",
    async ({ role, method, path, allowed }) => {
      const response = await call(method, path, {
        cookie: users[role]?.cookie,
        body: method === "GET" || method === "DELETE" ? undefined : {},
      });
      const body = await response.clone().json();

      if (allowed) {
        expect(body.code).not.toBe("PERMISSION_DENIED");
        expect(response.status).toBeLessThan(500);
      } else {
        expect(response.status).toBe(403);
        expect(body.code).toBe("PERMISSION_DENIED");
      }
    },
  );

  it.each(endpoints)("%s %s exige sessão", async (method, path) => {
    const response = await call(method, path);

    expect(response.status).toBe(401);
  });

  describe("área da plataforma", () => {
    const reads = [
      ["GET", "/api/admin/webhooks"],
      ["GET", "/api/admin/subscriptions"],
    ] as const;
    const writes = [
      ["POST", `/api/admin/webhooks/${anyId}/reprocess`],
      ["POST", `/api/admin/subscriptions/${anyId}/cancel`],
      ["POST", `/api/admin/subscriptions/${anyId}/sync`],
    ] as const;
    let platformOwner: TestUser;
    let support: TestUser;

    beforeAll(async () => {
      platformOwner = await makePlatformUser(owner, "platform_owner");
      support = await makePlatformUser(owner, "platform_support");
    });

    it.each([...reads, ...writes])("%s %s exige sessão", async (method, path) => {
      expect((await call(method, path)).status).toBe(401);
    });

    it.each([...reads, ...writes])(
      "%s %s recusa o owner de um tenant",
      async (method, path) => {
        const response = await call(method, path, { cookie: users.owner?.cookie });

        expect(response.status).toBe(403);
      },
    );

    it.each(reads)("%s %s abre para o suporte", async (method, path) => {
      const response = await call(method, path, { cookie: support.cookie });

      expect(response.status).toBe(200);
    });

    it.each(writes)("%s %s recusa o suporte", async (method, path) => {
      const response = await call(method, path, { cookie: support.cookie });

      expect(response.status).toBe(403);
    });

    it.each(writes)("%s %s abre para o proprietário", async (method, path) => {
      const response = await call(method, path, { cookie: platformOwner.cookie });

      expect(response.status).toBe(404);
    });
  });

  it("sem tenant ativo, as rotas de tenant respondem 403", async () => {
    const user = await createUser(owner);
    const response = await call("GET", "/api/team", { cookie: user.cookie });

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("TENANT_REQUIRED");
  });

  it.each(roles)("/api/me de %s devolve as permissões do papel", async (role) => {
    const response = await call("GET", "/api/me", {
      cookie: users[role]?.cookie,
    });
    const body = await response.json();

    expect(new Set(body.permissions)).toEqual(
      new Set(permissionsOf(catalog, role)),
    );
    expect(body.user.activeTenant.id).toBe(tenantId);
    expect(body.user.activeTenant.permissions).toEqual(body.permissions);
    expect(body.tenants.map(({ id }: { id: string }) => id)).toEqual([tenantId]);
    // Features e limites vêm do plano padrão vigente (`tests/db/billing.test.ts`).
    expect(Array.isArray(body.features)).toBe(true);
    expect(typeof body.limits).toBe("object");
  });

  it.each(roles)(
    "o resultado de %s é o mesmo de hasPermission do plugin",
    async (role) => {
      const cookie = users[role]?.cookie ?? "";
      const expected = permissionsOf(catalog, role);

      for (const permission of allPermissions) {
        const [resource, action] = permission.split(":") as [string, string];
        const { success } = await getAuth().api.hasPermission({
          headers: new Headers({ Cookie: cookie }),
          body: {
            organizationId: tenantId,
            permissions: { [resource]: [action] },
          },
        });

        expect([permission, success]).toEqual([
          permission,
          expected.includes(permission),
        ]);
      }
    },
  );

  it("permissão nova de um papel personalizado vale na requisição seguinte", async () => {
    const role = await createRole(users.owner as TestUser, "muda", [
      "customer:read",
    ]);
    const user = await createUser(owner);
    await addMember(owner, tenantId, user, "muda");

    const before = await call("PATCH", "/api/tenant", {
      cookie: user.cookie,
      body: {},
    });
    await call("PATCH", `/api/roles/${role.id}`, {
      cookie: users.owner?.cookie,
      body: { permissions: ["organization:update"] },
    });
    const after = await call("PATCH", "/api/tenant", {
      cookie: user.cookie,
      body: {},
    });

    expect(before.status).toBe(403);
    expect(after.status).toBe(400);
  });
});
