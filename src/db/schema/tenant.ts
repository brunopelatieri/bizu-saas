import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Tenant e equipe: tabelas do plugin `organization` do Better Auth. Nomes seguem
 * `getAuthTables`; as chaves do módulo são os nomes de modelo que o adapter procura.
 * Não têm RLS (`spec-tenant-rbac.md`): são multi-tenant por natureza, e o isolamento
 * fica em `requireTenant` e nas regras de `src/lib/tenant/`.
 */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

const timestamps = {
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const tenantStatuses = [
  "active",
  "suspended",
  "deleting",
  "deleted",
] as const;
export type TenantStatus = (typeof tenantStatuses)[number];

export const tenantAccessModes = ["full", "read_only", "locked"] as const;
export type TenantAccessMode = (typeof tenantAccessModes)[number];

export const invitationStatuses = [
  "pending",
  "accepted",
  "rejected",
  "canceled",
] as const;

/** O tenant. */
export const organization = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  // O plugin grava JSON serializado.
  metadata: text("metadata"),
  status: text("status", { enum: tenantStatuses }).notNull().default("active"),
  accessMode: text("access_mode", { enum: tenantAccessModes })
    .notNull()
    .default("full"),
  settings: jsonb("settings").notNull().default({}),
  trialEndsAt: timestamptz("trial_ends_at"),
  deletedAt: timestamptz("deleted_at"),
  ...timestamps,
});

export const member = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Papéis separados por vírgula, como o plugin grava.
    role: text("role").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("member_organization_user_idx").on(
      table.organizationId,
      table.userId,
    ),
    index("member_user_id_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status", { enum: invitationStatuses })
      .notNull()
      .default("pending"),
    expiresAt: timestamptz("expires_at").notNull(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("invitation_email_status_idx").on(table.email, table.status),
    index("invitation_organization_id_idx").on(table.organizationId),
  ],
);

/** Papéis personalizados (dynamic access control do plugin). */
export const organizationRole = pgTable(
  "organization_role",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    // O plugin grava e relê JSON serializado (`JSON.parse`): em jsonb viraria uma
    // string dentro do JSON.
    permission: text("permission").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("organization_role_organization_role_idx").on(
      table.organizationId,
      table.role,
    ),
  ],
);
