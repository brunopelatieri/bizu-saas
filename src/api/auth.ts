import { getSessionCookie } from "better-auth/cookies";
import { createMiddleware } from "hono/factory";
import { logError } from "@/api/log";
import { withImpersonator } from "@/lib/audit";
import { AUTH_COOKIE_PREFIX } from "@/lib/auth/constants";
import { getAuth } from "@/lib/auth/server";
import { type AuthUser, type PlatformRole, toAuthUser } from "@/lib/auth/types";

export type AuthSession = { id: string; expiresAt: Date };

export type AuthEnv = {
  Variables: {
    user: AuthUser;
    session: AuthSession;
    activeOrganizationId: string | null;
  };
};

export type ResolvedSession = {
  user: AuthUser;
  session: AuthSession;
  activeOrganizationId?: string | null;
};

/** Retorna a sessão dos cookies, `null` se não houver e lança se o Auth falhar. */
export type ResolveSession = (headers: Headers) => Promise<ResolvedSession | null>;

/**
 * Lê a sessão no banco, sem o cache do cookie: a sessão revogada cai na hora, não
 * em até 5 minutos.
 */
export const resolveSession: ResolveSession = async (headers) => {
  const result = await getAuth().api.getSession({
    headers,
    query: { disableCookieCache: true },
  });

  if (!result) return null;

  return {
    user: toAuthUser(result),
    session: { id: result.session.id, expiresAt: result.session.expiresAt },
    activeOrganizationId: result.session.activeOrganizationId,
  };
};

/**
 * Exige sessão válida e e-mail verificado. O gate do `ProtectedRoute` roda no cliente
 * e não protege dados: toda rota privada da API deve usar este middleware.
 * Falha fechada: se o Auth estiver indisponível, a rota não abre.
 */
export function createRequireAuth(resolve: ResolveSession) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const { headers } = c.req.raw;

    // Sem cookie não há o que consultar: o Auth e o banco nem são chamados.
    if (!getSessionCookie(headers, { cookiePrefix: AUTH_COOKIE_PREFIX })) {
      return c.json({ error: "Autenticação necessária." }, 401);
    }

    let resolved: ResolvedSession | null;

    try {
      resolved = await resolve(headers);
    } catch (error) {
      logError("Falha ao validar sessão", error);
      return c.json({ error: "Autenticação indisponível." }, 503);
    }

    if (!resolved) {
      return c.json({ error: "Sessão inválida ou expirada." }, 401);
    }

    if (!resolved.user.emailVerified) {
      return c.json(
        { error: "Confirme seu e-mail para entrar.", code: "EMAIL_NOT_VERIFIED" },
        403,
      );
    }

    c.set("user", resolved.user);
    c.set("session", resolved.session);
    c.set("activeOrganizationId", resolved.activeOrganizationId ?? null);

    const { impersonatedBy } = resolved.user;

    if (impersonatedBy) await withImpersonator(impersonatedBy, next);
    else await next();
  });
}

export const requireAuth = createRequireAuth(resolveSession);

const PLATFORM_STAFF: PlatformRole[] = ["platform_owner", "platform_support"];

/** Em produção, papel de plataforma sem 2FA não entra: é a conta mais visada do sistema. */
export function missingPlatform2fa(user: AuthUser) {
  return (
    process.env.NODE_ENV === "production" &&
    PLATFORM_STAFF.includes(user.platformRole) &&
    !user.twoFactorEnabled
  );
}

/**
 * Vem depois de `requireAuth`. Restrinja a `platform_owner` nas rotas que o suporte
 * não pode usar. As rotas `/api/auth/two-factor/*` ficam de fora, e por elas se ativa o 2FA.
 */
export function requirePlatform(roles: PlatformRole[] = PLATFORM_STAFF) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    if (!roles.includes(c.get("user").platformRole)) {
      return c.json(
        { error: "Acesso restrito à plataforma.", code: "PLATFORM_FORBIDDEN" },
        403,
      );
    }

    if (missingPlatform2fa(c.get("user"))) {
      return c.json(
        {
          error: "Ative a verificação em duas etapas para usar a administração.",
          code: "PLATFORM_2FA_REQUIRED",
        },
        403,
      );
    }

    await next();
  });
}
