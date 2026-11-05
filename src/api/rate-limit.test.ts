import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "@/api/rate-limit";

function buildApp(limit = 2, maxKeys?: number) {
  const app = new Hono();
  app.get("/", rateLimit({ limit, windowMs: 1000, maxKeys }), (c) => c.text("ok"));
  return app;
}

function get(app: Hono, forwardedFor?: string, address = "192.0.2.1") {
  return app.request(
    "/",
    { headers: forwardedFor ? { "X-Forwarded-For": forwardedFor } : {} },
    { incoming: { socket: { remoteAddress: address } } },
  );
}

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("sem proxy confiável, ignora X-Forwarded-For forjado", async () => {
    const app = buildApp();

    await get(app, "1.1.1.1");
    await get(app, "2.2.2.2");
    const blocked = await get(app, "3.3.3.3");

    expect(blocked.status).toBe(429);
  });

  it("sem proxy, separa clientes pelo IP da conexão", async () => {
    const app = buildApp(1);

    await get(app, undefined, "192.0.2.1");
    const blocked = await get(app, undefined, "192.0.2.1");
    const other = await get(app, undefined, "192.0.2.2");

    expect(blocked.status).toBe(429);
    expect(other.status).toBe(200);
  });

  it("falha do servidor não consome a tentativa", async () => {
    const app = new Hono();
    let status: 200 | 500 = 500;
    app.get("/", rateLimit({ limit: 1, windowMs: 1000 }), (c) =>
      c.text("resposta", status),
    );

    for (let i = 0; i < 3; i += 1) {
      expect((await get(app)).status).toBe(500);
    }

    status = 200;
    expect((await get(app)).status).toBe(200);
    expect((await get(app)).status).toBe(429);
  });

  it("com um proxy, ignora o que o cliente envia à esquerda", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const app = buildApp();

    await get(app, "1.1.1.1, 10.0.0.1");
    await get(app, "2.2.2.2, 10.0.0.1");
    const blocked = await get(app, "3.3.3.3, 10.0.0.1");
    const other = await get(app, "10.0.0.2");

    expect(blocked.status).toBe(429);
    expect(other.status).toBe(200);
  });

  it("com dois proxies, usa o IP adicionado pelo primeiro deles", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    const app = buildApp(1);

    await get(app, "forjado-1, 10.0.0.1, 172.16.0.1");
    const blocked = await get(app, "forjado-2, 10.0.0.1, 172.16.0.1");
    const other = await get(app, "10.0.0.2, 172.16.0.1");

    expect(blocked.status).toBe(429);
    expect(other.status).toBe(200);
  });

  it("libera o cliente depois da janela", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const app = buildApp(1);

    await get(app, "10.0.0.1");
    expect((await get(app, "10.0.0.1")).status).toBe(429);

    vi.advanceTimersByTime(1001);

    expect((await get(app, "10.0.0.1")).status).toBe(200);
  });

  it("no limite de chaves, descarta a mais antiga sem zerar as demais", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const app = buildApp(1, 3);

    await get(app, "a");
    vi.advanceTimersByTime(1);
    await get(app, "b");
    vi.advanceTimersByTime(1);
    await get(app, "c");
    vi.advanceTimersByTime(1);
    await get(app, "d");

    expect((await get(app, "c")).status).toBe(429);
    expect((await get(app, "a")).status).toBe(200);
  });
});
