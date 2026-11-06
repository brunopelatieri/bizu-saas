/** Prefixo dos cookies da instância `auth`. */
export const AUTH_COOKIE_PREFIX = "bizu";

/** Prefixo dos cookies da instância `portalAuth`: um nunca vale pelo outro. */
export const PORTAL_COOKIE_PREFIX = "bizu_portal";

export const PORTAL_AUTH_BASE_PATH = "/api/portal/auth";

/** Link de login pedido em `/portal/login`: 10 min. */
export const PORTAL_MAGIC_LINK_TTL_SECONDS = 10 * 60;

/** Link de convite enviado pelo owner: 48 h. */
export const PORTAL_INVITE_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Cabeçalho interno com o IP resolvido pela API. Nunca confie no valor do cliente. */
export const CLIENT_IP_HEADER = "x-bizu-client-ip";

/** "Confiar neste dispositivo" no desafio de 2FA: 30 dias. */
export const TRUST_DEVICE_SECONDS = 30 * 24 * 60 * 60;

/** Validade do convite de equipe: 48 h. */
export const INVITATION_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Teto fixo do plugin; ainda não vem de `platform_setting` (`spec.md`, fase 5). */
export const MAX_TENANTS_PER_USER = 3;

/** Teto fixo do plugin; `plan.limits.custom_roles` vale abaixo dele, em `POST /api/roles`. */
export const MAX_CUSTOM_ROLES = 20;
