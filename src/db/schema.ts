import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// RLS ligado sem policies em todas as tabelas: o app (dono das tabelas) segue
// acessando normalmente e, no Postgres do Supabase, a Data API fica fechada.
// Permissões continuam na aplicação. Mantenha `.enableRLS()` nas tabelas novas.

export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
}).enableRLS();

/** Espelho local do Supabase Auth. Referencie `profiles.id` nas FKs da aplicação. */
export const profiles = pgTable("profiles", {
  // Mesmo valor de `user.id` no Supabase Auth; por isso não tem default.
  id: uuid("id").primaryKey(),
  email: text("email"),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type ContactMessage = typeof contactMessages.$inferSelect;
export type NewContactMessage = typeof contactMessages.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
