import type { User } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";

/**
 * Espelha o usuário do Supabase Auth na tabela local `profiles`, dando às tabelas
 * da aplicação um alvo real de FK, em qualquer Postgres.
 *
 * Só grava se necessário. O e-mail segue o Auth; `full_name` é copiado na criação
 * e depois pertence à aplicação, para não sobrescrever edições locais.
 * `user_metadata` é editável pelo próprio usuário: use só para exibição, nunca
 * para decidir permissões.
 */
export async function syncProfile(user: User) {
  const db = getDb();
  const email = user.email ?? null;

  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));

  if (existing?.email === email) return existing;

  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;

  const [profile] = await db
    .insert(profiles)
    .values({ id: user.id, email, fullName })
    .onConflictDoUpdate({
      target: profiles.id,
      set: { email, updatedAt: sql`now()` },
    })
    .returning();

  return profile;
}
