import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { type ServerType, serve } from "@hono/node-server";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "@/api/app";
import { waitForBackgroundTasks } from "@/lib/auth/background";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import {
  addMember,
  cleanUp,
  connectOwner,
  createRole,
  createTenant,
  createUser,
  type TestUser,
} from "./tenant-helpers";

/**
 * Rotas de equipe sobre HTTP de verdade. `fetch` manda DELETE sem `Content-Length`, e o
 * `bodyLimit` do Hono então remonta a `Request`: isso só funciona com o `Request` global
 * do @hono/node-server, ligado em `src/server.ts`. `api.request()` não passa por aí.
 */

const ORIGIN = "http://localhost:5173";

describe("rotas de equipe sobre o servidor Node", () => {
  let server: ServerType;
  let base: string;
  let owner: postgres.Sql;
  let tenantOwner: TestUser;
  let tenantId: string;
  let ipCounter = 0;

  function request(method: string, path: string, init: RequestInit = {}) {
    ipCounter += 1;

    return fetch(`${base}${path}`, {
      method,
      ...init,
      headers: {
        Cookie: tenantOwner.cookie,
        Origin: ORIGIN,
        "X-Forwarded-For": `10.41.0.${ipCounter}`,
        ...init.headers,
      },
    });
  }

  beforeAll(async () => {
    setEmailProviderForTests(createMemoryProvider());
    owner = connectOwner();

    tenantOwner = await createUser(owner);
    tenantId = (await createTenant(tenantOwner)).id;

    await new Promise<void>((resolve) => {
      server = serve({ fetch: api.fetch, port: 0 }, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    setEmailProviderForTests(undefined);
    await cleanUp(owner);
    await owner.end();
  });

  it("o servidor de produção usa o mesmo Request destes testes", async () => {
    const entry = await readFile("src/server.ts", "utf8");

    expect(entry).toMatch(/overrideGlobalObjects:\s*true/);
  });

  it("DELETE sem corpo remove membro", async () => {
    const colleague = await createUser(owner);
    const memberId = await addMember(owner, tenantId, colleague, "member");

    const response = await request("DELETE", `/api/team/members/${memberId}`);

    expect(response.status).toBe(200);
  });

  it("DELETE sem corpo exclui papel", async () => {
    const role = await createRole(tenantOwner, "http-apagar", ["customer:read"]);

    const response = await request("DELETE", `/api/roles/${role.id}`);

    expect(response.status).toBe(200);
  });

  it("POST sem corpo reenvia e DELETE revoga o convite", async () => {
    const invited = await request("POST", "/api/team/invitations", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "http@tenant-test.bizu.local", role: "member" }),
    });
    expect(invited.status).toBe(201);
    await waitForBackgroundTasks();

    const { invitation } = (await invited.json()) as {
      invitation: { id: string };
    };

    const resent = await request(
      "POST",
      `/api/team/invitations/${invitation.id}/resend`,
    );
    const revoked = await request(
      "DELETE",
      `/api/team/invitations/${invitation.id}`,
    );

    expect(resent.status).toBe(200);
    expect(revoked.status).toBe(200);
  });

  it("corpo chunked acima do limite responde 413", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("a".repeat(20 * 1024)));
        controller.close();
      },
    });

    const response = await request("POST", "/api/tenant", {
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);

    expect(response.status).toBe(413);
  });
});
