import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import type { DestinationStream } from "pino";
import pino from "pino";

/**
 * Logger do servidor: JSON em uma linha, nível por `LOG_LEVEL`, `request_id` da requisição
 * em curso e `redact` nos campos que carregam dado pessoal ou credencial (`tech/14-deploy.md`).
 * Lê `process.env` direto, e não `getEnv()`: o log precisa funcionar mesmo quando a validação
 * do ambiente é justamente o que falhou.
 */

/** Campos mascarados em qualquer objeto logado, na raiz ou um nível abaixo. */
const SENSITIVE_FIELDS = [
  "email",
  "document",
  "password",
  "token",
  "secret",
  "phone",
] as const;

export const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'req.headers["set-cookie"]',
  "res.headers.cookie",
  'res.headers["set-cookie"]',
  ...SENSITIVE_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
];

const REDACTED = "[Redacted]";

const requestContext = new AsyncLocalStorage<{ requestId: string }>();

/** Tudo logado dentro de `fn` leva este `request_id`. */
export function withRequestId<T>(requestId: string, fn: () => T) {
  return requestContext.run({ requestId }, fn);
}

export function currentRequestId() {
  return requestContext.getStore()?.requestId;
}

/** `pino-pretty` é só de desenvolvimento: ausente, o log segue em JSON. */
function prettyStream(): DestinationStream | undefined {
  if (process.env.NODE_ENV !== "development") return undefined;

  try {
    const build = createRequire(import.meta.url)("pino-pretty") as (
      options: object,
    ) => DestinationStream;

    return build({ colorize: true, ignore: "pid,hostname" });
  } catch {
    return undefined;
  }
}

export type LoggerOptions = {
  level?: string;
  /** Padrão: stdout (ou `pino-pretty` em desenvolvimento). Testes passam o próprio. */
  stream?: DestinationStream;
};

export function createLogger({ level, stream }: LoggerOptions = {}) {
  return pino(
    {
      level: level ?? process.env.LOG_LEVEL ?? (process.env.VITEST ? "silent" : "info"),
      redact: { paths: REDACT_PATHS, censor: REDACTED },
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      mixin: () => {
        const request_id = currentRequestId();
        return request_id ? { request_id } : {};
      },
    },
    stream ?? prettyStream(),
  );
}

let instance: ReturnType<typeof createLogger> | undefined;

export function getLogger() {
  if (!instance) instance = createLogger();
  return instance;
}

/** Troca o logger em testes; `undefined` volta ao padrão. */
export function setLoggerForTests(next: ReturnType<typeof createLogger> | undefined) {
  instance = next;
}
