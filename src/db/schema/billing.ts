import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  type PaymentProviderId,
  type PriceInterval,
  paymentProviderIds,
  priceIntervals,
} from "../../lib/billing/constants";
import { tenantPolicy } from "../tenant-policy";
import { user } from "./auth";
import { organization } from "./tenant";

/**
 * Planos e assinatura. `plan`, `plan_price` e `platform_setting` são da plataforma (sem
 * `tenant_id`, sem RLS): quem os edita é `/api/admin/*`, atrás de `requirePlatform`.
 * `subscription` e `subscription_event` são de tenant, com RLS.
 *
 * A fase 5 só grava `trialing`, `active` e `expired`. A máquina de estados completa
 * (checkout, webhooks, `past_due`...) e as colunas do provedor são da fase 6.
 */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

const timestamps = {
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export type { PaymentProviderId, PriceInterval };

/** Limites do plano. Chave ausente ou `null` = ilimitado. */
export type PlanLimits = {
  members?: number | null;
  customers?: number | null;
  storage_mb?: number | null;
  custom_roles?: number | null;
};

export const plan = pgTable(
  "plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    limits: jsonb("limits").$type<PlanLimits>().notNull().default({}),
    features: text("features").array().notNull().default([]),
    isFree: boolean("is_free").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [index("plan_active_sort_idx").on(table.active, table.sortOrder)],
);

export const planPrice = pgTable(
  "plan_price",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: paymentProviderIds }).notNull(),
    interval: text("interval", { enum: priceIntervals }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("BRL"),
    // Id do preço no provedor (Stripe `price_...`); preenchido à mão em /admin/planos.
    providerPriceRef: text("provider_price_ref"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    // Um preço por provedor e intervalo.
    uniqueIndex("plan_price_plan_provider_interval_idx").on(
      table.planId,
      table.provider,
      table.interval,
    ),
  ],
);

/** Configurações da plataforma, uma chave por linha (`src/lib/billing/settings.ts`). */
export const platformSetting = pgTable("platform_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const subscriptionStatuses = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
  "canceled",
  "expired",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

/** Estado por controle interno: avisos de trial já enviados etc. Nunca dado pessoal. */
export type SubscriptionMetadata = {
  trialNotices?: Partial<Record<string, string>>;
};

export const subscription = pgTable(
  "subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "restrict" }),
    planPriceId: uuid("plan_price_id").references(() => planPrice.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: subscriptionStatuses }).notNull(),
    provider: text("provider", { enum: paymentProviderIds }),
    providerCustomerRef: text("provider_customer_ref"),
    providerSubscriptionRef: text("provider_subscription_ref"),
    trialEndsAt: timestamptz("trial_ends_at"),
    currentPeriodStart: timestamptz("current_period_start"),
    currentPeriodEnd: timestamptz("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamptz("canceled_at"),
    graceUntil: timestamptz("grace_until"),
    pendingPlanId: uuid("pending_plan_id").references(() => plan.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<SubscriptionMetadata>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    // Uma assinatura por tenant.
    uniqueIndex("subscription_tenant_id_idx").on(table.tenantId),
    index("subscription_status_trial_idx").on(table.status, table.trialEndsAt),
    index("subscription_plan_id_idx").on(table.planId),
    tenantPolicy(),
  ],
).enableRLS();

export const subscriptionEventSources = [
  "webhook",
  "admin",
  "job",
  "owner",
  "system",
] as const;
export type SubscriptionEventSource = (typeof subscriptionEventSources)[number];

/** Histórico de transições. Toda mudança de `subscription.status` grava uma linha. */
export const subscriptionEvent = pgTable(
  "subscription_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscription.id, { onDelete: "cascade" }),
    fromStatus: text("from_status", { enum: subscriptionStatuses }),
    toStatus: text("to_status", { enum: subscriptionStatuses }).notNull(),
    reason: text("reason").notNull(),
    source: text("source", { enum: subscriptionEventSources }).notNull(),
    // `payment_event` chega na fase 6.
    paymentEventId: uuid("payment_event_id"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("subscription_event_subscription_idx").on(
      table.subscriptionId,
      table.createdAt,
    ),
    index("subscription_event_tenant_idx").on(table.tenantId),
    tenantPolicy(),
  ],
).enableRLS();
