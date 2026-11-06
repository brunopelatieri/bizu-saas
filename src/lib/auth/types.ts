export const PLATFORM_ROLES = [
  "user",
  "platform_owner",
  "platform_support",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Organização de que a pessoa faz parte. */
export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  role: string;
  status: string;
};

/** Resposta de `GET /api/me`. `features` e `limits` chegam com a fase 5. */
export type MeResponse = {
  user: AuthUser;
  tenants: TenantSummary[];
  permissions: string[];
  features: string[];
  limits: Record<string, number>;
};

/** Usuário independente de provedor, usado pela interface e pela API. */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  platformRole: PlatformRole;
  twoFactorEnabled: boolean;
  activeTenant: {
    id: string;
    slug: string;
    role: string;
    permissions: string[];
  } | null;
  impersonatedBy: string | null;
};

type SessionData = {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    role?: string | null;
  };
  session: { impersonatedBy?: string | null };
};

function toPlatformRole(role: string | null | undefined): PlatformRole {
  return PLATFORM_ROLES.find((known) => known === role) ?? "user";
}

/**
 * Converte a sessão do Better Auth em `AuthUser`. Usada pela API e pelo cliente.
 * O tenant ativo vem de `GET /api/me`; 2FA (fase 9) ainda não existe.
 */
export function toAuthUser({ user, session }: SessionData): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    platformRole: toPlatformRole(user.role),
    twoFactorEnabled: false,
    activeTenant: null,
    impersonatedBy: session.impersonatedBy ?? null,
  };
}
