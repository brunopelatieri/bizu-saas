import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import {
  REQUEST_ID_HEADER,
  redactTokens,
  requestLogger,
  resolveRequestId,
} from "@/api/request-logger";
import { createLogger, currentRequestId, setLoggerForTests } from "@/lib/logger";

describe("redactTokens", () => {
  it("mascara o token e mantém o resto da linha", () => {
    expect(redactTokens("GET /redefinir-senha?token=abc123")).toBe(
      "GET /redefinir-senha?token=***",
    );
    expect(redactTokens("GET /x?a=1&token=abc&b=2")).toBe("GET /x?a=1&token=***&b=2");
  });

  it("não mexe em URL sem token", () => {
    expect(redactTokens("GET /login?next=%2Fapp")).toBe("GET /login?next=%2Fapp");
  });
});

describe("resolveRequestId", () => {
  it("aceita um id seguro vindo do proxy", () => {
    expect(resolveRequestId("req-1234abcd")).toBe("req-1234abcd");
  });

  it("gera outro quando o id é inseguro, curto ou ausente", () => {
    for (const bad of ["a", "tem espaço e \n quebra", "x".repeat(200), undefined]) {
      const id = resolveRequestId(bad);
      expect(id).not.toBe(bad);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

function capture() {
  const lines: Array<Record<string, unknown>> = [];
  setLoggerForTests(
    createLogger({
      level: "info",
      stream: { write: (line: string) => void lines.push(JSON.parse(line)) },
    }),
  );
  return lines;
}

afterEach(() => setLoggerForTests(undefined));

describe("requestLogger", () => {
  it("não grava o token nem a query no log da requisição", async () => {
    const lines = capture();
    const app = new Hono();
    app.use("*", requestLogger);
    app.get("/verificar-email", (c) => c.text("ok"));

    await app.request("/verificar-email?token=segredo");

    expect(JSON.stringify(lines)).not.toContain("segredo");
    expect(lines[0]).toMatchObject({
      msg: "request",
      req: { method: "GET", path: "/verificar-email" },
      status: 200,
    });
  });

  it("devolve o x-request-id e o repassa às linhas escritas durante a requisição", async () => {
    const lines = capture();
    const app = new Hono();
    app.use("*", requestLogger);
    let seen: string | undefined;
    app.get("/x", (c) => {
      seen = currentRequestId();
      return c.text("ok");
    });

    const response = await app.request("/x", {
      headers: { [REQUEST_ID_HEADER]: "abc-12345678" },
    });

    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("abc-12345678");
    expect(seen).toBe("abc-12345678");
    expect(lines[0]?.request_id).toBe("abc-12345678");
  });

  it("gera um id quando a requisição não traz, inclusive em resposta de erro", async () => {
    capture();
    const app = new Hono();
    app.use("*", requestLogger);
    app.get("/x", (c) => c.json({ error: "x" }, 500));

    const response = await app.request("/x");

    expect(response.status).toBe(500);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
