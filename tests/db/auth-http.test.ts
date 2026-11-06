import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { type ServerType, serve } from "@hono/node-server";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "@/api/app";
import { waitForBackgroundTasks } from "@/lib/auth/background";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";

/**
 * O mesmo adaptador de produção, sobre HTTP de verdade. `api.request()` entrega um
 * `Request` nativo; o @hono/node-server entrega um objeto próprio, e o que funciona em
 * um pode quebrar no outro (`new Request(c.req.raw)`, por exemplo).
 */

const DOMAIN = "auth-http-test.bizu.local";
const ORIGIN = "http://localhost:5173";

describe("autenticação sobre o servidor Node", () => {
  const mail = createMemoryProvider();
  let server: ServerType;
  let base: string;
  let owner: postgres.Sql;

  function post(path: string, body: unknown, cookie?: string) {
    return fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        "X-Forwarded-For": "10.21.0.1",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    const url = process.env.DIRECT_URL;
    if (!url) throw new Error("DIRECT_URL não definida");
    owner = postgres(url, { max: 1 });
    setEmailProviderForTests(mail);

    await new Promise<void>((resolve) => {
      server = serve({ fetch: api.fetch, port: 0 }, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await owner`delete from "user" where email like ${`%@${DOMAIN}`}`;
    await owner`delete from rate_limit where key like '10.21.%'`;
    await owner.end();
    setEmailProviderForTests(undefined);
  });

  it("sessão anônima responde 200 sem dados", async () => {
    const response = await fetch(`${base}/api/auth/get-session`);

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("cadastro, confirmação, /api/me e login", async () => {
    const email = `${randomUUID()}@${DOMAIN}`;
    const password = "senha-forte-123";

    const signup = await post("/api/auth/sign-up/email", {
      name: "Ana",
      email,
      password,
      acceptTerms: true,
      termsVersion: "2026-11",
    });
    expect(signup.status).toBe(200);

    await waitForBackgroundTasks();
    const link = mail.sent.at(-1)?.text.match(/token=(\S+)/)?.[1];
    expect(link).toBeTruthy();

    const verified = await post("/api/auth/verify-email", {
      token: decodeURIComponent(link ?? ""),
    });
    expect(verified.status).toBe(200);

    const cookie = verified.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const me = await fetch(`${base}/api/me`, { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);

    const login = await post("/api/auth/sign-in/email", { email, password });
    expect(login.status).toBe(200);
  });
});
