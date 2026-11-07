import { getLogger } from "@/lib/logger";
import { describeError, reportError } from "@/lib/observability";

/**
 * Registra o erro sem dados sensíveis, em JSON e com o `request_id` da requisição. A mensagem do
 * `DrizzleQueryError` traz os parâmetros da query, ou seja, dados pessoais: dela ficam só tipo e
 * código. Nos demais erros, a mensagem é mantida para diagnóstico, sem credenciais de URL nem
 * e-mails (`describeError`). Com `SENTRY_DSN`, o mesmo erro sanitizado vai ao Sentry.
 */
export function logError(context: string, error: unknown) {
  getLogger().error({ error: describeError(error) }, context);
  reportError(error, context);
}
