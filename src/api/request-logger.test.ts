import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { redactTokens, requestLogger } from "@/api/request-logger";

describe("redactTokens", () => {
  it("mascara o token e mantém o resto da linha", () => {
    expect(redactTokens("<-- GET /redefinir-senha?token=abc123")).toBe(
      "<-- GET /redefinir-senha?token=***",
    );
    expect(redactTokens("--> GET /x?a=1&token=abc&b=2 200 3ms")).toBe(
      "--> GET /x?a=1&token=***&b=2 200 3ms",
    );
  });

  it("não mexe em URL sem token", () => {
    expect(redactTokens("<-- GET /login?next=%2Fapp")).toBe(
      "<-- GET /login?next=%2Fapp",
    );
  });
});

describe("requestLogger", () => {
  it("não grava o token no log da requisição", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = new Hono();
    app.use("*", requestLogger);
    app.get("/verificar-email", (c) => c.text("ok"));

    await app.request("/verificar-email?token=segredo");

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("/verificar-email");
    expect(logged).not.toContain("segredo");
    spy.mockRestore();
  });
});
