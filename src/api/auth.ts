import { createMiddleware } from "hono/factory";
import { logError } from "@/api/log";
import type { AuthUser } from "@/lib/auth/types";

export type AuthEnv = { Variables: { user: AuthUser } };

/** Retorna o usuário do token, `null` se for inválido e lança se o Auth falhar. */
export type VerifyToken = (token: string) => Promise<AuthUser | null>;

/** Ponto único da autenticação no servidor: o novo provedor substitui esta função. */
const verifyToken: VerifyToken = async () => {
  throw new Error("Provedor de autenticação não configurado.");
};

/**
 * Exige `Authorization: Bearer <token>`. O gate do `ProtectedRoute` roda no cliente
 * e não protege dados: toda rota privada da API deve usar este middleware.
 * Falha fechada: se o Auth estiver indisponível, a rota não abre.
 */
export function createRequireAuth(verify: VerifyToken) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = c.req.header("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (!token) {
      return c.json({ error: "Autenticação necessária." }, 401);
    }

    let user: AuthUser | null;

    try {
      user = await verify(token);
    } catch (error) {
      logError("Falha ao validar token", error);
      return c.json({ error: "Autenticação indisponível." }, 503);
    }

    if (!user) {
      return c.json({ error: "Sessão inválida ou expirada." }, 401);
    }

    c.set("user", user);
    await next();
  });
}

export const requireAuth = createRequireAuth(verifyToken);
