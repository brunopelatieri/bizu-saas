import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantPolicy } from "../tenant-policy";
import { user } from "./auth";
import { organization } from "./tenant";

/** Personificação, rate limit compartilhado e credenciais cifradas (fase 9). */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Consentimento do owner para o suporte entrar no tenant. Vale até `expires_at` ou
 * `revoked_at`, para mais de uma entrada no período; `used_by` guarda quem usou por último,
 * e o histórico completo fica em `audit_log`.
 */
export const impersonationGrant = pgTable(
  "impersonation_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    scope: text("scope", { enum: ["tenant"] }).notNull().default("tenant"),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
    usedBy: uuid("used_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("impersonation_grant_tenant_expires_idx").on(
      table.tenantId,
      table.expiresAt,
    ),
    tenantPolicy(),
  ],
).enableRLS();

/**
 * Credencial de provedor por tenant, para o fluxo (b), ainda sem tela. `encrypted_secret`
 * guarda o texto de `encryptSecret` (`src/lib/crypto/secrets.ts`).
 */
export const tenantPaymentCredential = pgTable(
  "tenant_payment_credential",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    encryptedSecret: bytea("encrypted_secret").notNull(),
    keyVersion: integer("key_version").notNull(),
    label: text("label").notNull(),
    sandbox: boolean("sandbox").notNull().default(false),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("tenant_payment_credential_tenant_idx").on(table.tenantId),
    tenantPolicy(),
  ],
).enableRLS();

/** Contadores de `RATE_LIMIT_STORE=postgres`, com a janela alinhada ao relógio. */
export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    key: text("key").notNull(),
    windowStart: timestamptz("window_start").notNull(),
    count: integer("count").notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    index("rate_limit_bucket_window_start_idx").on(table.windowStart),
  ],
);
