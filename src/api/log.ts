import { DrizzleQueryError } from "drizzle-orm";

const URL_CREDENTIALS = /\/\/[^/@\s]+@/g;

/**
 * Registra o erro sem dados sensíveis. A mensagem do DrizzleQueryError traz os
 * parâmetros da query, ou seja, dados pessoais: dela ficam só tipo e código.
 * Nos demais erros, a mensagem é mantida para diagnóstico, sem credenciais de URL.
 */
export function logError(context: string, error: unknown) {
  if (error instanceof DrizzleQueryError) {
    const { name, code } = (error.cause ?? {}) as { name?: string; code?: string };
    console.error(context, { name: name ?? error.name, code });
    return;
  }

  if (error instanceof Error) {
    const { code } = error as { code?: string };
    const message = error.message.replace(URL_CREDENTIALS, "//***@");
    console.error(context, { name: error.name, code, message });
    return;
  }

  console.error(context, { message: "Erro desconhecido." });
}
