import type { User } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";

function metadataText(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === "string" ? value : null;
}

/**
 * Espelha o usuário do Supabase Auth na tabela local `profiles`, dando às tabelas
 * da aplicação um alvo real de FK, em qualquer Postgres. Só grava se algo mudou.
 *
 * O Auth é a origem de `email`, `full_name` e `phone`: altere esses dados com
 * `supabase.auth.updateUser`. Campos próprios da aplicação devem ficar em colunas
 * que esta função não sobrescreve.
 * `user_metadata` é editável pelo próprio usuário: use só para exibição, nunca
 * para decidir permissões.
 */
export async function syncProfile(user: User) {
  const db = getDb();
  const values = {
    email: user.email ?? null,
    fullName: metadataText(user, "full_name"),
    phone: metadataText(user, "phone"),
  };

  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));

  if (
    existing &&
    existing.email === values.email &&
    existing.fullName === values.fullName &&
    existing.phone === values.phone
  ) {
    return existing;
  }

  const [profile] = await db
    .insert(profiles)
    .values({ id: user.id, ...values })
    .onConflictDoUpdate({
      target: profiles.id,
      set: { ...values, updatedAt: sql`now()` },
    })
    .returning();

  return profile;
}
