import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { createMiddleware } from "hono/factory";
import { NONCE, secureHeaders } from "hono/secure-headers";
import { MINUTE } from "@/api/guards";
import { logError } from "@/api/log";
import { rateLimit } from "@/api/rate-limit";
import { getEnv } from "@/lib/env";
import { cspReportSchema } from "@/lib/schemas/security";

/**
 * Cabeçalhos, CSP com nonce e CSRF (`docs/context/tech/26-seguranca.md`).
 *
 * `style-src 'unsafe-inline'`: Sonner e Base UI injetam `<style>` em tempo de execução, e o
 * React grava `style=""` no HTML do SSR. As origens do Google Fonts vêm dos `links` de
 * `src/root.tsx`. Nova origem externa entra aqui, na diretiva certa, nunca em `default-src`.
 */
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", NONCE],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
  reportUri: "/api/csp-report",
};

/**
 * `reportOnly` relata sem bloquear, inclusive `frame-ancestors`. Por isso `X-Frame-Options`
 * só sai no modo enforce: antes disso, é ele que barra o iframe.
 * HSTS fica com o reverse proxy, que conhece o domínio e seus subdomínios.
 */
export function createSecurityHeaders({ reportOnly }: { reportOnly: boolean }) {
  return secureHeaders({
    strictTransportSecurity: false,
    referrerPolicy: "strict-origin-when-cross-origin",
    xFrameOptions: reportOnly ? "DENY" : false,
    permissionsPolicy: {
      accelerometer: [],
      camera: [],
      geolocation: [],
      gyroscope: [],
      magnetometer: [],
      microphone: [],
      payment: [],
      usb: [],
    },
    ...(reportOnly
      ? { contentSecurityPolicyReportOnly: cspDirectives }
      : { contentSecurityPolicy: cspDirectives }),
  });
}

/** O `.env.local` só é carregado depois de importar a API: resolve na 1ª requisição. */
let headers: ReturnType<typeof createSecurityHeaders> | undefined;

export const securityHeaders = createMiddleware((c, next) => {
  const value = process.env.CSP_REPORT_ONLY;
  headers ??= createSecurityHeaders({
    reportOnly: value !== "false" && value !== "0",
  });

  return headers(c, next);
});

const MUTATION = /^(POST|PUT|PATCH|DELETE)$/;
const FORBIDDEN = { error: "Origem não permitida." };

/**
 * `hono/csrf` só olha requisições com tipo de formulário, as que o navegador envia sem
 * preflight, e recusa também a que chega sem `Origin` nem `Sec-Fetch-Site`. A primeira
 * checagem completa o resto: qualquer mutação com `Origin` de outro site cai aqui.
 */
export function createCsrfGuard(appOrigin: () => string) {
  const formGuard = csrf({ origin: (origin) => origin === appOrigin() });

  return createMiddleware(async (c, next) => {
    const origin = c.req.header("Origin");

    if (MUTATION.test(c.req.method) && origin && origin !== appOrigin()) {
      return c.json(FORBIDDEN, 403);
    }

    try {
      await formGuard(c, async () => {});
    } catch {
      return c.json(FORBIDDEN, 403);
    }

    await next();
  });
}

/** Rotas próprias de mutação. Webhooks ficam antes dela: quem os autentica é a assinatura. */
export const csrfGuard = createCsrfGuard(
  () => new URL(getEnv().APP_URL).origin,
);

const MAX_LOGGED_LENGTH = 200;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Só a origem: caminho e query podem trazer token, e-mail ou outro dado do usuário. */
function originOf(value: string | undefined) {
  if (!value) return "desconhecida";

  try {
    return new URL(value).origin;
  } catch {
    // `inline`, `eval`, `data`: palavras do navegador, não URLs.
    return value.slice(0, 20).replace(/[^\w-]/g, "");
  }
}

function pathOf(value: string | undefined) {
  if (!value) return "desconhecida";

  try {
    return new URL(value).pathname
      .replace(UUID, ":id")
      .slice(0, MAX_LOGGED_LENGTH);
  } catch {
    return "desconhecida";
  }
}

class CspViolation extends Error {
  override name = "CspViolation";
}

/** Texto do relatório vai para o log sem a URL completa, com um tamanho máximo. */
export function describeViolation(report: {
  "document-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-uri"?: string;
}) {
  const directive = report["effective-directive"] ?? report["violated-directive"];

  return [
    `diretiva=${(directive ?? "desconhecida").replace(/[^\w -]/g, "").slice(0, 40)}`,
    `bloqueado=${originOf(report["blocked-uri"])}`,
    `pagina=${pathOf(report["document-uri"])}`,
  ].join(" ");
}

export const cspReportRoutes = new Hono();

/** O navegador só quer saber se foi entregue: relatório inválido responde igual. */
cspReportRoutes.post(
  "/api/csp-report",
  rateLimit({ name: "csp-report", limit: 30, windowMs: MINUTE }),
  bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) => c.json({ error: "Requisição muito grande." }, 413),
  }),
  async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = cspReportSchema.safeParse(body);

    if (parsed.success) {
      logError(
        "Violação de CSP",
        new CspViolation(describeViolation(parsed.data["csp-report"])),
      );
    }

    return c.body(null, 204);
  },
);
