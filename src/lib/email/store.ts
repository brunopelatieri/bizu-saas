import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  type EmailMessageStatus,
  type EmailSuppressionReason,
  emailMessages,
  emailSuppressions,
} from "@/db/schema";
import { hashEmail } from "@/lib/email/address";
import { canAdvance, statusesBelow } from "@/lib/email/status";
import type { EmailEvent } from "@/lib/email/types";

/**
 * Persistência do e-mail: `email_message` (auditoria, sem corpo) e
 * `email_suppression` (bloqueio de envio). O job e o webhook falam com esta
 * interface; testes sem banco usam `createMemoryEmailStore()`.
 */
export interface EmailStore {
  createMessage(input: { toHash: string; template: string }): Promise<{ id: string }>;
  getStatus(id: string): Promise<EmailMessageStatus | undefined>;
  isSuppressed(emailHash: string): Promise<boolean>;
  suppress(emailHash: string, reason: EmailSuppressionReason): Promise<void>;
  markSent(
    id: string,
    input: { provider: string; providerMessageId: string },
  ): Promise<void>;
  /** Falha definitiva (supressão, retries esgotados). */
  markFailed(id: string, error: string): Promise<void>;
  /** Falha de uma tentativa; o status continua `queued` enquanto houver retry. */
  recordAttemptError(id: string, error: string): Promise<void>;
  /** Aplica `delivered`/`bounced`/`complained` do provedor e cria a supressão devida. */
  applyEvent(event: EmailEvent): Promise<void>;
}

const EVENT_STATUS = {
  delivered: "delivered",
  bounced: "bounced",
  complained: "complained",
} as const satisfies Record<EmailEvent["type"], EmailMessageStatus>;

/** Hard bounce e reclamação suprimem o endereço; bounce transitório, não. */
export function suppressionFor(
  event: EmailEvent,
): EmailSuppressionReason | undefined {
  if (event.type === "complained") return "complaint";
  if (event.type === "bounced" && event.permanent) return "hard_bounce";
  return undefined;
}

const MAX_ERROR_LENGTH = 500;

/** Remove endereços de e-mail do texto de erro e limita o tamanho antes de gravar. */
export function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[^\s<>"']+@[^\s<>"']+/g, "[e-mail]")
    .slice(0, MAX_ERROR_LENGTH);
}

export function createDrizzleEmailStore(): EmailStore {
  const store: EmailStore = {
    async createMessage({ toHash, template }) {
      const [row] = await getDb()
        .insert(emailMessages)
        .values({ toHash, template })
        .returning({ id: emailMessages.id });
      if (!row) throw new Error("email_message não foi criada.");
      return row;
    },

    async getStatus(id) {
      const [row] = await getDb()
        .select({ status: emailMessages.status })
        .from(emailMessages)
        .where(eq(emailMessages.id, id));
      return row?.status;
    },

    async isSuppressed(emailHash) {
      const [row] = await getDb()
        .select({ emailHash: emailSuppressions.emailHash })
        .from(emailSuppressions)
        .where(eq(emailSuppressions.emailHash, emailHash));
      return row !== undefined;
    },

    async suppress(emailHash, reason) {
      await getDb()
        .insert(emailSuppressions)
        .values({ emailHash, reason })
        .onConflictDoNothing();
    },

    async markSent(id, { provider, providerMessageId }) {
      await getDb()
        .update(emailMessages)
        .set({
          status: "sent",
          provider,
          providerMessageId,
          error: null,
          sentAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(emailMessages.id, id), eq(emailMessages.status, "queued")));
    },

    async markFailed(id, error) {
      await getDb()
        .update(emailMessages)
        .set({ status: "failed", error, updatedAt: sql`now()` })
        .where(and(eq(emailMessages.id, id), eq(emailMessages.status, "queued")));
    },

    async recordAttemptError(id, error) {
      await getDb()
        .update(emailMessages)
        .set({ error, updatedAt: sql`now()` })
        .where(and(eq(emailMessages.id, id), eq(emailMessages.status, "queued")));
    },

    async applyEvent(event) {
      const status = EVENT_STATUS[event.type];
      await getDb()
        .update(emailMessages)
        .set({
          status,
          ...(event.reason ? { error: sanitizeError(event.reason) } : {}),
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(emailMessages.providerMessageId, event.providerMessageId),
            inArray(emailMessages.status, statusesBelow(status)),
          ),
        );

      const reason = suppressionFor(event);
      if (reason) await store.suppress(hashEmail(event.recipient), reason);
    },
  };

  return store;
}

export type MemoryEmailMessage = {
  id: string;
  toHash: string;
  template: string;
  provider?: string;
  providerMessageId?: string;
  status: EmailMessageStatus;
  error?: string;
};

export type MemoryEmailStore = EmailStore & {
  messages: MemoryEmailMessage[];
  suppressions: Map<string, EmailSuppressionReason>;
};

/** Store em memória para testes sem banco. */
export function createMemoryEmailStore(): MemoryEmailStore {
  const messages: MemoryEmailMessage[] = [];
  const suppressions = new Map<string, EmailSuppressionReason>();
  const find = (id: string) => messages.find((m) => m.id === id);

  const store: MemoryEmailStore = {
    messages,
    suppressions,
    async createMessage({ toHash, template }) {
      const id = `mem-${messages.length + 1}`;
      messages.push({ id, toHash, template, status: "queued" });
      return { id };
    },
    async getStatus(id) {
      return find(id)?.status;
    },
    async isSuppressed(emailHash) {
      return suppressions.has(emailHash);
    },
    async suppress(emailHash, reason) {
      if (!suppressions.has(emailHash)) suppressions.set(emailHash, reason);
    },
    async markSent(id, { provider, providerMessageId }) {
      const message = find(id);
      if (message?.status !== "queued") return;
      Object.assign(message, {
        status: "sent",
        provider,
        providerMessageId,
        error: undefined,
      });
    },
    async markFailed(id, error) {
      const message = find(id);
      if (message?.status === "queued") {
        Object.assign(message, { status: "failed", error });
      }
    },
    async recordAttemptError(id, error) {
      const message = find(id);
      if (message?.status === "queued") message.error = error;
    },
    async applyEvent(event) {
      const status = EVENT_STATUS[event.type];
      const message = messages.find(
        (m) => m.providerMessageId === event.providerMessageId,
      );
      if (message && canAdvance(message.status, status)) {
        message.status = status;
        if (event.reason) message.error = sanitizeError(event.reason);
      }
      const reason = suppressionFor(event);
      if (reason) await store.suppress(hashEmail(event.recipient), reason);
    },
  };

  return store;
}
