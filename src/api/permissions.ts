import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "@/api/auth";
import { logError } from "@/api/log";
import { clientKey } from "@/api/rate-limit";
import {
  type Action,
  permissionsOf,
  type Resource,
  type RoleCatalog,
} from "@/lib/auth/permissions";
import { findMembership, type Membership } from "@/lib/tenant/membership";
import { loadRoleCatalog } from "@/lib/tenant/roles";
import type { TeamActor } from "@/lib/tenant/team";

export type TenantEnv = AuthEnv & {
  Variables: AuthEnv["Variables"] & {
    tenant: Membership;
    roleCatalog: RoleCatalog;
    permissions: string[];
  };
};

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Recusa quem não pode usar agora o tenant ativo da sessão. */
export function refusal(
  c: Context,
  tenant: Pick<Membership, "status" | "accessMode">,
) {
  if (tenant.status !== "active" || tenant.accessMode === "locked") {
    return c.json(
      { error: "Esta organização está suspensa.", code: "TENANT_SUSPENDED" },
      403,
    );
  }

  const billingRoute = c.req.path.startsWith("/api/billing/");

  if (
    tenant.accessMode === "read_only" &&
    MUTATIONS.has(c.req.method) &&
    !billingRoute
  ) {
    return c.json(
      {
        error: "Esta organização está em modo somente leitura.",
        code: "TENANT_READ_ONLY",
      },
      403,
    );
  }

  return null;
}

/**
 * Vem depois de `requireAuth`. Lê no banco a cada requisição: quem foi removido ou teve
 * o papel trocado perde o acesso na hora. Falha fechada: sem banco, a rota não abre.
 */
export const requireTenant = createMiddleware<TenantEnv>(async (c, next) => {
  const tenantId = c.get("activeOrganizationId");
  let tenant: Membership | null = null;
  let catalog: RoleCatalog = {};

  try {
    if (tenantId) tenant = await findMembership(c.get("user").id, tenantId);
    if (tenant) catalog = await loadRoleCatalog(tenant.id);
  } catch (error) {
    logError("Falha ao carregar o tenant", error);
    return c.json({ error: "Organização indisponível." }, 503);
  }

  if (!tenant) {
    return c.json(
      { error: "Selecione uma organização.", code: "TENANT_REQUIRED" },
      403,
    );
  }

  const refused = refusal(c, tenant);
  if (refused) return refused;

  c.set("tenant", tenant);
  c.set("roleCatalog", catalog);
  c.set("permissions", permissionsOf(catalog, tenant.role));
  await next();
});

/**
 * Vem depois de `requireTenant`. Resolve papéis estáticos e personalizados pela mesma
 * lista que `/api/me` devolve; `tests/db/rbac.test.ts` a compara com `hasPermission`.
 */
export function requirePermission<R extends Resource>(
  resource: R,
  action: Action<R>,
) {
  const permission = `${resource}:${action}`;

  return createMiddleware<TenantEnv>(async (c, next) => {
    if (!c.get("permissions").includes(permission)) {
      return c.json(
        {
          error: "Você não tem permissão para esta ação.",
          code: "PERMISSION_DENIED",
        },
        403,
      );
    }

    await next();
  });
}

export function teamActor(c: Context<TenantEnv>): TeamActor {
  return {
    userId: c.get("user").id,
    permissions: c.get("permissions"),
    catalog: c.get("roleCatalog"),
    ip: clientKey(c),
  };
}
