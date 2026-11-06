import { Hono } from "hono";
import { type AuthEnv, requireAuth } from "@/api/auth";
import { authRateLimit, jsonBodyLimit, sameOrigin, validId } from "@/api/guards";
import { blockWhileImpersonating } from "@/api/impersonation";
import { clientKey } from "@/api/rate-limit";
import { handleTenantError } from "@/api/tenant-errors";
import { audit } from "@/lib/audit";
import { getAuth } from "@/lib/auth/server";
import { findOwnSessionToken, listOwnSessions } from "@/lib/auth/sessions";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";

const NOT_FOUND = "Sessão não encontrada.";

/**
 * Sessões da equipe (`/app/configuracoes/sessoes`). As rotas do plugin ficam fechadas: aqui há
 * auditoria, e o navegador nunca vê o token. Personificado não lê nem derruba sessão de ninguém.
 */
export const sessionRoutes = new Hono<AuthEnv>();

sessionRoutes.onError(handleTenantError);
sessionRoutes.use(
  "/api/me/sessions/*",
  sameOrigin,
  jsonBodyLimit,
  authRateLimit,
  requireAuth,
  blockWhileImpersonating,
);

sessionRoutes.get("/api/me/sessions", async (c) =>
  c.json({
    sessions: await listOwnSessions(c.get("user").id, c.get("session").id),
  }),
);

sessionRoutes.post("/api/me/sessions/revoke-others", async (c) => {
  await getAuth().api.revokeOtherSessions({ headers: c.req.raw.headers });
  await audit("auth.session_revoked", {
    actor: { id: c.get("user").id },
    metadata: { scope: "others" },
    ip: clientKey(c),
  });

  return c.json({ ok: true });
});

sessionRoutes.delete("/api/me/sessions/:id", validId, async (c) => {
  const { id } = c.req.valid("param");
  const user = c.get("user");

  if (id === c.get("session").id) {
    throw new TenantRuleError(
      400,
      "CURRENT_SESSION",
      "Para encerrar esta sessão, use Sair.",
    );
  }

  const token = await findOwnSessionToken(user.id, id);
  if (!token) throw notFound(NOT_FOUND);

  await getAuth().api.revokeSession({
    headers: c.req.raw.headers,
    body: { token },
  });
  await audit("auth.session_revoked", {
    actor: { id: user.id },
    target: { type: "session", id },
    metadata: { scope: "one" },
    ip: clientKey(c),
  });

  return c.json({ ok: true });
});
