import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAuth } from "@/api/auth";
import {
  authRateLimit,
  jsonBodyLimit,
  MINUTE,
  sameOrigin,
  validationError,
} from "@/api/guards";
import {
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
import { notFound } from "@/lib/tenant/errors";
import { activateTenant, findMembership } from "@/lib/tenant/membership";
import { generateSlug } from "@/lib/tenant/slug";

export const tenantRoutes = new Hono<TenantEnv>();

tenantRoutes.onError(handleTenantError);
tenantRoutes.use("/api/tenant/*", sameOrigin, jsonBodyLimit, authRateLimit);

tenantRoutes.post(
  "/api/tenant",
  rateLimit({ name: "tenant-create", limit: 10, windowMs: 60 * MINUTE }),
  requireAuth,
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
  const { id, name, slug, status, accessMode } = c.get("tenant");

  return c.json({ tenant: { id, name, slug, status, accessMode } });
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

/** Troca o tenant ativo. Tenant de que a pessoa não é membro não existe para ela. */
tenantRoutes.post(
  "/api/tenant/active",
  requireAuth,
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
