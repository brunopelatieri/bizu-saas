import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { requireAuth } from "@/api/auth";
import {
  authRateLimit,
  jsonBodyLimit,
  MINUTE,
  sameOrigin,
  validationError,
  validId,
} from "@/api/guards";
import {
  requirePermission,
  requireTenant,
  type TenantEnv,
} from "@/api/permissions";
import { clientKey, rateLimit } from "@/api/rate-limit";
import { handleTenantError } from "@/api/tenant-errors";
import { audit } from "@/lib/audit";
import {
  cancelAtPeriodEnd,
  changePlan,
  getSubscriptionView,
  listBillingPlans,
  openPortal,
  pauseSubscription,
  resumeSubscription,
  saveBillingProfile,
  startCheckout,
} from "@/lib/billing/checkout";
import { getInvoice, listInvoices } from "@/lib/billing/invoices";
import {
  billingProfileSchema,
  cancelSchema,
  changePlanSchema,
  checkoutSchema,
} from "@/lib/schemas/billing";

/**
 * `/api/billing/*`: o owner e a própria assinatura (fluxo a). Liberada em `read_only`: é por
 * aqui que o tenant volta a pagar. Ler pede `billing:read`; mudar, `billing:manage`.
 */
export const billingRoutes = new Hono<TenantEnv>();

billingRoutes.onError(handleTenantError);
billingRoutes.use(
  "/api/billing/*",
  sameOrigin,
  jsonBodyLimit,
  authRateLimit,
  requireAuth,
  requireTenant,
);

const canRead = requirePermission("billing", "read");
const canManage = requirePermission("billing", "manage");

/** Cada chamada dispara uma requisição paga em tempo no provedor. */
const providerRateLimit = rateLimit({
  name: "billing-provider",
  limit: 10,
  windowMs: MINUTE,
});

const actorOf = (c: Context<TenantEnv>) => ({
  userId: c.get("user").id,
  ip: clientKey(c),
});

billingRoutes.get("/api/billing/plans", canRead, async (c) =>
  c.json(await listBillingPlans()),
);

billingRoutes.get("/api/billing/subscription", canRead, async (c) => {
  const { id } = c.get("tenant");
  const view = await getSubscriptionView(id);

  return c.json({ ...view, invoices: await listInvoices(id, 5) });
});

billingRoutes.put(
  "/api/billing/profile",
  canManage,
  zValidator("json", billingProfileSchema, validationError),
  async (c) => {
    const { id } = c.get("tenant");
    const profile = await saveBillingProfile(id, c.req.valid("json"));

    await audit("billing.profile_updated", {
      actor: { type: "user", id: c.get("user").id },
      ip: clientKey(c),
      tenantId: id,
      target: { type: "tenant", id },
    });

    return c.json({ profile });
  },
);

billingRoutes.post(
  "/api/billing/checkout",
  canManage,
  providerRateLimit,
  zValidator("json", checkoutSchema, validationError),
  async (c) =>
    c.json(
      await startCheckout(c.get("tenant").id, c.req.valid("json"), actorOf(c)),
    ),
);

billingRoutes.get("/api/billing/invoices", canRead, async (c) =>
  c.json({ invoices: await listInvoices(c.get("tenant").id) }),
);

billingRoutes.get("/api/billing/invoices/:id", canRead, validId, async (c) =>
  c.json({
    invoice: await getInvoice(c.get("tenant").id, c.req.valid("param").id),
  }),
);

billingRoutes.post(
  "/api/billing/cancel",
  canManage,
  providerRateLimit,
  zValidator("json", cancelSchema, validationError),
  async (c) => {
    const { id } = c.get("tenant");
    await cancelAtPeriodEnd(id, actorOf(c));

    return c.json(await getSubscriptionView(id));
  },
);

billingRoutes.post(
  "/api/billing/reactivate",
  canManage,
  providerRateLimit,
  async (c) => {
    const { id } = c.get("tenant");
    await resumeSubscription(id, actorOf(c));

    return c.json(await getSubscriptionView(id));
  },
);

billingRoutes.post(
  "/api/billing/pause",
  canManage,
  providerRateLimit,
  async (c) => {
    const { id } = c.get("tenant");
    await pauseSubscription(id, actorOf(c));

    return c.json(await getSubscriptionView(id));
  },
);

billingRoutes.post(
  "/api/billing/change-plan",
  canManage,
  providerRateLimit,
  zValidator("json", changePlanSchema, validationError),
  async (c) => {
    const { id } = c.get("tenant");
    const change = await changePlan(id, c.req.valid("json"), actorOf(c));

    return c.json({ ...(await getSubscriptionView(id)), change });
  },
);

billingRoutes.post(
  "/api/billing/portal",
  canManage,
  providerRateLimit,
  async (c) => c.json(await openPortal(c.get("tenant").id)),
);
