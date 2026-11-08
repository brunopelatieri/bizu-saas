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
import { impersonationAccess } from "@/lib/admin/impersonation";
import { countDeadJobs, getJobConsumers } from "@/lib/admin/jobs";
import { listSubscriptions } from "@/lib/admin/subscriptions";
import {
  assertBannable,
  listPortalUsers,
  listUsers,
  revokePortalSessions,
} from "@/lib/admin/users";
import { type AuditAction, audit } from "@/lib/audit";
import { listPlatformAudit } from "@/lib/audit-log";
import { getAuth } from "@/lib/auth/server";
import {
  adminCancelSubscription,
  loadSubscriptionForSync,
} from "@/lib/billing/checkout";
import { listPaymentEvents, reprocessEvent } from "@/lib/billing/inbox";
import { markManualUnpaid, recordManualPayment } from "@/lib/billing/manual";
import { syncSubscription } from "@/lib/billing/reconcile";
import { loadSettings } from "@/lib/billing/settings";
import { changeTenantPlan } from "@/lib/billing/subscription";
import {
  changeTenantPlanSchema,
  manualPaymentSchema,
  manualUnpaidSchema,
  planPriceSchema,
  planSchema,
  platformSettingsSchema,
  reasonSchema,
  subscriptionsQuerySchema,
  tenantsQuerySchema,
  updatePlanPriceSchema,
  updatePlanSchema,
  usersQuerySchema,
  webhooksQuerySchema,
} from "@/lib/schemas/admin";
import { adminAuditQuerySchema } from "@/lib/schemas/security";
import { notFound } from "@/lib/tenant/errors";
import { z } from "zod";
// admin-crud B
import { editSubscription } from "@/lib/billing/admin-edit";
import { updateSubscriptionSchema } from "@/lib/schemas/admin";

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

adminRoutes.get("/api/admin/overview", async (c) => {
  const [overview, deadJobs, jobConsumers] = await Promise.all([
    getOverview(),
    countDeadJobs(),
    getJobConsumers(),
  ]);

  return c.json({ ...overview, deadJobs, jobConsumers });
});

adminRoutes.get(
  "/api/admin/tenants",
  zValidator("query", tenantsQuerySchema, validationError),
  async (c) => c.json(await listTenants(c.req.valid("query"))),
);

adminRoutes.get("/api/admin/tenants/:id", validId, async (c) => {
  const { id } = c.req.valid("param");
  const detail = await getTenantDetail(id);
  const { allowed, policy, grant } = await impersonationAccess(id);

  return c.json({
    ...detail,
    impersonation: { allowed, policy, grantExpiresAt: grant?.expiresAt ?? null },
  });
});

adminRoutes.get(
  "/api/admin/audit",
  zValidator("query", adminAuditQuerySchema, validationError),
  async (c) => c.json(await listPlatformAudit(c.req.valid("query"))),
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

    const { impersonationPolicy } = c.req.valid("json");

    await auditAdmin(c, "admin.settings_updated", {
      target: { type: "settings", id: "platform" },
      metadata: impersonationPolicy
        ? { impersonation_policy: impersonationPolicy }
        : undefined,
    });

    return c.json({ settings });
  },
);

adminRoutes.get(
  "/api/admin/users",
  zValidator("query", usersQuerySchema, validationError),
  async (c) => {
    const { scope, ...query } = c.req.valid("query");

    return c.json(
      await (scope === "portal" ? listPortalUsers(query) : listUsers(query)),
    );
  },
);

adminRoutes.post(
  "/api/admin/portal-users/:id/revoke-sessions",
  ownerOnly,
  validId,
  async (c) => {
    const { id } = c.req.valid("param");

    await revokePortalSessions(id);
    await auditAdmin(c, "admin.portal_sessions_revoked", {
      target: { type: "portal_user", id },
    });

    return c.json({ ok: true });
  },
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

adminRoutes.get(
  "/api/admin/webhooks",
  zValidator("query", webhooksQuerySchema, validationError),
  async (c) => c.json(await listPaymentEvents(c.req.valid("query"))),
);

adminRoutes.post(
  "/api/admin/webhooks/:id/reprocess",
  ownerOnly,
  validId,
  async (c) => {
    const { id } = c.req.valid("param");

    await reprocessEvent(id);
    await auditAdmin(c, "admin.webhook_reprocessed", {
      target: { type: "payment_event", id },
    });

    return c.json({ ok: true });
  },
);

adminRoutes.get(
  "/api/admin/subscriptions",
  zValidator("query", subscriptionsQuerySchema, validationError),
  async (c) => c.json(await listSubscriptions(c.req.valid("query"))),
);

adminRoutes.post(
  "/api/admin/subscriptions/:id/cancel",
  ownerOnly,
  validId,
  async (c) => {
    const { id } = c.req.valid("param");
    const updated = await adminCancelSubscription(id, c.get("user").id);

    await auditAdmin(c, "admin.subscription_canceled", {
      tenantId: updated.tenantId,
      target: { type: "subscription", id },
    });

    return c.json({ subscription: { id, status: updated.status } });
  },
);

/**
 * Cobrança manual: o proprietário marca quem pagou e quem não pagou
 * (`src/lib/billing/manual.ts`). A transição, a fatura e a auditoria saem na mesma transação.
 */
adminRoutes.post(
  "/api/admin/subscriptions/:id/manual-payment",
  ownerOnly,
  validId,
  zValidator("json", manualPaymentSchema, validationError),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await recordManualPayment(id, c.req.valid("json"), {
      userId: c.get("user").id,
      ip: clientKey(c),
    });

    return c.json(manualResult(result));
  },
);

adminRoutes.post(
  "/api/admin/subscriptions/:id/manual-unpaid",
  ownerOnly,
  validId,
  zValidator("json", manualUnpaidSchema, validationError),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await markManualUnpaid(id, c.req.valid("json"), {
      userId: c.get("user").id,
      ip: clientKey(c),
    });

    return c.json(manualResult(result));
  },
);

function manualResult({
  subscription,
  invoice,
}: Awaited<ReturnType<typeof recordManualPayment>>) {
  return {
    subscription: {
      id: subscription.id,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      graceUntil: subscription.graceUntil,
    },
    invoice: {
      id: invoice.id,
      status: invoice.status,
      amountCents: invoice.amountCents,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
    },
  };
}

adminRoutes.post(
  "/api/admin/subscriptions/:id/sync",
  ownerOnly,
  validId,
  async (c) => {
    const { id } = c.req.valid("param");
    const target = await loadSubscriptionForSync(id);
    const result = await syncSubscription(target, new Date(), {
      source: "admin",
      actor: { type: "platform", id: c.get("user").id },
    });

    await auditAdmin(c, "admin.subscription_synced", {
      tenantId: target.tenantId,
      target: { type: "subscription", id },
      metadata: { diverged: result.diverged },
    });

    return c.json(result);
  },
);

// admin-crud B: editar datas e status da assinatura (`src/lib/billing/admin-edit.ts`).
// Manual: aplica aqui. Com provedor: vai primeiro a ele, e só a resposta aceita grava.
adminRoutes.patch(
  "/api/admin/subscriptions/:id",
  ownerOnly,
  validId,
  zValidator("json", updateSubscriptionSchema, validationError),
  async (c) => {
    const { id } = c.req.valid("param");
    const updated = await editSubscription(id, c.req.valid("json"), {
      userId: c.get("user").id,
      ip: clientKey(c),
    });

    return c.json({
      subscription: {
        id: updated.id,
        status: updated.status,
        trialEndsAt: updated.trialEndsAt,
        currentPeriodStart: updated.currentPeriodStart,
        currentPeriodEnd: updated.currentPeriodEnd,
        graceUntil: updated.graceUntil,
      },
    });
  },
);
