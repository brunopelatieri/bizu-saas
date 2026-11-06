import { and, desc, eq, gt } from "drizzle-orm";
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
    .where(and(eq(session.userId, userId), gt(session.expiresAt, now)))
    .orderBy(desc(session.updatedAt));

  return rows.map(({ impersonatedBy, ...row }) => ({
    ...row,
    current: row.id === currentId,
    support: impersonatedBy !== null,
  }));
}

/** O token só existe aqui dentro, para a chamada do Better Auth. */
export async function findOwnSessionToken(userId: string, sessionId: string) {
  const [row] = await getDb()
    .select({ token: session.token })
    .from(session)
    .where(and(eq(session.id, sessionId), eq(session.userId, userId)));

  return row?.token ?? null;
}
