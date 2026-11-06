/** Prefixo dos cookies da instância `auth`; a de portal (fase 8) usa outro. */
export const AUTH_COOKIE_PREFIX = "bizu";

/** Cabeçalho interno com o IP resolvido pela API. Nunca confie no valor do cliente. */
export const CLIENT_IP_HEADER = "x-bizu-client-ip";

/** Validade do convite de equipe: 48 h. */
export const INVITATION_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Até `platform_setting.max_tenants_per_user` (fase 5). */
export const MAX_TENANTS_PER_USER = 3;

/** Até `plan.limits.custom_roles` (fase 5). */
export const MAX_CUSTOM_ROLES = 20;
