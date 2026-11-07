import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "@/api/auth";
import { logError } from "@/api/log";
import { clientKey } from "@/api/rate-limit";
import {
  type Action,
  isOwner,
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

/**
 * Por `/api/billing/` o tenant volta a pagar; por `support-grant` o owner libera e, acima de
 * tudo, revoga o suporte: inadimplência não pode tirar dele esse controle.
 */
const OPEN_WHEN_READ_ONLY = ["/api/billing/", "/api/tenant/support-grant"];

/**
 * Excluir a organização é direito do titular dos dados e não pode depender de o plano estar
 * em dia: vale em `read_only` e `locked` por cobrança. Suspensa pela plataforma, não.
 */
function isTenantDeletion(c: Context, tenant: Pick<Membership, "status">) {
  return (
    tenant.status === "active" &&
    c.req.method === "DELETE" &&
    c.req.path === "/api/tenant"
  );
}

/** Recusa quem não pode usar agora o tenant ativo da sessão. */
export function refusal(
  c: Context,
  tenant: Pick<Membership, "status" | "accessMode">,
) {
  if (isTenantDeletion(c, tenant)) return null;

  if (tenant.status !== "active" || tenant.accessMode === "locked") {
    return c.json(
      { error: "Esta organização está suspensa.", code: "TENANT_SUSPENDED" },
      403,
    );
  }

  if (
    tenant.accessMode === "read_only" &&
    MUTATIONS.has(c.req.method) &&
    !OPEN_WHEN_READ_ONLY.some((prefix) => c.req.path.startsWith(prefix))
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

  if (tenant.require2fa && !c.get("user").twoFactorEnabled) {
    return c.json(
      {
        error: "Esta organização exige verificação em duas etapas.",
        code: "TENANT_2FA_REQUIRED",
      },
      403,
    );
  }

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

/** Vem depois de `requireTenant`. Para o que nem um papel personalizado pode receber. */
export const requireOwner = createMiddleware<TenantEnv>(async (c, next) => {
  if (!isOwner(c.get("tenant").role)) {
    return c.json(
      {
        error: "Só o proprietário pode fazer isso.",
        code: "PERMISSION_DENIED",
      },
      403,
    );
  }

  await next();
});

export function teamActor(c: Context<TenantEnv>): TeamActor {
  return {
    userId: c.get("user").id,
    permissions: c.get("permissions"),
    catalog: c.get("roleCatalog"),
    ip: clientKey(c),
  };
}
