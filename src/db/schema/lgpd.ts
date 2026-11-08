import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantPolicy } from "../tenant-policy";
import { organization } from "./tenant";

/**
 * LGPD (fase 10): consentimento, pedidos de exportação e de exclusão. Os três guardam ids de
 * quem pede, nunca nome nem e-mail: a pessoa é anonimizada e o registro de que ela consentiu,
 * pediu ou foi excluída continua valendo.
 */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const consentSubjectTypes = ["user", "portal_user"] as const;
export type ConsentSubjectType = (typeof consentSubjectTypes)[number];

export const consentKinds = ["terms", "privacy", "marketing"] as const;
export type ConsentKind = (typeof consentKinds)[number];

/** Uma linha por aceite ou revogação. O estado atual é a linha mais recente de cada `kind`. */
export const consentLog = pgTable(
  "consent_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: text("subject_type", { enum: consentSubjectTypes }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    kind: text("kind", { enum: consentKinds }).notNull(),
    version: text("version").notNull(),
    accepted: boolean("accepted").notNull(),
    // sha256(ip + AUDIT_SALT), como em `audit_log`.
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("consent_log_subject_idx").on(
      table.subjectType,
      table.subjectId,
      table.kind,
      table.createdAt,
    ),
  ],
);

export const deletionSubjectTypes = ["user", "portal_user", "tenant"] as const;
export type DeletionSubjectType = (typeof deletionSubjectTypes)[number];

export const deletionStatuses = [
  "pending",
  "canceled",
  "executed",
  "failed",
] as const;
export type DeletionStatus = (typeof deletionStatuses)[number];

/** `self`: a própria pessoa (ou o owner, para a organização). `platform`: pelo `/admin`. */
export const deletionOrigins = ["self", "platform"] as const;
export type DeletionOrigin = (typeof deletionOrigins)[number];

/**
 * O que o cancelamento precisa para desfazer o pedido da plataforma: o banimento anterior da
 * conta e o estado da organização antes da exclusão. `reason` é o motivo dado no `/admin`.
 */
export type DeletionMetadata = {
  wasBanned?: boolean;
  previousStatus?: "active" | "suspended";
  reason?: string;
};

/**
 * Pedido de exclusão com carência de 30 dias. `tenant_id` só existe quando o assunto é um
 * tenant (RLS); pedidos de pessoa ficam sem tenant e só se leem com `withPlatformScope`.
 */
export const deletionRequest = pgTable(
  "deletion_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: text("subject_type", { enum: deletionSubjectTypes }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    tenantId: uuid("tenant_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    requestedBy: uuid("requested_by").notNull(),
    scheduledFor: timestamptz("scheduled_for").notNull(),
    executedAt: timestamptz("executed_at"),
    status: text("status", { enum: deletionStatuses })
      .notNull()
      .default("pending"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    canceledAt: timestamptz("canceled_at"),
    // Cada lado só cancela o próprio pedido (`cancelDeletion`).
    origin: text("origin", { enum: deletionOrigins }).notNull().default("self"),
    metadata: jsonb("metadata").$type<DeletionMetadata>().notNull().default({}),
  },
  (table) => [
    // Um pedido em aberto por assunto: pedir de novo não agenda duas exclusões.
    uniqueIndex("deletion_request_pending_idx")
      .on(table.subjectType, table.subjectId)
      .where(sql`${table.status} = 'pending'`),
    index("deletion_request_due_idx").on(table.status, table.scheduledFor),
    tenantPolicy(),
  ],
).enableRLS();

export const exportStatuses = ["pending", "ready", "failed", "expired"] as const;
export type ExportStatus = (typeof exportStatuses)[number];

/** Resultado do job `lgpd.export`: o zip fica no `StorageProvider`, sob `file_key`. */
export const dataExport = pgTable(
  "data_export",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: text("subject_type", { enum: consentSubjectTypes }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    tenantId: uuid("tenant_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: exportStatuses }).notNull().default("pending"),
    fileKey: text("file_key"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    readyAt: timestamptz("ready_at"),
    expiresAt: timestamptz("expires_at"),
  },
  (table) => [
    // Um pedido pendente por pessoa.
    uniqueIndex("data_export_pending_idx")
      .on(table.subjectType, table.subjectId)
      .where(sql`${table.status} = 'pending'`),
    index("data_export_subject_idx").on(table.subjectType, table.subjectId),
    tenantPolicy(),
  ],
).enableRLS();
