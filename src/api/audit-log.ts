import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAuth } from "@/api/auth";
import { authRateLimit, validationError } from "@/api/guards";
import {
  requirePermission,
  requireTenant,
  type TenantEnv,
} from "@/api/permissions";
import { handleTenantError } from "@/api/tenant-errors";
import { listTenantAudit } from "@/lib/audit-log";
import { auditQuerySchema } from "@/lib/schemas/security";

/** Log do tenant ativo (`/app/auditoria`). O da plataforma é `/api/admin/audit`. */
export const auditRoutes = new Hono<TenantEnv>();

auditRoutes.onError(handleTenantError);

auditRoutes.get(
  "/api/audit",
  authRateLimit,
  requireAuth,
  requireTenant,
  requirePermission("audit", "read"),
  zValidator("query", auditQuerySchema, validationError),
  async (c) =>
    c.json(await listTenantAudit(c.get("tenant").id, c.req.valid("query"))),
);
