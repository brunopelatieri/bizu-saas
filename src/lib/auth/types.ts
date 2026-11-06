export const PLATFORM_ROLES = [
  "user",
  "platform_owner",
  "platform_support",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

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
 * 2FA (fase 9) e tenant ativo (fase 4) ainda não existem.
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
