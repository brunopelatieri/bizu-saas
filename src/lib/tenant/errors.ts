import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Regra de negócio recusada. A API responde `{ error, code }` com este status. */
export class TenantRuleError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TenantRuleError";
  }
}

export const notFound = (message: string) =>
  new TenantRuleError(404, "NOT_FOUND", message);
