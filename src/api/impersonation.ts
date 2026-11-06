import { zValidator } from "@hono/zod-validator";
import { isAPIError } from "better-auth/api";
import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { type AuthEnv, requireAuth, requirePlatform } from "@/api/auth";
import {
  authRateLimit,
  jsonBodyLimit,
  MINUTE,
  sameOrigin,
  validationError,
} from "@/api/guards";
import { clientKey, rateLimit } from "@/api/rate-limit";
import { handleTenantError } from "@/api/tenant-errors";
import {
  bindImpersonation,
  impersonationAccess,
  notifyImpersonationStarted,
  recordGrantUse,
  requestSupportAccess,
} from "@/lib/admin/impersonation";
import { audit } from "@/lib/audit";
import { runInBackground } from "@/lib/auth/background";
import { getAuth } from "@/lib/auth/server";
import { impersonateSchema } from "@/lib/schemas/admin";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";
import { findMembership } from "@/lib/tenant/membership";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Registra a tentativa e responde o 403 de quem está personificando. */
export async function refuseImpersonated(
  c: Context,
  session: {
    impersonatedBy: string;
    userId: string;
    tenantId: string | null | undefined;
  },
) {
  await audit("platform.impersonation_blocked_action", {
    actor: { type: "platform", id: session.impersonatedBy },
    impersonatorId: session.impersonatedBy,
    tenantId: session.tenantId,
    target: { type: "user", id: session.userId },
    metadata: { method: c.req.method, path: c.req.path },
    ip: clientKey(c),
  });

  return c.json(
    {
      error: "Esta ação não fica disponível durante a personificação.",
      code: "IMPERSONATION_BLOCKED",
    },
    403,
  );
}

/**
 * Vem depois de `requireAuth`. Recusa o que o suporte não faz em nome de ninguém: dinheiro,
 * propriedade, papéis e credenciais da conta (`spec-auth.md`).
 */
export const blockWhileImpersonating = createMiddleware<AuthEnv>(
  async (c, next) => {
    const { id, impersonatedBy } = c.get("user");

    if (!impersonatedBy) return next();

    return refuseImpersonated(c, {
      impersonatedBy,
      userId: id,
      tenantId: c.get("activeOrganizationId"),
    });
  },
);

/** Para grupos de rotas em que a leitura segue liberada e só a escrita é recusada. */
export const blockMutationsWhileImpersonating = createMiddleware<AuthEnv>(
  async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    return blockWhileImpersonating(c, next);
  },
);

/** O suporte confere sem insistir: cada tentativa sem consentimento pode gerar e-mail. */
const impersonateRateLimit = rateLimit({
  name: "impersonate",
  limit: 10,
  windowMs: MINUTE,
});

/**
 * Personificação com consentimento. As rotas `/admin/impersonate-user` e
 * `/admin/stop-impersonating` do plugin seguem fechadas por HTTP: tudo passa por aqui.
 *
 * Fica fora de `adminRoutes` porque quem encerra está na sessão do usuário personificado,
 * sem papel de plataforma: `requirePlatform` recusaria a saída.
 */
export const impersonationRoutes = new Hono<AuthEnv>();

impersonationRoutes.onError(handleTenantError);

impersonationRoutes.post(
  "/api/admin/impersonate",
  sameOrigin,
  jsonBodyLimit,
  impersonateRateLimit,
  requireAuth,
  requirePlatform(),
  zValidator("json", impersonateSchema, validationError),
  async (c) => {
    const { userId, tenantId, reason } = c.req.valid("json");
    const actor = c.get("user");

    if (!(await findMembership(userId, tenantId))) {
      throw notFound("Esta pessoa não faz parte da organização.");
    }

    const access = await impersonationAccess(tenantId);

    if (!access.allowed) {
      await requestSupportAccess({
        tenantId,
        targetUserId: userId,
        actorId: actor.id,
        reason,
        ip: clientKey(c),
      });

      throw new TenantRuleError(
        403,
        "IMPERSONATION_CONSENT_REQUIRED",
        "O proprietário ainda não liberou o acesso. Pedimos a autorização por e-mail.",
      );
    }

    const { headers, response } = await getAuth().api.impersonateUser({
      headers: c.req.raw.headers,
      body: { userId },
      returnHeaders: true,
    });

    const expiresAt = await bindImpersonation(
      response.session.id,
      tenantId,
      new Date(response.session.expiresAt),
      access.grant?.expiresAt,
    );

    if (access.grant) await recordGrantUse(access.grant.id, actor.id);

    await audit("platform.impersonation_started", {
      actor: { type: "platform", id: actor.id },
      impersonatorId: actor.id,
      tenantId,
      target: { type: "user", id: userId },
      metadata: {
        grant_id: access.grant?.id ?? null,
        policy: access.policy,
      },
      ip: clientKey(c),
    });

    runInBackground(notifyImpersonationStarted(tenantId, expiresAt));

    for (const cookie of headers.getSetCookie()) {
      c.header("Set-Cookie", cookie, { append: true });
    }

    return c.json({ ok: true, expiresAt });
  },
);

impersonationRoutes.post(
  "/api/admin/stop-impersonating",
  sameOrigin,
  jsonBodyLimit,
  authRateLimit,
  requireAuth,
  async (c) => {
    const { id, impersonatedBy } = c.get("user");

    if (!impersonatedBy) {
      throw new TenantRuleError(
        400,
        "NOT_IMPERSONATING",
        "Esta sessão não é de personificação.",
      );
    }

    const auth = getAuth();
    const request = { headers: c.req.raw.headers, returnHeaders: true } as const;

    // Sem a sessão original ou o cookie `admin_session`, o plugin lança erro. Quem saiu não
    // pode ficar preso: encerra só a personificada, e o suporte entra de novo.
    const { headers } = await auth.api
      .stopImpersonating(request)
      .catch((error: unknown) => {
        if (!isAPIError(error)) throw error;
        return auth.api.signOut(request);
      });

    await audit("platform.impersonation_stopped", {
      actor: { type: "platform", id: impersonatedBy },
      impersonatorId: impersonatedBy,
      tenantId: c.get("activeOrganizationId"),
      target: { type: "user", id },
      ip: clientKey(c),
    });

    for (const cookie of headers.getSetCookie()) {
      c.header("Set-Cookie", cookie, { append: true });
    }

    return c.json({ ok: true });
  },
);
