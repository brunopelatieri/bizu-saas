import { count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { member, user } from "@/db/schema";
import { PAGE_SIZE } from "@/lib/schemas/admin";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

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
      tenants: sql<number>`(select count(*)::int from ${member} where ${member.userId} = ${user.id})`,
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
