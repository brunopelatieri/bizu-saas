import { createMiddleware } from "hono/factory";
import { logError } from "@/api/log";
import { consumeVerificationIssue } from "@/lib/auth/verification-issue";

export const INVALID_LINK_MESSAGE = "Link inválido ou expirado.";

export type VerificationGuardEnv = { Variables: { verificationToken: string } };

/**
 * Uso único e invalidação de links de e-mail, sem depender do formato do token.
 * Espera o corpo validado (`{ token }`). Sem emissão vigente com esse hash, responde
 * 400 e o Better Auth nem é chamado; com ela, a linha é consumida antes de seguir.
 * Falha do banco também não deixa passar.
 */
export function createVerificationGuard(
  consume: (token: string) => Promise<boolean>,
) {
  return createMiddleware<VerificationGuardEnv>(async (c, next) => {
    const { token } = (await c.req.json()) as { token: string };

    let accepted: boolean;

    try {
      accepted = await consume(token);
    } catch (error) {
      logError("Falha ao consumir link de verificação", error);
      return c.json({ error: "Autenticação indisponível." }, 503);
    }

    if (!accepted) return c.json({ error: INVALID_LINK_MESSAGE }, 400);

    c.set("verificationToken", token);
    await next();
  });
}

export const verificationGuard = createVerificationGuard(
  consumeVerificationIssue,
);
