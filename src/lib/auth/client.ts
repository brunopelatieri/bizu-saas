import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Cliente do Better Auth no navegador. Mesma origem da API; nada aqui é segredo. */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [adminClient()],
});

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_NOT_VERIFIED: "Confirme seu e-mail para entrar.",
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  INVALID_EMAIL: "Informe um e-mail válido.",
  INVALID_PASSWORD: "E-mail ou senha incorretos.",
  PASSWORD_TOO_SHORT: "A senha é curta demais.",
  PASSWORD_TOO_LONG: "A senha é longa demais.",
  INVALID_TOKEN: "Link inválido ou expirado.",
  BANNED_USER: "Esta conta está suspensa. Fale com o suporte.",
};

type AuthErrorBody = {
  status?: number;
  code?: string;
  /** Rotas próprias da API respondem `{ error }`, já em português. */
  error?: string;
};

export class AuthActionError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AuthActionError";
  }
}

/** O Better Auth responde em inglês: a interface mostra sempre o texto daqui. */
export function toAuthActionError({ status, code, error }: AuthErrorBody) {
  if (status === 429) {
    return new AuthActionError("Muitas tentativas. Tente mais tarde.", code, status);
  }

  const known = code ? AUTH_ERROR_MESSAGES[code] : undefined;

  return new AuthActionError(
    known ?? error ?? "Não foi possível concluir. Tente novamente.",
    code,
    status,
  );
}
