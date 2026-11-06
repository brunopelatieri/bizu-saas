import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  type AuthEnv,
  createRequireAuth,
  requireAuth,
  type VerifyToken,
} from "@/api/auth";
import type { AuthUser } from "@/lib/auth/types";

const user: AuthUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "ana@example.com",
  fullName: "Ana",
};

function buildApp(guard: ReturnType<typeof createRequireAuth>) {
  const app = new Hono<AuthEnv>();
  app.get("/private", guard, (c) => c.json({ id: c.get("user").id }));
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
    const response = await get(buildApp(createRequireAuth(verify)));

    expect(response.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it("recusa esquema diferente de Bearer", async () => {
    const verify = vi.fn<VerifyToken>();
    const response = await get(buildApp(createRequireAuth(verify)), "Basic abc");

    expect(response.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it("recusa token inválido", async () => {
    const guard = createRequireAuth(async () => null);
    const response = await get(buildApp(guard), "Bearer ruim");

    expect(response.status).toBe(401);
  });

  it("falha fechada quando o Auth está indisponível", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const guard = createRequireAuth(async () => {
      throw new Error("indisponível");
    });
    const response = await get(buildApp(guard), "Bearer bom");

    expect(response.status).toBe(503);
    spy.mockRestore();
  });

  it("libera a rota e expõe o usuário quando o token é válido", async () => {
    const verify = vi.fn<VerifyToken>(async () => user);
    const response = await get(buildApp(createRequireAuth(verify)), "Bearer bom");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: user.id });
    expect(verify).toHaveBeenCalledWith("bom");
  });

  it("sem provedor configurado, nenhum token abre a rota", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get(buildApp(requireAuth), "Bearer qualquer");

    expect(response.status).toBe(503);
    spy.mockRestore();
  });
});
