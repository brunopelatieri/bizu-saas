import { Hono } from "hono";
import { captureLogs } from "@/lib/logger-capture";
import { afterEach, describe, expect, it } from "vitest";
import {
  cspReportRoutes,
  createCsrfGuard,
  createSecurityHeaders,
  describeViolation,
} from "@/api/security";

const APP_ORIGIN = "https://app.exemplo.com";
const HEADER_REPORT_ONLY = "Content-Security-Policy-Report-Only";
const HEADER_ENFORCE = "Content-Security-Policy";

function pageApp(reportOnly: boolean) {
  const app = new Hono<{ Variables: { secureHeadersNonce?: string } }>();

  app.use("*", createSecurityHeaders({ reportOnly }));
  app.get("/", (c) => c.text(c.get("secureHeadersNonce") ?? ""));

  return app;
}

function csrfApp() {
  const app = new Hono();

  app.use("/api/*", createCsrfGuard(() => APP_ORIGIN));
  app.on(["GET", "POST", "DELETE"], "/api/rota", (c) => c.json({ ok: true }));

  return app;
}

describe("cabeçalhos de segurança", () => {
  it("report-only: relata sem bloquear, e o X-Frame-Options segura o iframe", async () => {
    const response = await pageApp(true).request("/");

    expect(response.headers.get(HEADER_REPORT_ONLY)).toContain("default-src 'self'");
    expect(response.headers.has(HEADER_ENFORCE)).toBe(false);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("enforce: bloqueia, e frame-ancestors substitui o X-Frame-Options", async () => {
    const response = await pageApp(false).request("/");

    expect(response.headers.get(HEADER_ENFORCE)).toContain("frame-ancestors 'none'");
    expect(response.headers.has(HEADER_REPORT_ONLY)).toBe(false);
    expect(response.headers.has("X-Frame-Options")).toBe(false);
  });

  it("traz as diretivas da spec", async () => {
    const response = await pageApp(false).request("/");
    const policy = response.headers.get(HEADER_ENFORCE) ?? "";

    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "connect-src 'self'",
      "img-src 'self' data: https:",
      "report-uri /api/csp-report",
    ]) {
      expect(policy).toContain(directive);
    }

    expect(policy).toMatch(/script-src 'self' 'nonce-[\w+/=]+'/);
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it("nonce muda a cada requisição e é o mesmo do corpo", async () => {
    const app = pageApp(false);
    const first = await app.request("/");
    const second = await app.request("/");
    const nonce = await first.text();

    expect(nonce.length).toBeGreaterThan(16);
    expect(first.headers.get(HEADER_ENFORCE)).toContain(`'nonce-${nonce}'`);
    expect(await second.text()).not.toBe(nonce);
  });

  it("restringe referrer e recursos do navegador, sem HSTS", async () => {
    const response = await pageApp(false).request("/");

    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(response.headers.get("Permissions-Policy")).toContain("geolocation=()");
    expect(response.headers.has("Strict-Transport-Security")).toBe(false);
  });
});

describe("CSRF", () => {
  const post = (headers: Record<string, string>, method = "POST") =>
    csrfApp().request("/api/rota", { method, headers, body: "{}" });

  it("JSON com Origin de outro site responde 403", async () => {
    const response = await post({
      Origin: "https://atacante.exemplo",
      "Content-Type": "application/json",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Origem não permitida." });
  });

  it("formulário de outro site responde 403", async () => {
    for (const type of [
      "application/x-www-form-urlencoded",
      "multipart/form-data",
      "text/plain",
    ]) {
      const response = await post({
        Origin: "https://atacante.exemplo",
        "Content-Type": type,
      });

      expect(response.status).toBe(403);
    }
  });

  it("formulário sem Origin responde 403", async () => {
    const response = await post({
      "Content-Type": "application/x-www-form-urlencoded",
    });

    expect(response.status).toBe(403);
  });

  it("Origin null, de iframe com sandbox, responde 403", async () => {
    const response = await post({
      Origin: "null",
      "Content-Type": "application/json",
    });

    expect(response.status).toBe(403);
  });

  it("subdomínio não vale como a origem do app", async () => {
    const response = await post({
      Origin: "https://app.exemplo.com.atacante.exemplo",
      "Content-Type": "application/json",
    });

    expect(response.status).toBe(403);
  });

  it("DELETE com Origin de outro site responde 403", async () => {
    const response = await csrfApp().request("/api/rota", {
      method: "DELETE",
      headers: { Origin: "https://atacante.exemplo" },
    });

    expect(response.status).toBe(403);
  });

  it("a própria origem passa", async () => {
    const response = await post({
      Origin: APP_ORIGIN,
      "Content-Type": "application/json",
    });

    expect(response.status).toBe(200);
  });

  it("GET não é mutação", async () => {
    const response = await csrfApp().request("/api/rota", {
      headers: { Origin: "https://atacante.exemplo" },
    });

    expect(response.status).toBe(200);
  });
});

describe("POST /api/csp-report", () => {
  const logs = captureLogs();
  let ip = 0;

  function send(body: string) {
    ip += 1;

    return cspReportRoutes.request(
      "/api/csp-report",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/csp-report",
          "Content-Length": String(body.length),
        },
        body,
      },
      { incoming: { socket: { remoteAddress: `192.0.2.${ip}` } } },
    );
  }

  afterEach(() => {
    logs.clear();
  });

  const report = {
    "csp-report": {
      "document-uri":
        "https://app.exemplo.com/redefinir-senha?token=segredo&email=ana@exemplo.com",
      "effective-directive": "script-src-elem",
      "blocked-uri": "https://cdn.exemplo.com/lib.js?user=ana@exemplo.com",
    },
  };

  it("responde 204 e registra sem dado pessoal", async () => {
    const response = await send(JSON.stringify(report));

    expect(response.status).toBe(204);

    const logged = logs.text();

    expect(logged).toContain("script-src-elem");
    expect(logged).toContain("https://cdn.exemplo.com");
    expect(logged).toContain("/redefinir-senha");
    expect(logged).not.toContain("segredo");
    expect(logged).not.toContain("ana@exemplo.com");
  });

  it("corpo inválido responde 204 sem registrar", async () => {
    for (const body of ["não é json", "{}", '{"csp-report":1}']) {
      expect((await send(body)).status).toBe(204);
    }

    expect(logs.lines).toHaveLength(0);
  });

  it("acima de 16 KB responde 413", async () => {
    const response = await send(JSON.stringify({ x: "a".repeat(17 * 1024) }));

    expect(response.status).toBe(413);
  });

  it("repetir demais o mesmo cliente responde 429", async () => {
    const app = new Hono();
    app.route("/", cspReportRoutes);
    const request = () =>
      app.request(
        "/api/csp-report",
        { method: "POST", body: "{}" },
        { incoming: { socket: { remoteAddress: "198.51.100.1" } } },
      );

    for (let attempt = 0; attempt < 30; attempt += 1) await request();

    expect((await request()).status).toBe(429);
  });
});

describe("describeViolation", () => {
  it("troca id por marcador e limita o texto", () => {
    const text = describeViolation({
      "document-uri":
        "https://app.exemplo.com/convite/3f2b8c1e-9d4a-4b7e-8f21-0a1b2c3d4e5f",
      "violated-directive": "style-src\nforjado",
      "blocked-uri": "inline",
    });

    expect(text).toBe(
      "diretiva=style-srcforjado bloqueado=inline pagina=/convite/:id",
    );
  });

  it("aguenta campo ausente", () => {
    expect(describeViolation({})).toBe(
      "diretiva=desconhecida bloqueado=desconhecida pagina=desconhecida",
    );
  });
});
