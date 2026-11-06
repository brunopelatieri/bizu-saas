import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { type ServerType, serve } from "@hono/node-server";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "@/api/app";
import { waitForBackgroundTasks } from "@/lib/auth/background";
import { setWebhookQueueForTests } from "@/lib/billing/inbox";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import { setProvidersForTests } from "@/lib/payments/registry";
import {
  createStubProvider,
  makePlatformUser,
  STUB_ID,
} from "./billing-helpers";
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
    await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      await tx`delete from payment_event where provider = ${STUB_ID}`;
    });
    await cleanUp(owner);
    await owner.end();
  });

  describe("rotas de cobrança", () => {
    const anyId = randomUUID();
    let platformCookie: string;

    beforeAll(async () => {
      setProvidersForTests([createStubProvider()]);
      platformCookie = (await makePlatformUser(owner, "platform_owner")).cookie;
    });

    afterAll(() => setProvidersForTests(undefined));

    it.each(["reactivate", "pause", "portal"])(
      "POST /api/billing/%s sem corpo chega à regra de negócio",
      async (route) => {
        const response = await request("POST", `/api/billing/${route}`);

        expect(response.status).toBe(409);
      },
    );

    it.each([
      `/api/admin/webhooks/${anyId}/reprocess`,
      `/api/admin/subscriptions/${anyId}/cancel`,
      `/api/admin/subscriptions/${anyId}/sync`,
    ])("POST %s sem corpo chega à regra de negócio", async (path) => {
      const response = await request("POST", path, {
        headers: { Cookie: platformCookie },
      });

      expect(response.status).toBe(404);
    });

    /** Sem `Content-Length`, como um cliente que manda o corpo em pedaços. */
    function streamed(size: number) {
      const chunk = "x".repeat(64 * 1024);
      const pieces = Math.ceil(size / chunk.length);
      let sent = 0;

      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= pieces) return controller.close();
          sent += 1;
          controller.enqueue(new TextEncoder().encode(chunk));
        },
      });
    }

    it("webhook em pedaços acima de 1 MB é recusado", async () => {
      const response = await fetch(`${base}/api/webhooks/payments/${STUB_ID}`, {
        method: "POST",
        headers: { "X-Stub-Signature": "ok", "X-Forwarded-For": "10.41.1.1" },
        body: streamed(2 * 1024 * 1024),
        duplex: "half",
      } as RequestInit);

      expect(response.status).toBe(413);
    });

    it("webhook sobre HTTP de verdade é recebido", async () => {
      const queued: string[] = [];
      setWebhookQueueForTests(async (id) => {
        queued.push(id);
      });

      const response = await fetch(`${base}/api/webhooks/payments/${STUB_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Stub-Signature": "ok",
          "X-Forwarded-For": "10.41.1.2",
        },
        body: JSON.stringify({ id: `evt_${randomUUID()}`, events: [] }),
      });
      setWebhookQueueForTests(undefined);

      expect(response.status).toBe(200);
      expect(queued).toHaveLength(1);
    });
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
