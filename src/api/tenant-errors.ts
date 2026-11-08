import { isAPIError } from "better-auth/api";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { logError } from "@/api/log";
import { ROLE_IN_USE, TenantRuleError } from "@/lib/tenant/errors";

type Translated = {
  status: ContentfulStatusCode;
  code: string;
  message: string;
};

/** O plugin responde em inglês: a API devolve o texto e o status daqui. */
const PLUGIN_ERRORS: Record<string, Translated> = {
  ORGANIZATION_ALREADY_EXISTS: {
    status: 409,
    code: "SLUG_TAKEN",
    message: "Este identificador já está em uso.",
  },
  YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS: {
    status: 403,
    code: "TENANT_LIMIT_REACHED",
    message: "Você atingiu o limite de organizações.",
  },
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: {
    status: 409,
    code: "ALREADY_MEMBER",
    message: "Esta pessoa já faz parte da organização.",
  },
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: {
    status: 409,
    code: "ALREADY_INVITED",
    message: "Esta pessoa já tem um convite pendente.",
  },
  INVITATION_NOT_FOUND: {
    status: 404,
    code: "NOT_FOUND",
    message: "Convite inválido ou expirado.",
  },
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: {
    status: 403,
    code: "WRONG_RECIPIENT",
    message: "Este convite é para outro e-mail.",
  },
  INVITATION_LIMIT_REACHED: {
    status: 403,
    code: "INVITATION_LIMIT_REACHED",
    message: "A organização atingiu o limite de convites pendentes.",
  },
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: {
    status: 403,
    code: "MEMBER_LIMIT_REACHED",
    message: "A organização atingiu o limite de membros.",
  },
  ROLE_NAME_IS_ALREADY_TAKEN: {
    status: 409,
    code: "ROLE_NAME_TAKEN",
    message: "Já existe um papel com este nome.",
  },
  ROLE_IS_ASSIGNED_TO_MEMBERS: ROLE_IN_USE,
  TOO_MANY_ROLES: {
    status: 400,
    code: "TOO_MANY_ROLES",
    message: "A organização atingiu o limite de papéis personalizados.",
  },
};

function errorCode(error: unknown) {
  const body = (error as { body?: { code?: unknown } }).body;
  return typeof body?.code === "string" ? body.code : undefined;
}

/** `onError` das rotas de tenant. Nada interno chega ao cliente. */
export function handleTenantError(error: Error, c: Context) {
  if (error instanceof TenantRuleError) {
    return c.json(
      { ...error.details, error: error.message, code: error.code },
      error.status,
    );
  }

  if (isAPIError(error)) {
    const code = errorCode(error);
    const known = code ? PLUGIN_ERRORS[code] : undefined;

    if (known) {
      return c.json({ error: known.message, code: known.code }, known.status);
    }

    if (error.statusCode < 500) {
      return c.json(
        { error: "Não foi possível concluir a solicitação.", code },
        error.statusCode as ContentfulStatusCode,
      );
    }
  }

  logError("Falha na rota de tenant", error);
  return c.json({ error: "Não foi possível concluir. Tente novamente." }, 500);
}
