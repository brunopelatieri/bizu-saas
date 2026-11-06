import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createVerificationGuard,
  type VerificationGuardEnv,
} from "@/api/verification-guard";

function buildApp(consume: (token: string) => Promise<boolean>) {
  const handler = vi.fn();
  const app = new Hono<VerificationGuardEnv>();

  app.post("/verify", createVerificationGuard(consume), (c) => {
    handler(c.get("verificationToken"));
    return c.json({ ok: true });
  });

  return { app, handler };
}

function post(app: Hono<VerificationGuardEnv>, token: string) {
  return app.request("/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

describe("verificationGuard", () => {
  it("deixa passar a emissão vigente e entrega o token ao handler", async () => {
    const { app, handler } = buildApp(async () => true);

    const response = await post(app, "vigente");

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith("vigente");
  });

  it("responde 400 sem chamar o handler se não há emissão vigente", async () => {
    const { app, handler } = buildApp(async () => false);

    const response = await post(app, "anterior");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Link inválido ou expirado.",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("falha fechada quando o banco está indisponível", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, handler } = buildApp(async () => {
      throw new Error("banco fora do ar");
    });

    const response = await post(app, "qualquer");

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
