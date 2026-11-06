import { DrizzleQueryError } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("TRUSTED_PROXY_HOPS", "1");

const values = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  getDb: () => ({ insert: () => ({ values }) }),
}));

const { api } = await import("@/api/app");

const valid = { name: "Ana", email: "ana@example.com", message: "Olá" };

function contact(body: unknown, ip: string) {
  return api.request("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    values.mockReset();
    values.mockResolvedValue(undefined);
  });

  it("salva mensagem válida", async () => {
    const response = await contact(valid, "10.0.0.1");

    expect(response.status).toBe(200);
    expect(values).toHaveBeenCalledOnce();
  });

  it("recusa mensagem acima do limite do schema", async () => {
    const response = await contact(
      { ...valid, message: "a".repeat(5001) },
      "10.0.0.2",
    );

    expect(response.status).toBe(400);
    expect(values).not.toHaveBeenCalled();
  });

  it("recusa corpo acima do limite de tamanho", async () => {
    const response = await contact(
      { ...valid, message: "a".repeat(20 * 1024) },
      "10.0.0.3",
    );

    expect(response.status).toBe(413);
  });

  it("não expõe detalhes internos quando o banco falha", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    values.mockRejectedValue(new Error("postgres://user:senha@host/db"));

    const response = await contact(valid, "10.0.0.4");
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("senha");
    expect(text).not.toContain("DATABASE_URL");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("senha");
    spy.mockRestore();
  });

  it("não grava no log os dados pessoais de uma query que falhou", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("falha"), { code: "42501" });
    values.mockRejectedValue(
      new DrizzleQueryError("insert", [valid.email, valid.message], cause),
    );

    await contact(valid, "10.0.0.8");

    expect(JSON.stringify(spy.mock.calls)).not.toContain(valid.email);
    expect(JSON.stringify(spy.mock.calls)).toContain("42501");
    spy.mockRestore();
  });

  it("mantém no log o diagnóstico de erros comuns", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    values.mockRejectedValue(new Error("DATABASE_URL is not set"));

    await contact(valid, "10.0.0.9");

    expect(JSON.stringify(spy.mock.calls)).toContain("DATABASE_URL is not set");
    spy.mockRestore();
  });

  it("limita tentativas por cliente sem afetar os demais", async () => {
    const ip = "10.0.0.5";
    for (let i = 0; i < 5; i += 1) await contact(valid, ip);

    const blocked = await contact(valid, ip);
    const other = await contact(valid, "10.0.0.6");

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(other.status).toBe(200);
  });

  it("não aceita IP forjado à esquerda do proxy para burlar o limite", async () => {
    const proxied = "10.0.0.7";
    for (let i = 0; i < 5; i += 1) {
      await contact(valid, `1.1.1.${i}, ${proxied}`);
    }

    const blocked = await contact(valid, `9.9.9.9, ${proxied}`);

    expect(blocked.status).toBe(429);
  });
});

describe("rotas privadas e headers", () => {
  it("/api/me exige autenticação", async () => {
    const response = await api.request("/api/me");

    expect(response.status).toBe(401);
  });

  it("envia headers de segurança na API e nas demais rotas", async () => {
    const apiResponse = await api.request("/api/health");
    const pageResponse = await api.request("/login");

    expect(apiResponse.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(pageResponse.headers.get("X-Frame-Options")).toBe("DENY");
    expect(pageResponse.headers.has("Content-Security-Policy-Report-Only")).toBe(true);
  });

  it("deixa o HSTS para o reverse proxy", async () => {
    const response = await api.request("/login");

    expect(response.headers.has("Strict-Transport-Security")).toBe(false);
  });

  it("limita /api/me antes de consultar o Auth", async () => {
    const headers = { "X-Forwarded-For": "10.0.1.1" };
    for (let i = 0; i < 60; i += 1) await api.request("/api/me", { headers });

    const blocked = await api.request("/api/me", { headers });

    expect(blocked.status).toBe(429);
  });
});
