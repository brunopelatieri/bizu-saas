import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { getLogger, withRequestId } from "@/lib/logger";

export const REQUEST_ID_HEADER = "x-request-id";

const TOKEN_IN_QUERY = /([?&]token=)[^&\s]*/g;

/** Aceita só ids curtos e legíveis: o valor entra em log e em cabeçalho de resposta. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Tira da linha de log os tokens de `/verificar-email` e `/redefinir-senha`. */
export function redactTokens(line: string) {
  return line.replace(TOKEN_IN_QUERY, "$1***");
}

/** Id do cliente (proxy ou chamador) se for seguro; senão, um novo. */
export function resolveRequestId(incoming: string | undefined) {
  return incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/** Páginas e ativos não precisam de uma linha de log por requisição em `info`. */
const QUIET = ["/assets/", "/api/health", "/api/ready"];

/**
 * Log de requisições no lugar do padrão do `react-router-hono-server`, que grava a URL
 * inteira: um link de reset no log vale como senha por 1 hora. Cada requisição ganha um
 * `request_id` (o `x-request-id` recebido, se seguro, ou um novo), devolvido na resposta e
 * presente em toda linha de log escrita durante ela. Só o caminho é logado, sem a query.
 */
export const requestLogger = createMiddleware(async (c, next) => {
  const requestId = resolveRequestId(c.req.header(REQUEST_ID_HEADER));
  const startedAt = performance.now();

  await withRequestId(requestId, async () => {
    try {
      await next();
    } finally {
      c.res.headers.set(REQUEST_ID_HEADER, requestId);

      const { pathname } = new URL(c.req.url);
      const quiet = QUIET.some((prefix) => pathname.startsWith(prefix));

      getLogger()[quiet ? "debug" : "info"](
        {
          req: { method: c.req.method, path: redactTokens(pathname) },
          status: c.res.status,
          duration_ms: Math.round(performance.now() - startedAt),
        },
        "request",
      );
    }
  });
});
