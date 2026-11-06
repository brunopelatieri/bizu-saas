import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./tenant";

/**
 * Tabelas da instância `portalAuth` (clientes e leads), separadas das de equipe em
 * `auth.ts`. Seguem `getAuthTables`, com `uuid` e `timestamptz`, sem `role` nem `ban`. Não
 * têm RLS (`spec-tenant-rbac.md`): a identidade do cliente atravessa tenants, e o vínculo
 * com cada um fica em `customer`.
 */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

const timestamps = {
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const portalUser = pgTable("portal_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  phone: text("phone"),
  locale: text("locale"),
  ...timestamps,
});

export const portalSession = pgTable(
  "portal_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => portalUser.id, { onDelete: "cascade" }),
    expiresAt: timestamptz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // O tenant vem daqui, nunca da URL. Quem autoriza é `customer`, a cada requisição.
    activeTenantId: uuid("active_tenant_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [index("portal_session_user_id_idx").on(table.userId)],
);

export const portalAccount = pgTable(
  "portal_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => portalUser.id, { onDelete: "cascade" }),
    // Só `credential`: o portal não tem login social.
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    ...timestamps,
  },
  (table) => [
    index("portal_account_user_id_idx").on(table.userId),
    uniqueIndex("portal_account_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

/** Magic links, em hash (`storeToken: "hashed"`, `storeIdentifier: "hashed"`). */
export const portalVerification = pgTable(
  "portal_verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    ...timestamps,
  },
  (table) => [index("portal_verification_identifier_idx").on(table.identifier)],
);

/** Contadores de `rateLimit.storage: "database"`. */
export const portalRateLimit = pgTable("portal_rate_limit", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
