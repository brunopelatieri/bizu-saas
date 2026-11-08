import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Regra de negócio recusada. A API responde `{ error, code }` com este status. */
export class TenantRuleError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    /** Campos extras da resposta (`{ error, code, ...details }`), como `tenants` do 409. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TenantRuleError";
  }
}

export const ROLE_IN_USE = new TenantRuleError(
  409,
  "ROLE_IN_USE",
  "Este papel está em uso por membros ou convites pendentes.",
);

export const notFound = (message: string) =>
  new TenantRuleError(404, "NOT_FOUND", message);
