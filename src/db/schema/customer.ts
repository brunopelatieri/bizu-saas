import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantPolicy } from "../tenant-policy";
import { portalUser } from "./portal-auth";
import { organization } from "./tenant";

export const customerStatuses = ["lead", "active", "blocked"] as const;
export type CustomerStatus = (typeof customerStatuses)[number];

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Cliente ou lead de um tenant. `status` é o portão do portal: só `active` entra. A mesma
 * pessoa (`portal_user`) pode ser cliente de vários tenants, com uma linha em cada.
 */
export const customer = pgTable(
  "customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    portalUserId: uuid("portal_user_id").references(() => portalUser.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    document: text("document"),
    status: text("status", { enum: customerStatuses })
      .notNull()
      .default("lead"),
    tags: text("tags").array().notNull().default([]),
    notes: text("notes"),
    invitedAt: timestamptz("invited_at"),
    lastLoginAt: timestamptz("last_login_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("customer_tenant_email_idx").on(table.tenantId, table.email),
    index("customer_portal_user_id_idx").on(table.portalUserId),
    tenantPolicy(),
  ],
).enableRLS();
