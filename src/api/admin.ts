import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { requireAuth, requirePlatform, type AuthEnv } from "@/api/auth";
import {
  authRateLimit,
  jsonBodyLimit,
  sameOrigin,
  validationError,
  validId,
} from "@/api/guards";
import { clientKey } from "@/api/rate-limit";
import { handleTenantError } from "@/api/tenant-errors";
import {
  createPlan,
  createPrice,
  listPlans,
  updatePlan,
  updatePrice,
  updateSettings,
} from "@/lib/admin/plans";
import {
  getOverview,
  getTenantDetail,
  listTenants,
  suspendTenant,
  unsuspendTenant,
} from "@/lib/admin/tenants";
import { assertBannable, listUsers } from "@/lib/admin/users";
import { type AuditAction, audit } from "@/lib/audit";
import { getAuth } from "@/lib/auth/server";
import { loadSettings } from "@/lib/billing/settings";
import { changeTenantPlan } from "@/lib/billing/subscription";
import {
  changeTenantPlanSchema,
  planPriceSchema,
  planSchema,
  platformSettingsSchema,
  reasonSchema,
  tenantsQuerySchema,
  updatePlanPriceSchema,
  updatePlanSchema,
  usersQuerySchema,
} from "@/lib/schemas/admin";
import { notFound } from "@/lib/tenant/errors";
import { z } from "zod";

/**
 * `/api/admin/*`: só quem tem papel de plataforma. Leitura é de `platform_owner` e
 * `platform_support`; escrita é só de `platform_owner` (`spec-tenant-rbac.md`).
 * Ordem: `sameOrigin` → corpo → rate limit → `requireAuth` → `requirePlatform`.
 */
export const adminRoutes = new Hono<AuthEnv>();

adminRoutes.onError(handleTenantError);
adminRoutes.use(
  "/api/admin/*",
  sameOrigin,
  jsonBodyLimit,
  authRateLimit,
  requireAuth,
  requirePlatform(),
);

const ownerOnly = requirePlatform(["platform_owner"]);

const priceParams = zValidator(
  "param",
  z.object({ id: z.uuid(), priceId: z.uuid() }),
  (result, c) => {
    if (!result.success) return c.json({ error: "Não encontrado." }, 404);
  },
);

/** Auditoria de quem agiu como plataforma. Sem `tenantId`, só a plataforma lê. */
function auditAdmin(
  // biome-ignore lint/suspicious/noExplicitAny: o handler passa o contexto com o seu path e entradas validadas.
  c: Context<AuthEnv, any, any>,
  action: AuditAction,
  entry: {
    tenantId?: string;
    target: { type: string; id: string };
    metadata?: Record<string, string | number | boolean | null>;
  },
) {
  return audit(action, {
    actor: { type: "platform", id: c.get("user").id },
    ip: clientKey(c),
    ...entry,
  });
}

adminRoutes.get("/api/admin/overview", async (c) =>
  c.json(await getOverview()),
);

adminRoutes.get(
  "/api/admin/tenants",
  zValidator("query", tenantsQuerySchema, validationError),
  async (c) => c.json(await listTenants(c.req.valid("query"))),
);

adminRoutes.get("/api/admin/tenants/:id", validId, async (c) =>
  c.json(await getTenantDetail(c.req.valid("param").id)),
);

adminRoutes.post(
  "/api/admin/tenants/:id/suspend",
  ownerOnly,
  validId,
  zValidator("json", reasonSchema, validationError),
  async (c) => {
    const { id } = c.req.valid("param");
    const { reason } = c.req.valid("json");

    const tenant = await suspendTenant(id, reason);
    if (!tenant) throw notFound("Organização não encontrada.");

    await auditAdmin(c, "admin.tenant_suspended", {
      tenantId: id,
      target: { type: "tenant", id },
    });

    return c.json({ tenant: { id, status: "suspended" } });
  },
);

adminRoutes.post(
  "/api/admin/tenants/:id/unsuspend",
  ownerOnly,
  validId,
  async (c) => {
    const { id } = c.req.valid("param");

    await unsuspendTenant(id);
    await auditAdmin(c, "admin.tenant_unsuspended", {
      tenantId: id,
      target: { type: "tenant", id },
    });

    return c.json({ tenant: { id, status: "active" } });
  },
);

adminRoutes.put(
  "/api/admin/tenants/:id/plan",
  ownerOnly,
  validId,
  zValidator("json", changeTenantPlanSchema, validationError),
  async (c) => {
    const { id } = c.req.valid("param");
    const { planId } = c.req.valid("json");

    await getTenantDetail(id); // 404 se o tenant não existe
    const updated = await changeTenantPlan(id, planId);
    if (!updated) throw notFound("Plano não encontrado.");

    await auditAdmin(c, "admin.tenant_plan_changed", {
      tenantId: id,
      target: { type: "plan", id: planId },
    });

    return c.json({
      subscription: { status: updated.status, planId: updated.planId },
    });
  },
);

adminRoutes.get("/api/admin/plans", async (c) =>
  c.json({ plans: await listPlans() }),
);

adminRoutes.post(
  "/api/admin/plans",
  ownerOnly,
  zValidator("json", planSchema, validationError),
  async (c) => {
    const created = await createPlan(c.req.valid("json"));

    await auditAdmin(c, "admin.plan_created", {
      target: { type: "plan", id: created.id },
    });

    return c.json({ plan: created }, 201);
  },
);

adminRoutes.patch(
  "/api/admin/plans/:id",
  ownerOnly,
  validId,
  zValidator("json", updatePlanSchema, validationError),
  async (c) => {
    const { id } = c.req.valid("param");
    const updated = await updatePlan(id, c.req.valid("json"));

    await auditAdmin(c, "admin.plan_updated", { target: { type: "plan", id } });

    return c.json({ plan: updated });
  },
);

adminRoutes.post(
  "/api/admin/plans/:id/prices",
  ownerOnly,
  validId,
  zValidator("json", planPriceSchema, validationError),
  async (c) => {
    const { id } = c.req.valid("param");
    const price = await createPrice(id, c.req.valid("json"));

    await auditAdmin(c, "admin.plan_updated", { target: { type: "plan", id } });

    return c.json({ price }, 201);
  },
);

adminRoutes.patch(
  "/api/admin/plans/:id/prices/:priceId",
  ownerOnly,
  priceParams,
  zValidator("json", updatePlanPriceSchema, validationError),
  async (c) => {
    const { id, priceId } = c.req.valid("param");
    const price = await updatePrice(id, priceId, c.req.valid("json"));

    await auditAdmin(c, "admin.plan_updated", { target: { type: "plan", id } });

    return c.json({ price });
  },
);

adminRoutes.get("/api/admin/settings", async (c) =>
  c.json({ settings: await loadSettings() }),
);

adminRoutes.patch(
  "/api/admin/settings",
  ownerOnly,
  zValidator("json", platformSettingsSchema, validationError),
  async (c) => {
    const settings = await updateSettings(
      c.req.valid("json"),
      c.get("user").id,
    );

    await auditAdmin(c, "admin.settings_updated", {
      target: { type: "settings", id: "platform" },
    });

    return c.json({ settings });
  },
);

adminRoutes.get(
  "/api/admin/users",
  zValidator("query", usersQuerySchema, validationError),
  async (c) => c.json(await listUsers(c.req.valid("query"))),
);

adminRoutes.post(
  "/api/admin/users/:id/ban",
  ownerOnly,
  validId,
  zValidator("json", reasonSchema, validationError),
  async (c) => {
    const { id } = c.req.valid("param");
    const { reason } = c.req.valid("json");

    await assertBannable(id, c.get("user").id);
    await getAuth().api.banUser({
      headers: c.req.raw.headers,
      body: { userId: id, banReason: reason },
    });
    await auditAdmin(c, "admin.user_banned", { target: { type: "user", id } });

    return c.json({ ok: true });
  },
);

adminRoutes.post(
  "/api/admin/users/:id/unban",
  ownerOnly,
  validId,
  async (c) => {
    const { id } = c.req.valid("param");

    await getAuth().api.unbanUser({
      headers: c.req.raw.headers,
      body: { userId: id },
    });
    await auditAdmin(c, "admin.user_unbanned", { target: { type: "user", id } });

    return c.json({ ok: true });
  },
);
