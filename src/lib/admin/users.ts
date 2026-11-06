import { escapeLike } from "@/lib/admin/tenants";
import { count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { withPlatformScope } from "@/db/rls";
import {
  customer,
  member,
  portalSession,
  portalUser,
  user,
} from "@/db/schema";
import { PAGE_SIZE } from "@/lib/schemas/admin";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";


/**
 * Usuários de equipe e da plataforma. `user` não tem RLS: quem chega aqui já passou por
 * `requirePlatform`. Não devolve nada além do que a tela mostra.
 */
export async function listUsers(input: { q?: string; page: number }) {
  const term = input.q ? `%${escapeLike(input.q)}%` : null;
  const where = term
    ? or(ilike(user.email, term), ilike(user.name, term))
    : undefined;

  const [totalRow] = await getDb().select({ total: count() }).from(user).where(where);
  const items = await getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      platformRole: user.role,
      emailVerified: user.emailVerified,
      banned: user.banned,
      banReason: user.banReason,
      // Com uma tabela só no `from`, o Drizzle tira o prefixo das colunas: `${user.id}`
      // viraria `id`, e dentro da subconsulta seria o da outra tabela.
      tenants: sql<number>`(select count(*)::int from ${member} where ${member.userId} = "user"."id")`,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(where)
    .orderBy(desc(user.createdAt))
    .limit(PAGE_SIZE)
    .offset((input.page - 1) * PAGE_SIZE);

  return { items, total: totalRow?.total ?? 0, pageSize: PAGE_SIZE };
}

/**
 * Clientes e leads. A contagem de tenants lê `customer`, com RLS, e por isso roda em
 * `withPlatformScope`. O número atravessa tenants, e só a plataforma o vê.
 */
export function listPortalUsers(input: { q?: string; page: number }) {
  const term = input.q ? `%${escapeLike(input.q)}%` : null;
  const where = term
    ? or(ilike(portalUser.email, term), ilike(portalUser.name, term))
    : undefined;

  return withPlatformScope("admin: lista usuários do portal", async (tx) => {
    const [totalRow] = await tx
      .select({ total: count() })
      .from(portalUser)
      .where(where);
    const items = await tx
      .select({
        id: portalUser.id,
        name: portalUser.name,
        email: portalUser.email,
        emailVerified: portalUser.emailVerified,
        tenants: sql<number>`(select count(*)::int from ${customer} where ${customer.portalUserId} = "portal_user"."id")`,
        sessions: sql<number>`(select count(*)::int from ${portalSession} where ${portalSession.userId} = "portal_user"."id" and ${portalSession.expiresAt} > now())`,
        createdAt: portalUser.createdAt,
      })
      .from(portalUser)
      .where(where)
      .orderBy(desc(portalUser.createdAt))
      .limit(PAGE_SIZE)
      .offset((input.page - 1) * PAGE_SIZE);

    return { items, total: totalRow?.total ?? 0, pageSize: PAGE_SIZE };
  });
}

/** Derruba todas as sessões do cliente. Ele entra de novo por um magic link. */
export async function revokePortalSessions(portalUserId: string) {
  const [target] = await getDb()
    .select({ id: portalUser.id })
    .from(portalUser)
    .where(eq(portalUser.id, portalUserId));

  if (!target) throw notFound("Usuário não encontrado.");

  await getDb()
    .delete(portalSession)
    .where(eq(portalSession.userId, portalUserId));
}

/**
 * Só se bane quem é usuário comum. O plugin não compara o papel do alvo: sem esta
 * checagem, um proprietário baniria outro, ou a si mesmo, e perderia o acesso ao admin.
 */
export async function assertBannable(targetId: string, actorId: string) {
  if (targetId === actorId) {
    throw new TenantRuleError(409, "SELF_BAN", "Você não pode banir a si mesmo.");
  }

  const [target] = await getDb()
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, targetId));

  if (!target) throw notFound("Usuário não encontrado.");

  if (target.role !== "user") {
    throw new TenantRuleError(
      403,
      "PLATFORM_USER_PROTECTED",
      "Usuários da plataforma não podem ser banidos por aqui.",
    );
  }
}
