import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DrizzleQueryError } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getLogger } from "@/lib/logger";

/**
 * Observabilidade: o logger JSON (`src/lib/logger.ts`) e, opcionalmente, o envio de erros a um
 * serviço externo. O serviço é um módulo em `monitoring/<id>/` que só carrega com a variável
 * dele (`SENTRY_DSN`): apagar a pasta e a variável o remove, sem quebrar typecheck nem testes.
 */

export type MonitoringModule = {
  id: string;
  init(options: { dsn: string; environment: string }): void;
  /** Recebe um erro já sem dado pessoal (`toSafeError`). */
  capture(error: Error, context: string): void;
  flush(timeoutMs: number): Promise<void>;
};

type ModuleLoader = () => Promise<{ default: MonitoringModule }>;

/** `tsx` (worker em dev) não é Vite: lá o `glob` não existe e a pasta é lida à mão. */
function discover(): Record<string, ModuleLoader> {
  try {
    return import.meta.glob<{ default: MonitoringModule }>("./monitoring/*/index.ts");
  } catch {
    const root = path.join(import.meta.dirname, "monitoring");
    const file = path.join(root, "sentry", "index.ts");

    return existsSync(file)
      ? {
          "./monitoring/sentry/index.ts": () =>
            import(pathToFileURL(file).href) as Promise<{ default: MonitoringModule }>,
        }
      : {};
  }
}

const EMAIL = /[^\s@"'<>()[\],;:]+@[^\s@"'<>()[\],;:]+\.[^\s@"'<>()[\],;:]+/g;
const URL_CREDENTIALS = /\/\/[^/@\s]+@/g;

/** Tira e-mail e credencial de URL de um texto de erro. */
export function scrubMessage(message: string) {
  return message.replace(URL_CREDENTIALS, "//***@").replace(EMAIL, "***@***");
}

/**
 * A mensagem do `DrizzleQueryError` traz os parâmetros da query (dado pessoal): ela e a primeira
 * linha da pilha, que a repete, não saem. Os outros erros mantêm a mensagem, sem e-mails.
 */
export function describeError(error: unknown): {
  name: string;
  code?: string;
  message?: string;
} {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    const isDrizzle = error instanceof DrizzleQueryError;
    const source = isDrizzle && cause instanceof Error ? cause : error;
    const { code } = source as { code?: string };

    return isDrizzle
      ? { name: source.name, code }
      : { name: error.name, code, message: scrubMessage(error.message) };
  }

  return { name: "UnknownError" };
}

/** Um `Error` novo, com a pilha sem a linha da mensagem original. */
export function toSafeError(error: unknown) {
  const { name, code, message } = describeError(error);
  const safe = new Error(message ?? code ?? name);
  safe.name = name;

  const frames =
    error instanceof Error
      ? (error.stack ?? "")
          .split("\n")
          .filter((line) => line.trimStart().startsWith("at "))
      : [];
  safe.stack = [`${name}: ${safe.message}`, ...frames].join("\n");

  return safe;
}

let active: MonitoringModule | undefined;

/** Chame uma vez na subida do servidor e do worker. Sem DSN, nada é carregado. */
export async function initObservability() {
  const { SENTRY_DSN, NODE_ENV } = getEnv();
  if (!SENTRY_DSN || active) return;

  const loader = discover()["./monitoring/sentry/index.ts"];

  if (!loader) {
    getLogger().warn("SENTRY_DSN definido, mas o módulo monitoring/sentry foi removido.");
    return;
  }

  try {
    const { default: module } = await loader();
    module.init({ dsn: SENTRY_DSN, environment: NODE_ENV });
    active = module;
  } catch {
    // Monitoramento nunca derruba o servidor: o erro fica no log, sem o DSN.
    getLogger().error("Falha ao iniciar o módulo de monitoramento.");
  }
}

/** Envia ao serviço, se houver. Nunca lança: quem chama já está tratando um erro. */
export function reportError(error: unknown, context: string) {
  try {
    active?.capture(toSafeError(error), context);
  } catch {
    // ignorado: ver acima
  }
}

/** Esvazia a fila de envio antes de o processo sair. */
export async function flushObservability(timeoutMs = 2000) {
  await active?.flush(timeoutMs).catch(() => undefined);
}

/** Só para testes. */
export function setMonitoringForTests(module: MonitoringModule | undefined) {
  active = module;
}
