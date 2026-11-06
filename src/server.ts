import { config } from "dotenv";
import { createHonoServer } from "react-router-hono-server/node";
import { api } from "@/api/app";
import { requestLogger } from "@/api/request-logger";
import { EnvError, getEnv } from "@/lib/env";

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
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

export default await createHonoServer({
  // O logger padrão grava `?token=` das páginas de verificação e reset.
  defaultLogger: false,
  configure(server) {
    server.use("*", requestLogger);
    // Rotas de negócio (/api/*) são resolvidas antes do handler SSR do RR7.
    server.route("/", api);
  },
});
