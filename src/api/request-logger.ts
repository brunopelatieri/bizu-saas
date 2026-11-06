import { logger } from "hono/logger";

const TOKEN_IN_QUERY = /([?&]token=)[^&\s]*/g;

/** Tira da linha de log os tokens de `/verificar-email` e `/redefinir-senha`. */
export function redactTokens(line: string) {
  return line.replace(TOKEN_IN_QUERY, "$1***");
}

/**
 * Log de requisições no lugar do padrão do `react-router-hono-server`, que grava a
 * URL inteira: um link de reset no log vale como senha por 1 hora.
 */
export const requestLogger = logger((message, ...rest) => {
  console.log(redactTokens(message), ...rest);
});
