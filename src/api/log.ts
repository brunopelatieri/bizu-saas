/**
 * Registra só o tipo e o código do erro. Mensagens de erro podem carregar dados
 * sensíveis: o DrizzleQueryError inclui os parâmetros da query, e um
 * ERR_INVALID_URL traz a connection string com a senha.
 */
export function logError(context: string, error: unknown) {
  const root =
    error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const { name, code } = (root ?? {}) as { name?: string; code?: string };

  console.error(context, { name, code });
}
