import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAuth } from "@/api/auth";
import {
  authRateLimit,
  jsonBodyLimit,
  MINUTE,
  sameOrigin,
  validationError,
  validId,
} from "@/api/guards";
import { blockWhileImpersonating } from "@/api/impersonation";
import {
  requireOwner,
  requirePermission,
  requireTenant,
  type TenantEnv,
} from "@/api/permissions";
import { clientKey, rateLimit } from "@/api/rate-limit";
import { handleTenantError } from "@/api/tenant-errors";
import { audit } from "@/lib/audit";
import { getAuth } from "@/lib/auth/server";
import { startTrial } from "@/lib/billing/subscription";
import { logError } from "@/api/log";
import {
  activeTenantSchema,
  createTenantSchema,
  updateTenantSchema,
} from "@/lib/schemas/tenant";
import {
  supportGrantSchema,
  tenantSecuritySchema,
} from "@/lib/schemas/security";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";
import { activateTenant, findMembership } from "@/lib/tenant/membership";
import { setRequire2fa } from "@/lib/tenant/security";
import { generateSlug } from "@/lib/tenant/slug";
import {
  createSupportGrant,
  listSupportGrants,
  revokeSupportGrant,
} from "@/lib/tenant/support-grants";

export const tenantRoutes = new Hono<TenantEnv>();

tenantRoutes.onError(handleTenantError);
tenantRoutes.use("/api/tenant/*", sameOrigin, jsonBodyLimit, authRateLimit);

tenantRoutes.post(
  "/api/tenant",
  rateLimit({ name: "tenant-create", limit: 10, windowMs: 60 * MINUTE }),
  requireAuth,
  blockWhileImpersonating,
  zValidator("json", createTenantSchema, validationError),
  async (c) => {
    const { name, slug } = c.req.valid("json");
    const user = c.get("user");

    const tenant = await getAuth().api.createOrganization({
      headers: c.req.raw.headers,
      body: { name, slug: slug ?? (await generateSlug(name)) },
    });

    await activateTenant(c.get("session").id, user.id, tenant.id);
    // O tenant já existe: sem plano utilizável ou com falha aqui, ele segue sem limites
    // em vez de perder o onboarding. O proprietário corrige em /admin/tenants/:id.
    await startTrial(tenant.id).catch((error: unknown) =>
      logError("Falha ao iniciar o trial do tenant", error),
    );
    await audit("tenant.created", {
      actor: { id: user.id },
      tenantId: tenant.id,
      target: { type: "tenant", id: tenant.id },
      ip: clientKey(c),
    });

    return c.json(
      { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } },
      201,
    );
  },
);

tenantRoutes.get("/api/tenant", requireAuth, requireTenant, (c) => {
  const { id, name, slug, status, accessMode, require2fa } = c.get("tenant");

  return c.json({ tenant: { id, name, slug, status, accessMode, require2fa } });
});

tenantRoutes.patch(
  "/api/tenant",
  requireAuth,
  requireTenant,
  requirePermission("organization", "update"),
  zValidator("json", updateTenantSchema, validationError),
  async (c) => {
    const { id } = c.get("tenant");
    const { name } = c.req.valid("json");

    await getAuth().api.updateOrganization({
      headers: c.req.raw.headers,
      body: { organizationId: id, data: { name } },
    });
    await audit("tenant.updated", {
      actor: { id: c.get("user").id },
      tenantId: id,
      target: { type: "tenant", id },
      ip: clientKey(c),
    });

    return c.json({ tenant: { id, name } });
  },
);

/**
 * A exclusão do tenant é da fase 10. O bloqueio já fica aqui: a rota nova nasce protegida, e
 * sem ela o `DELETE` segue para o 404.
 */
tenantRoutes.on("DELETE", "/api/tenant", requireAuth, blockWhileImpersonating);

/** Exigir 2FA da equipe: só quem já tem, para o owner não se trancar para fora. */
tenantRoutes.patch(
  "/api/tenant/security",
  requireAuth,
  requireTenant,
  requireOwner,
  blockWhileImpersonating,
  zValidator("json", tenantSecuritySchema, validationError),
  async (c) => {
    const { id } = c.get("tenant");
    const { require2fa } = c.req.valid("json");
    const user = c.get("user");

    if (require2fa && !user.twoFactorEnabled) {
      throw new TenantRuleError(
        400,
        "TWO_FACTOR_REQUIRED_FIRST",
        "Ative a verificação em duas etapas na sua conta antes de exigi-la da equipe.",
      );
    }

    await setRequire2fa(id, require2fa);
    await audit("tenant.security_updated", {
      actor: { id: user.id },
      tenantId: id,
      target: { type: "tenant", id },
      metadata: { require_2fa: require2fa },
      ip: clientKey(c),
    });

    return c.json({ require2fa });
  },
);

const supportGrantGuards = [
  requireAuth,
  requireTenant,
  requirePermission("support", "grant"),
  blockWhileImpersonating,
] as const;

tenantRoutes.get("/api/tenant/support-grant", ...supportGrantGuards, async (c) =>
  c.json({ grants: await listSupportGrants(c.get("tenant").id) }),
);

tenantRoutes.post(
  "/api/tenant/support-grant",
  ...supportGrantGuards,
  zValidator("json", supportGrantSchema, validationError),
  async (c) => {
    const grant = await createSupportGrant(
      c.get("tenant").id,
      c.req.valid("json").hours,
      { userId: c.get("user").id, ip: clientKey(c) },
    );

    return c.json({ grant }, 201);
  },
);

tenantRoutes.delete(
  "/api/tenant/support-grant/:id",
  ...supportGrantGuards,
  validId,
  async (c) => {
    await revokeSupportGrant(c.get("tenant").id, c.req.valid("param").id, {
      userId: c.get("user").id,
      ip: clientKey(c),
    });

    return c.json({ ok: true });
  },
);

/** Troca o tenant ativo. Tenant de que a pessoa não é membro não existe para ela. */
tenantRoutes.post(
  "/api/tenant/active",
  requireAuth,
  // A sessão de suporte fica presa ao tenant do consentimento.
  blockWhileImpersonating,
  zValidator("json", activeTenantSchema, validationError),
  async (c) => {
    const { tenantId } = c.req.valid("json");
    const user = c.get("user");

    if (!(await findMembership(user.id, tenantId))) {
      throw notFound("Organização não encontrada.");
    }

    await activateTenant(c.get("session").id, user.id, tenantId);

    return c.json({ ok: true });
  },
);
