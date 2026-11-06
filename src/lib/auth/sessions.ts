import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { session } from "@/db/schema";

/**
 * Sessões da própria pessoa. O id é da linha, nunca o token: quem lê esta lista, inclusive
 * por XSS, não leva uma credencial. `listSessions` do Better Auth entregaria os tokens.
 * Sessão de suporte aparece marcada, para quem é dono da conta poder derrubá-la.
 */
export async function listOwnSessions(
  userId: string,
  currentId: string,
  now = new Date(),
) {
  const rows = await getDb()
    .select({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      impersonatedBy: session.impersonatedBy,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
    })
    .from(session)
    .where(
      and(
        eq(session.userId, userId),
        gt(session.expiresAt, now),
        or(
          isNull(session.impersonatedBy),
          gt(session.impersonationExpiresAt, now),
        ),
      ),
    )
    .orderBy(desc(session.updatedAt));

  return rows.map(({ impersonatedBy, ...row }) => ({
    ...row,
    current: row.id === currentId,
    support: impersonatedBy !== null,
  }));
}

/**
 * `expires_at` não limita a personificação: o `getSession` só deixa de renovar a sessão se o
 * cliente mandar o cookie `dont_remember`, e quem personifica pode simplesmente apagá-lo. O
 * teto fica numa coluna que o Better Auth não toca. Sem ele, a sessão não vale (falha fechada).
 */
export async function impersonationExpired(sessionId: string, now = new Date()) {
  const [row] = await getDb()
    .select({ limit: session.impersonationExpiresAt })
    .from(session)
    .where(eq(session.id, sessionId));

  if (row?.limit && row.limit > now) return false;

  await getDb().delete(session).where(eq(session.id, sessionId));
  return true;
}

/** O token só existe aqui dentro, para a chamada do Better Auth. */
export async function findOwnSessionToken(userId: string, sessionId: string) {
  const [row] = await getDb()
    .select({ token: session.token })
    .from(session)
    .where(and(eq(session.id, sessionId), eq(session.userId, userId)));

  return row?.token ?? null;
}
