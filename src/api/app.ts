import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "@/api/auth";
import { authRoutes } from "@/api/auth-ext";
import { logError } from "@/api/log";
import { rateLimit } from "@/api/rate-limit";
import { checkReady } from "@/api/ready";
import { emailWebhooks } from "@/api/webhooks-email";
import { getDb } from "@/db";
import { contactMessages } from "@/db/schema";
import { contactMessageSchema } from "@/lib/schemas/contact";

/**
 * App Hono com toda a lógica de negócio da API (/api/*).
 * É montado dentro do servidor SSR do React Router em src/server.ts,
 * rodando no mesmo processo Node — por isso não há mais necessidade de CORS
 * (front e API compartilham a mesma origem).
 *
 * Rota privada: use `requireAuth`, que coloca o usuário em `c.get("user")`.
 */
export const api = new Hono();

// Em todas as rotas, inclusive as páginas SSR, que passam por este middleware.
// HSTS fica com o reverse proxy, que conhece o domínio e seus subdomínios.
api.use("*", secureHeaders({ strictTransportSecurity: false }));

// Vem antes de `requireAuth`: cada sessão validada consulta o banco.
const authRateLimit = rateLimit({ limit: 60, windowMs: 60 * 1000 });

api.get("/api/health", (c) => c.json({ ok: true }));

// Prontidão (banco + fila): o motivo da falha não vai na resposta.
api.get("/api/ready", async (c) => {
  const { ok, ...checks } = await checkReady();
  return c.json(checks, ok ? 200 : 503);
});

api.route("/", emailWebhooks);

// Better Auth em /api/auth/* e rotas próprias em /api/auth-ext/* (src/api/auth-ext.ts).
api.route("/", authRoutes);

// `tenants`, `features` e `limits` são preenchidos a partir das fases 4 e 5.
api.get("/api/me", authRateLimit, requireAuth, (c) =>
  c.json({ user: c.get("user"), tenants: [], features: [], limits: {} }),
);

api.post(
  "/api/contact",
  rateLimit({ limit: 5, windowMs: 10 * 60 * 1000 }),
  bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) => c.json({ error: "Mensagem muito grande." }, 413),
  }),
  zValidator("json", contactMessageSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error:
            result.error.issues[0]?.message ?? "Preencha todos os campos.",
        },
        400,
      );
    }
  }),
  async (c) => {
    const body = c.req.valid("json");

    try {
      await getDb().insert(contactMessages).values(body);
    } catch (error) {
      logError("Falha ao salvar mensagem de contato", error);
      return c.json(
        { error: "Não foi possível enviar agora. Tente novamente." },
        500,
      );
    }

    return c.json({ ok: true });
  },
);
