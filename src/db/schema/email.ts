import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tabelas de e-mail são da plataforma: não têm `tenant_id` nem RLS.
 * Nenhuma guarda o corpo da mensagem nem o endereço em claro, só o sha256
 * (`hashEmail` em `src/lib/email/hash.ts`).
 */

export const emailMessageStatuses = [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
] as const;
export type EmailMessageStatus = (typeof emailMessageStatuses)[number];

export const emailMessages = pgTable(
  "email_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** sha256 do destinatário normalizado (minúsculas, sem espaços). */
    toHash: text("to_hash").notNull(),
    /** Nome do template (tag `template` da mensagem) ou `custom`. */
    template: text("template").notNull(),
    /** `smtp`, `resend`… Preenchido quando o job escolhe o provedor. */
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    status: text("status", { enum: emailMessageStatuses })
      .notNull()
      .default("queued"),
    /** Último erro (`suppressed`, falha do provedor, motivo do bounce). */
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_message_provider_message_id_idx").on(table.providerMessageId),
    index("email_message_created_at_idx").on(table.createdAt),
  ],
);

export const emailSuppressionReasons = [
  "hard_bounce",
  "complaint",
  "manual",
] as const;
export type EmailSuppressionReason = (typeof emailSuppressionReasons)[number];

export const emailSuppressions = pgTable("email_suppression", {
  emailHash: text("email_hash").primaryKey(),
  reason: text("reason", { enum: emailSuppressionReasons }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export type EmailMessageRow = typeof emailMessages.$inferSelect;
export type EmailSuppressionRow = typeof emailSuppressions.$inferSelect;
