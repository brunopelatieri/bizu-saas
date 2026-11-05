import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "@/api/auth";
import { logError } from "@/api/log";
import { rateLimit } from "@/api/rate-limit";
import { getDb } from "@/db";
import { syncProfile } from "@/db/profiles";
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

// Vem antes de `requireAuth`: cada token validado é uma chamada ao Supabase Auth.
const authRateLimit = rateLimit({ limit: 60, windowMs: 60 * 1000 });

api.get("/api/health", (c) => c.json({ ok: true }));

api.get("/api/me", authRateLimit, requireAuth, async (c) => {
  try {
    const profile = await syncProfile(c.get("user"));
    return c.json({ profile });
  } catch (error) {
    logError("Falha ao sincronizar perfil", error);
    return c.json({ error: "Não foi possível carregar sua conta." }, 500);
  }
});

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
