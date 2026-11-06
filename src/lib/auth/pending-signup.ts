import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { user } from "@/db/schema";

export const PENDING_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A senha é criada antes de o e-mail ser provado. Sem prazo, quem cadastra o e-mail de
 * outra pessoa deixa uma conta à espera: quando o dono clicar em um link, a senha do
 * atacante passa a valer. Por isso o cadastro pendente expira.
 */
export function isPendingSignupExpired(
  { emailVerified, createdAt }: { emailVerified: boolean; createdAt: Date },
  now = Date.now(),
) {
  return !emailVerified && now - createdAt.getTime() > PENDING_SIGNUP_TTL_MS;
}

/** Libera o e-mail: o próximo cadastro cria a conta do zero, com a senha de quem pediu. */
export async function purgeExpiredPendingSignup(email: string) {
  await getDb()
    .delete(user)
    .where(
      and(
        eq(user.email, email),
        eq(user.emailVerified, false),
        lt(user.createdAt, new Date(Date.now() - PENDING_SIGNUP_TTL_MS)),
      ),
    );
}
