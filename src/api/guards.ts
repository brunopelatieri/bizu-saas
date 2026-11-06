import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { rateLimit } from "@/api/rate-limit";
import { getEnv } from "@/lib/env";

export const MINUTE = 60 * 1000;

/** Vem antes de `requireAuth`: cada sessão validada consulta o banco. */
export const authRateLimit = rateLimit({ limit: 60, windowMs: MINUTE });

export const jsonBodyLimit = bodyLimit({
  maxSize: 16 * 1024,
  onError: (c) => c.json({ error: "Requisição muito grande." }, 413),
});

/**
 * Recusa `Origin` de outro site. O Better Auth só faz isso quando a requisição traz
 * cookie: sem esta checagem, cadastro e login aceitariam envio de qualquer origem.
 */
export const sameOrigin = createMiddleware(async (c, next) => {
  const origin = c.req.header("Origin");

  if (origin && origin !== new URL(getEnv().APP_URL).origin) {
    return c.json({ error: "Origem não permitida." }, 403);
  }

  await next();
});

export const validationError = (
  result: { success: boolean; error?: { issues: { message: string }[] } },
  c: Context,
) => {
  if (!result.success) {
    return c.json(
      { error: result.error?.issues[0]?.message ?? "Dados inválidos." },
      400,
    );
  }
};

/** Id malformado não chega ao banco: para quem pergunta, é só algo que não existe. */
export const validId = zValidator(
  "param",
  z.object({ id: z.uuid() }),
  (result, c) => {
    if (!result.success) return c.json({ error: "Não encontrado." }, 404);
  },
);
