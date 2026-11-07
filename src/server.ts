import { config } from "dotenv";
import type { SecureHeadersVariables } from "hono/secure-headers";
import { RouterContextProvider } from "react-router";
import { createHonoServer } from "react-router-hono-server/node";
import { api } from "@/api/app";
import { logError } from "@/api/log";
import { requestLogger } from "@/api/request-logger";
import { SCHEMA_BEHIND_MESSAGE, schemaIsBehind } from "@/db/schema-status";
import { cspNonceRouterContext } from "@/lib/csp-nonce";
import { EnvError, getEnv } from "@/lib/env";
import { getLogger } from "@/lib/logger";
import { flushObservability, initObservability } from "@/lib/observability";
import { getProviders } from "@/lib/payments/registry";
import { getStorage } from "@/lib/storage";

// Em desenvolvimento, carrega variáveis do .env.local (DATABASE_URL etc.).
// Em produção (Docker/VPS) as variáveis são injetadas pelo container.
if (process.env.NODE_ENV !== "production") {
  config({ path: ".env.local" });
  config();
}

// Valida tudo antes de aceitar requisições: falta de variável derruba o processo
// com a lista do que falta, sem imprimir valores (src/lib/env.ts).
try {
  getEnv();
  // `PAYMENT_PROVIDERS` com id sem módulo também é configuração errada, não erro na 1ª venda.
  getProviders();
  // Idem para o armazenamento: módulo ausente é erro de configuração, não de primeiro upload.
  getStorage();
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

// Sentry (opcional): sem SENTRY_DSN nada é carregado.
await initObservability();

// Sem as migrations, `/api/health` responde 200 e o site vai ao ar quebrado: em produção, recusar
// subir é o que torna a falha visível. Em dev, o aviso basta para não travar quem está migrando.
try {
  if (await schemaIsBehind()) {
    console.error(SCHEMA_BEHIND_MESSAGE);
    if (getEnv().NODE_ENV === "production") process.exit(1);
  }
} catch (error) {
  // Banco fora ou sem permissão não prova que falta migration; /api/ready segue acusando.
  logError("Não foi possível conferir as migrations na subida", error);
}

// `node build/server/index.js --worker`: só os workers de jobs, sem HTTP (JOBS_MODE=worker).
// Também funciona em dev: `npx tsx --tsconfig tsconfig.app.json src/server.ts --worker`.
const workerOnly = process.argv.includes("--worker");

async function stopOnSignal(stop: () => Promise<void>) {
  const shutdown = () =>
    void stop()
      .then(() => flushObservability())
      .finally(() => process.exit(0));
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (workerOnly) {
  const { startJobs } = await import("@/jobs");
  const jobs = await startJobs({ consumer: "worker" });
  await stopOnSignal(jobs.stop);
  getLogger().info("Workers de jobs em execução (sem HTTP).");
} else if (getEnv().JOBS_MODE === "inline") {
  // Fila no mesmo processo. Com `off` ou `worker`, este processo só enfileira.
  const { startJobs } = await import("@/jobs");
  try {
    const jobs = await startJobs({ consumer: "inline" });
    await stopOnSignal(jobs.stop);
  } catch (error) {
    logError("Jobs não iniciaram; rode npm run jobs:install", error);
    // Em produção, seguir de pé deixaria a fila sem consumidor e sem retentativa, com
    // /api/ready em 200: é o que acontece se o restart cair entre `db:migrate` e `jobs:install`.
    // Encerrar faz o restart tentar de novo, como no `--worker`. Em dev, o site continua.
    if (getEnv().NODE_ENV === "production") {
      await flushObservability();
      process.exit(1);
    }
  }
}

// Em modo worker não há servidor HTTP; o export existe só para o formato do módulo.
export default workerOnly
  ? (undefined as unknown as Awaited<ReturnType<typeof createHonoServer>>)
  : await createHonoServer<{ Variables: SecureHeadersVariables }>({
      // O logger padrão grava `?token=` das páginas de verificação e reset.
      defaultLogger: false,
      // O `bodyLimit` do Hono remonta a `Request` quando não há `Content-Length`, como
      // em todo DELETE do navegador. Sem isto, responde 500 (`tests/db/tenant-http.test.ts`).
      overrideGlobalObjects: true,
      // O nonce da CSP nasce em `securityHeaders`, na mesma requisição (`entry.server.tsx`).
      getLoadContext: (c) => {
        const context = new RouterContextProvider();
        context.set(cspNonceRouterContext, c.get("secureHeadersNonce"));
        return context;
      },
      configure(server) {
        server.use("*", requestLogger);
        // Rotas de negócio (/api/*) são resolvidas antes do handler SSR do React Router.
        server.route("/", api);
      },
    });
