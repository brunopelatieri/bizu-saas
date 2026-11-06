import { Hono } from "hono";
import type { AuthEnv } from "@/api/auth";
import { requireAuth } from "@/api/auth";
import { authRateLimit } from "@/api/guards";
import { handleTenantError } from "@/api/tenant-errors";
import { permissionsOf } from "@/lib/auth/permissions";
import type { AuthUser, MeResponse } from "@/lib/auth/types";
import {
  activateTenant,
  listMemberships,
  type Membership,
  preferredTenantId,
} from "@/lib/tenant/membership";
import { loadRoleCatalog } from "@/lib/tenant/roles";
import { listInvitationsFor } from "@/lib/tenant/team";

/**
 * O tenant ativo da sessão, se a pessoa ainda for membro. Removida dele, a sessão passa
 * ao tenant preferido, ou a nenhum: a interface manda ao onboarding.
 */
async function resolveActiveTenant(
  user: AuthUser,
  sessionId: string,
  activeId: string | null,
  memberships: Membership[],
) {
  const current = memberships.find(({ id }) => id === activeId);
  if (current) return current;

  const preferredId = await preferredTenantId(user.id);
  const preferred = memberships.find(({ id }) => id === preferredId) ?? null;

  if (preferred || activeId) {
    await activateTenant(sessionId, user.id, preferred?.id ?? null);
  }

  return preferred;
}

async function activePermissions(tenant: Membership | null) {
  if (!tenant) return [];
  if (tenant.status !== "active" || tenant.accessMode === "locked") return [];

  return permissionsOf(await loadRoleCatalog(tenant.id), tenant.role);
}

export const meRoutes = new Hono<AuthEnv>();

meRoutes.onError(handleTenantError);

// `features` e `limits` são preenchidos a partir da fase 5.
meRoutes.get("/api/me", authRateLimit, requireAuth, async (c) => {
  const user = c.get("user");
  const memberships = await listMemberships(user.id);
  const tenant = await resolveActiveTenant(
    user,
    c.get("session").id,
    c.get("activeOrganizationId"),
    memberships,
  );
  const permissions = await activePermissions(tenant);

  return c.json<MeResponse>({
    user: {
      ...user,
      activeTenant: tenant && {
        id: tenant.id,
        slug: tenant.slug,
        role: tenant.role,
        permissions,
      },
    },
    tenants: memberships.map(({ id, slug, name, role, status }) => ({
      id,
      slug,
      name,
      role,
      status,
    })),
    permissions,
    features: [],
    limits: {},
  });
});

meRoutes.get("/api/me/invitations", authRateLimit, requireAuth, async (c) =>
  c.json({ invitations: await listInvitationsFor(c.get("user").email) }),
);
