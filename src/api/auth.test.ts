import type { User } from "@supabase/supabase-js";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

const { createRequireAuth, verifySupabaseToken } = await import("@/api/auth");
import type { AuthEnv, VerifyToken } from "@/api/auth";

const user = { id: "11111111-1111-1111-1111-111111111111" } as User;

function buildApp(verify: VerifyToken) {
  const app = new Hono<AuthEnv>();
  app.get("/private", createRequireAuth(verify), (c) =>
    c.json({ id: c.get("user").id }),
  );
  return app;
}

function get(app: Hono<AuthEnv>, authorization?: string) {
  return app.request("/private", {
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe("requireAuth", () => {
  it("recusa requisição sem token, sem consultar o Auth", async () => {
    const verify = vi.fn<VerifyToken>();
    const response = await get(buildApp(verify));

    expect(response.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it("recusa esquema diferente de Bearer", async () => {
    const verify = vi.fn<VerifyToken>();
    const response = await get(buildApp(verify), "Basic abc");

    expect(response.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it("recusa token inválido", async () => {
    const response = await get(buildApp(async () => null), "Bearer ruim");

    expect(response.status).toBe(401);
  });

  it("falha fechada quando o Auth está indisponível", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const verify: VerifyToken = async () => {
      throw new Error("indisponível");
    };
    const response = await get(buildApp(verify), "Bearer bom");

    expect(response.status).toBe(503);
    spy.mockRestore();
  });

  it("libera a rota e expõe o usuário quando o token é válido", async () => {
    const verify = vi.fn<VerifyToken>(async () => user);
    const response = await get(buildApp(verify), "Bearer bom");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: user.id });
    expect(verify).toHaveBeenCalledWith("bom");
  });
});

describe("verifySupabaseToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getUser.mockReset();
  });

  function configure() {
    vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave");
  }

  it("retorna o usuário do token válido", async () => {
    configure();
    getUser.mockResolvedValue({ data: { user }, error: null });

    await expect(verifySupabaseToken("bom")).resolves.toBe(user);
  });

  it.each([400, 401, 403])("trata status %i como token inválido", async (status) => {
    configure();
    getUser.mockResolvedValue({ data: { user: null }, error: { status } });

    await expect(verifySupabaseToken("ruim")).resolves.toBeNull();
  });

  it.each([429, 500, 0])("trata status %i como falha do Auth", async (status) => {
    configure();
    getUser.mockResolvedValue({ data: { user: null }, error: { status } });

    await expect(verifySupabaseToken("bom")).rejects.toMatchObject({ status });
  });

  it("falha se o Supabase não estiver configurado", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");

    await expect(verifySupabaseToken("bom")).rejects.toThrow("não configurado");
  });
});
